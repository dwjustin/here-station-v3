import type { LegGoal, LegStart } from '../api/routes.ts';
import type { ArFrame } from './localizer.ts';
import type { MapGrid } from '../navigation/mapGrid.ts';

type Point = { x: number; z: number; h: number };
/** 한 프레임: 폰이 내보낼 AR 프레임 + 보행자의 실제 위치(채점용) + 지금까지 걸음 수 */
export type WalkSample = { frame: ArFrame; truth: Point; steps: number };

const STEP_S = 0.5;
const STEP_M = 0.7;
const FRAMES_PER_STEP = 5; // 10fps. 프레임당 0.14m라 입자 끝점 검사가 0.25m 벽을 넘지 않는다
const STEP_NOISE_DEG = 5;
/** 문 앞 이 거리(m)에 서면 멈춘다. 앱이 도착을 먼저 알리면 소비하는 쪽이 거기서 그만 읽는다 */
const STOP_M = 0.5;
const PROBE_M = 0.125; // 걸음 도중 벽을 뚫지 않게 칸 절반 간격으로 확인
// 서버 보행 격자(backend/app/routing/grid.py)와 같은 이웃 높이 차 한계. 이보다 크면 난간 너머 다른 층이다
const MAX_PROBE_DH_M = 0.35;
const SIDESTEP_DEG = [15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 135, -135, 180];
// 45° 넘게 비켜 걸었으면 사람처럼 그 방향으로 몇 걸음 더 간다 (매 걸음 화살표로 되돌아가 0.7m 왕복하며 갇히지 않게)
const DETOUR_DEG = 45;
const DETOUR_STEPS = 4;
const DEG = Math.PI / 180;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 가상 보행자 (테스트·앱 개발 모드 공용). 화면에 보이는 화살표(arrowDeg)를 보고 0.5초마다 0.7m(±10%) 걷고,
 * 그 움직임을 AR 월드 좌표의 ArFrame으로 내보낸다. 실제 위치는 채점용으로만 내보낸다.
 * - arrowDeg: 지금 화면 화살표 회전각(guidance.createArrowStabilizer). null(숨김)이면 걷던 방향을 유지한다.
 * - 폰은 진행 방향에서 한 번 정한 3~12°만큼 틀어져 있다 → 출발 때 맞춘 방위(yawOffset)에 그만큼 고정 오차가 생긴다.
 * - AR 월드의 기준 방위는 임의(seed로 정함)라 localizer의 yawOffset 정렬을 거친다.
 * - 벽에 막히면 사람처럼 옆으로 비켜 가고, 45° 넘게 비켰으면 4걸음은 그 방향을 유지한다. 문 앞(STOP_M) 또는 maxSteps에서 끝난다.
 */
export function* virtualWalk(
  grid: MapGrid,
  leg: { start: LegStart; goal: LegGoal },
  opts: { arrowDeg: () => number | null; seed?: number; maxSteps?: number; t0?: number },
): Generator<WalkSample> {
  const rand = mulberry32(opts.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const maxSteps = opts.maxSteps ?? 2000;
  const phoneErrDeg = (3 + 9 * rand()) * (rand() < 0.5 ? -1 : 1);
  const arToMapDeg = 360 * rand(); // 지도 방위 = AR 방위 + arToMapDeg (보행자는 모름)

  const { start, goal } = leg;
  let pos: Point = { x: start.x, z: start.z, h: start.h };
  let walkDeg = start.heading_deg; // 출발 때 화살표를 보고 선다
  let t = opts.t0 ?? 0;
  let steps = 0;
  const ar = { x: 0, z: 0 };

  const sample = (): WalkSample => ({
    frame: {
      t, x: ar.x, y: pos.h - start.h, z: ar.z,
      yawDeg: (((walkDeg + phoneErrDeg - arToMapDeg) % 360) + 360) % 360,
      tracking: 'normal',
    },
    truth: { ...pos },
    steps,
  });

  // 걸음 끝까지 PROBE_M 간격으로 보행 칸만 밟으면 끝점, 아니면 null
  const tryStep = (deg: number, len: number): Point | null => {
    let p = pos;
    for (let d = Math.min(PROBE_M, len); ; d = Math.min(d + PROBE_M, len)) {
      const x = pos.x + d * Math.sin(deg * DEG);
      const z = pos.z - d * Math.cos(deg * DEG);
      const node = grid.lookup(x, z, p.h);
      if (node === null) return null;
      const h = grid.nodeXZH(node).h;
      if (Math.abs(h - p.h) > MAX_PROBE_DH_M) return null;
      p = { x, z, h };
      if (d >= len) return p;
    }
  };

  yield sample(); // reset 직후 방위 기준 프레임
  let detour = 0; // 비켜 간 방향을 더 유지할 걸음 수
  while (steps < maxSteps && Math.hypot(pos.x - goal.x, pos.z - goal.z) > STOP_M) {
    // 화살표는 카메라 전방(걷는 방향 + phoneErrDeg) 기준 회전각이다
    const rotation = opts.arrowDeg();
    const heading = detour > 0 || rotation === null ? walkDeg : walkDeg + phoneErrDeg + rotation;
    if (detour > 0) detour--;
    const len = STEP_M * (1 + 0.2 * (rand() - 0.5));
    const want = heading + gauss() * STEP_NOISE_DEG;
    let next: Point | null = null;
    // 막히면 옆으로 비켜 보고, 그래도 안 되면 보폭을 줄인다 (좁은 계단·턱이 잦은 곳)
    search: for (const l of [len, len / 2, len / 4]) {
      for (const off of [0, ...SIDESTEP_DEG]) {
        next = tryStep(want + off, l);
        if (next) {
          walkDeg = want + off;
          if (Math.abs(off) >= DETOUR_DEG) detour = DETOUR_STEPS;
          break search;
        }
      }
    }
    const from = { ...pos };
    const arFrom = { ...ar };
    const to = next ?? pos; // 사방이 막히면 제자리 (걸음 수는 센다)
    const arDeg = (walkDeg - arToMapDeg) * DEG;
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    steps++;
    for (let k = 1; k <= FRAMES_PER_STEP; k++) {
      const f = k / FRAMES_PER_STEP;
      t += STEP_S / FRAMES_PER_STEP;
      // 프레임 사이는 직선 보간. 높이는 끝점 칸 높이로 보간(계단)
      pos = { x: from.x + (to.x - from.x) * f, z: from.z + (to.z - from.z) * f, h: from.h + (to.h - from.h) * f };
      ar.x = arFrom.x + d * f * Math.sin(arDeg);
      ar.z = arFrom.z - d * f * Math.cos(arDeg);
      yield sample();
    }
  }
}
