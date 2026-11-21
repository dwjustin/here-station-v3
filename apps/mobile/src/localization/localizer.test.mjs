import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalizer } from './localizer.ts';
import { createMapGrid } from '../navigation/mapGrid.ts';
import { rectLeg } from '../navigation/fixtures.mjs';

const DEG = Math.PI / 180;
// 40m × 2m 통로 (x 0~40, z 0~2)
const corridor = createMapGrid(rectLeg({ cols: 160, rows: 8 }));
const frame = (t, x, z, yawDeg = 0, tracking = 'normal', y = 0) => ({ t, x, y, z, yawDeg, tracking });

test('pose is null before reset and heading is null before the first AR frame', () => {
  const loc = createLocalizer(corridor);
  assert.equal(loc.pose(), null);
  loc.arFrame(frame(0, 0, 0));
  assert.equal(loc.pose(), null);
  loc.reset({ x: 1, z: 1, h: 0 }, 90);
  assert.equal(loc.pose().cameraHeadingDeg, null);
  assert.equal(loc.pose().trackingStatus, 'unavailable');
});

test('straight corridor with AR frames stays within 0.5 m', () => {
  const loc = createLocalizer(corridor, { seed: 7 });
  loc.reset({ x: 1, z: 1, h: 0 }, 90); // 동쪽을 보고 출발
  // AR 전방(-z)으로 1.4m/s, 30fps, 20초 = 28m
  let maxErr = 0;
  for (let i = 0; i <= 600; i++) {
    const t = i / 30;
    loc.arFrame(frame(t, 0, -1.4 * t));
    const p = loc.pose();
    maxErr = Math.max(maxErr, Math.hypot(p.position.x - (1 + 1.4 * t), p.position.z - 1));
  }
  assert.ok(maxErr < 0.5, `max error ${maxErr}`);
  // 입자 방위 치우침 평균이 더해지므로 정확히 90°는 아니다
  assert.ok(Math.abs(loc.pose().cameraHeadingDeg - 90) < 2, `${loc.pose().cameraHeadingDeg}`);
  assert.equal(loc.pose().trackingStatus, 'tracking');
});

test('reset heading offset maps AR bearings onto the map', () => {
  const room = createMapGrid(rectLeg({ cols: 40, rows: 40 })); // 10m × 10m
  const loc = createLocalizer(room, { seed: 3 });
  loc.reset({ x: 5, z: 2, h: 0 }, 180); // 남쪽을 보고 선다
  // AR 방위 45°로 서 있다가 그 방향으로 3m 걷는다 → 지도 남쪽(+z)으로 3m
  for (let i = 0; i <= 90; i++) {
    const d = (3 * i) / 90;
    loc.arFrame(frame(i / 30, d * Math.sin(45 * DEG), -d * Math.cos(45 * DEG), 45));
  }
  const p = loc.pose();
  assert.ok(Math.hypot(p.position.x - 5, p.position.z - 5) < 0.3, JSON.stringify(p.position));
  assert.ok(Math.abs(p.cameraHeadingDeg - 180) < 2, `${p.cameraHeadingDeg}`);
});

test('AR height jump keeps the learned heading bias', () => {
  // 방위 10° 틀어진 채 8초 걸어 치우침을 배운 뒤 AR y가 0.5m 튄다.
  // limited 뒤: 높이 기준을 다시 맞춰 입자가 안 버려진다. 정상 중: 모두 버려져도 다시 뿌릴 때 치우침을 지킨다
  for (const between of ['limited', 'normal']) {
    const loc = createLocalizer(corridor, { seed: 7 });
    loc.reset({ x: 1, z: 1, h: 0 }, 90);
    const f = (t, y, tracking = 'normal') => frame(t, 1.4 * t * Math.sin(10 * DEG), -1.4 * t * Math.cos(10 * DEG), 0, tracking, y);
    let t = 0;
    for (; t <= 8; t += 1 / 30) loc.arFrame(f(t, 0));
    const before = loc.pose().cameraHeadingDeg;
    for (let k = 0; k < 3; k++) loc.arFrame(f((t += 0.2), 0, between));
    loc.arFrame(f((t += 0.2), 0.5));
    loc.arFrame(f((t += 1 / 30), 0.5));
    assert.ok(Math.abs(loc.pose().cameraHeadingDeg - before) < 1, `${between}: ${before} → ${loc.pose().cameraHeadingDeg}`);
  }
});

test('PDR steps do not climb an unlinked 0.5 m ledge', () => {
  // 10m × 2m, x 5m부터 50cm 높은 턱(서버라면 잇지 않는 높이 차)
  const leg = rectLeg({ cols: 40, rows: 8 });
  leg.h = leg.h.map((_, i) => (leg.cells[i] % 40 >= 20 ? 50 : 0));
  const loc = createLocalizer(createMapGrid(leg), { seed: 5 });
  loc.reset({ x: 2, z: 1, h: 0 }, 90);
  for (let i = 0; i <= 30; i++) {
    loc.arFrame(frame(i / 30, 0, 0));
    if (i % 15 === 0) loc.step({ t: i / 30, lengthM: 0.7, headingDeg: 0 });
  }
  for (let k = 1; k <= 8; k++) {
    const t = 1 + k * 0.5;
    loc.arFrame(frame(t, 0, 0, 0, 'limited'));
    loc.step({ t, lengthM: 0.7, headingDeg: 0 });
  }
  const p = loc.pose().position;
  assert.ok(p.x < 5 && p.h === 0, JSON.stringify(p));
});

test('motion into a wall keeps the estimate on the walkable grid', () => {
  const loc = createLocalizer(corridor, { seed: 11 });
  loc.reset({ x: 5, z: 1, h: 0 }, 180); // 남쪽 벽(z = 2)을 본다
  for (let i = 0; i <= 90; i++) {
    loc.arFrame(frame(i / 30, 0, -3 * (i / 90))); // 남쪽으로 3m 밀어붙인다
    const { x, z, h } = loc.pose().position;
    assert.notEqual(corridor.lookup(x, z, h), null, `off grid at ${x}, ${z}`);
  }
  assert.ok(loc.pose().position.z < 2);
});

test('PDR steps move the estimate while AR tracking is limited', () => {
  const loc = createLocalizer(corridor, { seed: 5 });
  loc.reset({ x: 2, z: 1, h: 0 }, 90);
  // AR 정상 구간: 기기 방위 0°인 걸음이 지도 90°임을 배운다 (위치는 AR이 맡음)
  for (let i = 0; i <= 30; i++) {
    loc.arFrame(frame(i / 30, 0, 0));
    if (i % 15 === 0) loc.step({ t: i / 30, lengthM: 0.7, headingDeg: 0 });
  }
  assert.ok(Math.abs(loc.pose().position.x - 2) < 0.3);
  // 추적 제한: AR 위치는 엉터리, 걸음으로만 동쪽 7m
  for (let k = 1; k <= 10; k++) {
    const t = 1 + k * 0.5;
    loc.arFrame(frame(t, 100 * k, -50 * k, 0, 'limited'));
    loc.step({ t, lengthM: 0.7, headingDeg: 0 });
    assert.equal(loc.pose().trackingStatus, 'tracking');
  }
  const p = loc.pose().position;
  assert.ok(Math.abs(p.x - 9) < 0.7 && Math.abs(p.z - 1) < 0.6, JSON.stringify(p));
  // 걸음도 AR도 없이 2초가 지나면 추적 불가
  loc.arFrame(frame(9, 0, 0, 0, 'limited'));
  assert.equal(loc.pose().trackingStatus, 'unavailable');
});

test('PDR takes over when AR frames stop for more than 1 s', () => {
  const loc = createLocalizer(corridor, { seed: 9 });
  loc.reset({ x: 2, z: 1, h: 0 }, 90);
  loc.arFrame(frame(0, 0, 0));
  loc.step({ t: 0.5, lengthM: 0.7, headingDeg: 20 }); // AR 정상 → 위치는 그대로, 방위 차만 배움
  for (let k = 1; k <= 5; k++) loc.step({ t: 1 + k * 0.5, lengthM: 0.7, headingDeg: 20 });
  assert.ok(Math.abs(loc.pose().position.x - 5.5) < 0.6, JSON.stringify(loc.pose().position));
  assert.ok(Math.abs(loc.pose().cameraHeadingDeg - 90) < 5, `${loc.pose().cameraHeadingDeg}`);
  // 오른쪽으로 90° 돌면 화살표용 카메라 방위도 걸음 방위를 따라 남쪽이 된다 (멈춘 AR 방위가 아니라)
  loc.step({ t: 4, lengthM: 0.3, headingDeg: 110 });
  assert.equal(loc.pose().trackingStatus, 'tracking');
  assert.ok(Math.abs(loc.pose().cameraHeadingDeg - 180) < 5, `${loc.pose().cameraHeadingDeg}`);
});

test('estimate stays on a walkable cell when particles split around a wall', () => {
  // 3m × 10m 방, 가운데 x 1~2m 세로 벽 → 왼쪽·오른쪽 통로
  const room = rectLeg({ cols: 12, rows: 40 });
  const keep = [...room.cells].map((c) => c % 12 < 4 || c % 12 >= 8);
  for (const key of ['cells', 'h', 'direction']) room[key] = room[key].filter((_, i) => keep[i]);
  const grid = createMapGrid(room);
  const loc = createLocalizer(grid, { seed: 2, n: 400 });
  loc.reset({ x: 1.5, z: 1, h: 0 }, 180); // 벽 위에 뿌려 양쪽 통로에 갈린 입자만 살아남게 한다
  loc.arFrame(frame(0, 0, 0));
  loc.arFrame(frame(0.1, 0, -0.05));
  const { x, z, h } = loc.pose().position;
  assert.notEqual(grid.lookup(x, z, h), null, `off grid at ${x}, ${z}`);
});

test('AR height drops particles on a strip 0.45 m above the walked floor', () => {
  // 40m × 2m 통로의 북쪽 절반(z 0~1)이 0.45m 높은 띠 (홍제 계단 옆 난간 윗면처럼). AR 높이는 그대로인 채 동쪽으로 걷는다
  const leg = rectLeg({ cols: 160, rows: 8 });
  leg.h = leg.h.map((_, i) => (Math.floor(leg.cells[i] / 160) < 4 ? 45 : 0));
  const loc = createLocalizer(createMapGrid(leg), { seed: 4 });
  loc.reset({ x: 1, z: 1, h: 0 }, 90); // 경계에 뿌려 절반은 띠 위에 떨어진다
  for (let i = 0; i <= 150; i++) loc.arFrame(frame(i / 30, 0, -1.4 * (i / 30)));
  const p = loc.pose().position;
  assert.ok(p.z > 1.2 && p.h === 0, JSON.stringify(p));
});

test('AR height drift of 2 % of distance is absorbed by the height offset', () => {
  const loc = createLocalizer(corridor, { seed: 6 });
  loc.reset({ x: 1, z: 1, h: 0 }, 90);
  let maxErr = 0;
  for (let i = 0; i <= 600; i++) {
    const t = i / 30;
    loc.arFrame(frame(t, 0, -1.4 * t, 0, 'normal', 0.02 * 1.4 * t)); // 28m 걸으며 높이가 0.56m 표류
    maxErr = Math.max(maxErr, Math.hypot(loc.pose().position.x - (1 + 1.4 * t), loc.pose().position.z - 1));
  }
  assert.ok(maxErr < 0.5, `max error ${maxErr}`);
  assert.equal(loc.pose().position.h, 0);
});

test('PDR steps do not jump a one-cell handrail between two parallel lanes', () => {
  // 20m 통로 두 줄: z 0~1(북)과 z 1.25~2.25(남), 사이 z 1~1.25 한 칸은 난간(보행 칸 아님)
  const leg = rectLeg({ cols: 80, rows: 9 });
  const keep = [...leg.cells].map((c) => Math.floor(c / 80) !== 4);
  for (const key of ['cells', 'h', 'direction']) leg[key] = leg[key].filter((_, i) => keep[i]);
  const grid = createMapGrid(leg);
  const loc = createLocalizer(grid, { seed: 8 });
  loc.reset({ x: 2, z: 0.5, h: 0 }, 90);
  loc.arFrame(frame(0, 0, 0));
  loc.step({ t: 0.5, lengthM: 0.7, headingDeg: 0 }); // AR 정상: 기기 0° = 지도 90°를 배운다
  // AR이 끊긴 채 난간 쪽(지도 125°)으로 0.7m씩 두 걸음. 끝점만 보면 남쪽 끝 입자가 난간 칸을 건너뛰어 남쪽 줄에 살아남는다
  for (let k = 1; k <= 2; k++) {
    loc.step({ t: 1.5 + k * 0.5, lengthM: 0.7, headingDeg: 35 });
    assert.ok(loc.pose().position.z < 1, `step ${k}: ${JSON.stringify(loc.pose().position)}`);
  }
});
