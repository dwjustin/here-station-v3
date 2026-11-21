import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { decodeLeg } from '../api/routes.ts';
import { rectLeg } from '../navigation/fixtures.mjs';
import { createLocalizer } from './localizer.ts';
import { createArrowStabilizer } from '../navigation/guidance.ts';
import { createMapGrid } from '../navigation/mapGrid.ts';
import { nextTripPhase } from '../navigation/trip.ts';
import { virtualWalk } from './virtualWalk.ts';

// tools/route-inspect/inspect_route.py가 만드는 실제 서버 응답 (data/는 gitignore, 로컬에만 있다)
const ROUTE_JSON = new URL('../../../../data/route-hongje-jamwon.json', import.meta.url);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** 한 구간을 걷는다: 가상 보행 프레임 → localizer → trip, 보행자는 localizer가 그린 화살표를 보고 걷는다. 구간이 끝나면(도착) 멈춘다 */
function walkLeg(leg, phase, goals, seed, maxSteps) {
  const grid = createMapGrid(leg);
  const loc = createLocalizer(grid, { seed });
  loc.reset(leg.start, leg.start.heading_deg);
  const errors = [];
  const samples = [];
  const arrow = createArrowStabilizer(grid);
  let t = 0;
  const arrowDeg = () => arrow(loc.pose(), t);
  for (const s of virtualWalk(grid, leg, { arrowDeg, seed, maxSteps })) {
    loc.arFrame(s.frame);
    t = s.frame.t;
    const pose = loc.pose();
    errors.push(Math.hypot(pose.position.x - s.truth.x, pose.position.z - s.truth.z));
    samples.push(s);
    const next = nextTripPhase(phase, { type: 'pose', pose }, goals);
    if (next !== phase) return { phase: next, errors, samples, steps: s.steps };
  }
  return { phase, errors, samples, steps: samples.at(-1)?.steps ?? 0 };
}

test('virtual walk on a synthetic corridor reaches the goal and is deterministic', () => {
  // 19m × 2m 막다른 통로, 화살표는 모두 동쪽보다 10° 남쪽(벽 쪽)으로 기울어 있다 → 보행자는 벽을 따라 비켜 가 남동 구석의 목적지에 닿는다
  const leg = rectLeg({ cols: 76, rows: 8, directionDeg: 100 });
  leg.start = { level: 'B1', x: 1, z: 1, h: 0, heading_deg: 100 };
  leg.goal = { level: 'B1', x: 18.5, z: 1.75, h: 0, arrival_radius: 1.5 };
  const grid = createMapGrid(leg);
  const goals = [leg.goal, leg.goal];
  const run = (seed) => walkLeg(leg, 'legA', goals, seed, 100);
  const r = run(4);
  assert.deepEqual(r, run(4));
  assert.notDeepEqual(r.samples.map((s) => s.frame.yawDeg), run(5).samples.map((s) => s.frame.yawDeg));
  for (const s of r.samples) assert.notEqual(grid.lookup(s.truth.x, s.truth.z, s.truth.h), null);
  // localizer가 임의 AR 기준 방위를 정렬해 실제 위치를 따라가고, 그 화살표만 보고 걸어 도착한다 (폰 방위 오차 3~12°는 벽이 잡아 준다)
  assert.equal(r.phase, 'onTrain');
  const last = r.samples.at(-1).truth;
  assert.ok(Math.hypot(last.x - 18.5, last.z - 1.75) <= 1.5, JSON.stringify(last));
  assert.ok(r.steps < 40, `${r.steps} steps`);
  assert.ok(quantile(r.errors, 0.9) < 1.0, `p90 ${quantile(r.errors, 0.9)}`);
});

// 이 20 seed는 모두 도착한다. 보행자는 추정 위치의 화살표를 따르므로 추정이 1m 넘게 어긋난 채 벽 앞에 서면 제자리를 맴돌 수 있다
// (60 seed에서 잠원 seed 28)
const MIN_ARRIVAL_RATE = 1.0;

test('full hongje -> jamwon trip with the real route', { skip: !existsSync(ROUTE_JSON) && 'data/route-hongje-jamwon.json 없음: backend/.venv/bin/python tools/route-inspect/inspect_route.py 로 만든다' }, () => {
  const legs = JSON.parse(readFileSync(ROUTE_JSON, 'utf8')).legs.map(decodeLeg);
  const goals = [legs[0].goal, legs[1].goal];
  // 구간 B는 하차 리셋으로 새로 시작하므로 구간 A 결과와 상관없이 따로 걷는다
  const runs = [
    { phase: 'legA', done: 'onTrain' },
    { phase: nextTripPhase('onTrain', { type: 'alighted' }, goals), done: 'arrived' },
  ];
  runs.forEach(({ phase, done }, i) => {
    const errors = [], steps = [], stuck = [];
    for (const seed of SEEDS) {
      const r = walkLeg(legs[i], phase, goals, seed);
      errors.push(...r.errors);
      if (r.phase === done) steps.push(r.steps);
      else stuck.push(seed);
    }
    const med = quantile(errors, 0.5), p90 = quantile(errors, 0.9);
    console.log(`${['hongje', 'jamwon'][i]}: ${steps.length}/${SEEDS.length} 도착 (미도착 seed ${stuck.join(',') || '없음'}), 오차 중앙값 ${med.toFixed(2)}m p90 ${p90.toFixed(2)}m 최대 ${Math.max(...errors).toFixed(2)}m, 걸음 ${Math.min(...steps)}~${Math.max(...steps)}`);
    assert.ok(steps.length >= MIN_ARRIVAL_RATE * SEEDS.length, `${['hongje', 'jamwon'][i]}: 미도착 seed ${stuck}`);
  });
});
