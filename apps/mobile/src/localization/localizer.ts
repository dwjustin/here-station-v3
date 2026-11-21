import type { Pose } from '../navigation/guidance.ts';
import type { MapGrid } from '../navigation/mapGrid.ts';
import type { Step } from './pdr.ts';

/** AR 층(ARKit)이 넘겨주는 한 프레임. 시뮬레이터·테스트도 같은 형식을 넣는다 */
export type ArFrame = {
  t: number; // s, Step.t와 같은 시계
  x: number; // ARKit 월드 m: x 오른쪽, y 위, z 뒤쪽
  y: number;
  z: number;
  yawDeg: number; // AR 월드에서 카메라 방위, AR -z에서 시계 방향
  tracking: 'normal' | 'limited' | 'notAvailable';
};

type Point = { x: number; z: number; h: number };

/** 이 시간(s)보다 오래 AR 프레임이 없으면 PDR 걸음으로 움직인다 */
const AR_STALE_S = 1;
/** 마지막 PDR 걸음 뒤 이 시간(s)까지는 추적 중으로 본다 */
const PDR_TRACKING_S = 2;
const RESET_SPREAD_M = 0.3;
const RESPAWN_SPREAD_M = 0.5;
// 출발 때 화살표를 보고 선 방향은 수 °~10° 남짓 틀린다. 입자마다 방위 치우침을 따로 두고 벽에 부딪힌 입자를 버려 맞는 치우침만 남긴다
const BIAS_SPREAD_DEG = 8;
const BIAS_JITTER_DEG = 0.2; // 재표집으로 복제할 때 치우침을 조금씩 흩어 계속 고를 수 있게 한다
// AR 높이와 바닥 높이가 이보다 어긋난 입자는 버린다. 서버 보행 격자의 이웃 높이 차 한계(backend/app/routing/grid.py MAX_STEP_CM)와 같다
const H_TOL_M = 0.35;
// 한 칸(0.25m)보다 긴 이동(PDR 한 걸음 0.7m)은 이 간격으로 경로를 밟아 1칸짜리 벽·난간을 건너뛰지 못하게 한다.
// 그보다 짧은 AR 프레임 이동은 끝점만 본다: 칸 하나를 건너뛸 수 없고, 10fps 가상 보행 200 seed에서 경로까지 보면 도착률·화살표 오차가 나빠졌다
const PROBE_M = 0.125;
// AR 높이 표류를 이동 1m당 이 비율만큼 (살아남은 입자 바닥 − AR 높이) 평균 쪽으로 고친다.
// shortcut: 가상 보행(표류 없음)과 합성 표류 ±2%로만 정했다(0.1~0.2/m), 실기기 ARKit 높이 기록으로 다시 맞춘다.
const H_OFFSET_GAIN_PER_M = 0.2;
// 이동량 비례 잡음 (거리 비율, 방위 °). AR은 정확하고 PDR은 걸음 길이·방위가 거칠다
const AR_NOISE = { length: 0.05, headingDeg: 2 };
const PDR_NOISE = { length: 0.1, headingDeg: 5 };

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
 * 한 구간 격자 위 입자 필터. 입자를 이동량만큼 옮기고 보행 칸이 아닌 곳(벽)에 들어간 입자는 버린다.
 * 높이는 옮긴 칸의 바닥 높이로 다시 잡아 계단을 따라간다.
 */
export function createLocalizer(grid: MapGrid, opts: { n?: number; seed?: number } = {}) {
  const n = opts.n ?? 300;
  const rand = mulberry32(opts.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  let xs = new Float64Array(n);
  let zs = new Float64Array(n);
  let hs = new Float64Array(n);
  let bias = new Float64Array(n); // 입자별 방위 치우침 (°), 이동 방위에 더한다
  let estimate: Point | null = null;
  let pendingHeading: number | null = null; // reset 뒤 첫 AR 프레임에서 yawOffset을 정한다
  let yawOffset: number | null = null; // 지도 방위 = AR 방위 + yawOffset
  let lastAr: ArFrame | null = null;
  // PDR 방위 = step.headingDeg + pdrOffset. AR이 정상일 때 들어온 걸음마다 (AR 지도 방위 − 기기 방위)로 새로 배운다
  let pdrOffset: number | null = null;
  let pdrHeading: number | null = null; // PDR이 위치를 맡는 동안 마지막 걸음의 지도 방위
  let lastPdrT = -Infinity;
  let now = -Infinity;
  // 지도 높이 = AR y + hBase. 모든 입자가 같은 AR 높이를 쓰므로 입자마다 높이를 쌓지 않는다. hBase는 표류 보정으로 조금씩 움직인다
  let hBase = 0;

  // keepBias: 모두 버려져 다시 뿌릴 때는 지금까지 배운 방위 치우침을 그대로 둔다
  function scatter(at: Point, spread: number, keepBias = false) {
    for (let i = 0; i < n; i++) {
      if (!keepBias) bias[i] = gauss() * BIAS_SPREAD_DEG;
      const x = at.x + gauss() * spread;
      const z = at.z + gauss() * spread;
      const node = grid.lookup(x, z, at.h);
      const h = node === null ? null : grid.nodeXZH(node).h;
      // 벽이나 H_TOL_M 넘게 다른 높이(옆 턱·난간 윗면)에 떨어진 입자는 중심점에 둔다
      if (h === null || Math.abs(h - at.h) > H_TOL_M) [xs[i], zs[i], hs[i]] = [at.x, at.z, at.h];
      else [xs[i], zs[i], hs[i]] = [x, z, h];
    }
    estimate = { ...at };
  }

  // 입자 i가 (x, z)로 갈 때 밟는 바닥 높이. 경로를 k 지점으로 나눠 밟아 보며 벽이나, AR 높이(PDR이면 앞 칸 바닥)와
  // H_TOL_M 넘게 어긋난 칸을 밟으면 null. PDR도 서버·가상 보행처럼 이어지지 않은 턱·난간 윗면으로 못 올라간다
  function landing(i: number, x: number, z: number, arH: number | null, k: number): number | null {
    let floor: number | null = hs[i];
    for (let j = 1; j <= k && floor !== null; j++) {
      const ref: number = arH ?? floor;
      const node = grid.lookup(xs[i] + ((x - xs[i]) * j) / k, zs[i] + ((z - zs[i]) * j) / k, ref);
      floor = node === null ? null : grid.nodeXZH(node).h;
      if (floor !== null && Math.abs(floor - ref) > H_TOL_M) floor = null;
    }
    return floor;
  }

  // arH: AR이 잰 지도 높이(m). 바닥 높이와 H_TOL_M 넘게 어긋난 입자는 버린다 →
  // 계단을 오르는데 평지에 있는 입자, 겹친 다른 층 입자, 난간 윗면 같은 높이 다른 띠의 입자가 걸러진다. PDR(arH 없음)은 H_TOL_M 안의 바닥 높이를 따른다
  function move(d: number, bearingDeg: number, noise: { length: number; headingDeg: number }, arH: number | null = null) {
    const alive: number[] = [];
    let floorSum = 0;
    for (let i = 0; i < n; i++) {
      const di = d * (1 + gauss() * noise.length);
      const b = (bearingDeg + bias[i] + gauss() * noise.headingDeg) * DEG;
      const x = xs[i] + di * Math.sin(b);
      const z = zs[i] - di * Math.cos(b);
      // 0.25m 넘는 이동(PDR 걸음)만 경로를 밟아 본다. AR 프레임까지 밟게 하면 가상 보행 도착률·화살표 오차가 나빠졌다(얇은 벽을 넘는 입자가 놓친 추정을 되찾는 역할을 함)
      const floor = landing(i, x, z, arH, Math.abs(di) > 2 * PROBE_M ? Math.ceil(Math.abs(di) / PROBE_M) : 1);
      if (floor === null) continue;
      [xs[i], zs[i], hs[i]] = [x, z, floor];
      alive.push(i);
      floorSum += floor;
    }
    if (alive.length === 0) {
      scatter(estimate!, RESPAWN_SPREAD_M, true);
      // 높이 기준이 틀어져 모두 버려졌을 수 있으니 추정 바닥에 다시 맞춘다
      if (arH !== null) hBase += estimate!.h - arH;
      return;
    }
    if (arH !== null) hBase += Math.min(1, H_OFFSET_GAIN_PER_M * d) * (floorSum / alive.length - arH);
    // 살아남은 입자 가중치가 모두 같으므로 계통 재표집 = 살아남은 입자를 고르게 복제
    if (alive.length < n) {
      const nx = new Float64Array(n), nz = new Float64Array(n), nh = new Float64Array(n), nb = new Float64Array(n);
      const u = rand();
      for (let i = 0; i < n; i++) {
        const j = alive[Math.floor(((i + u) / n) * alive.length)];
        [nx[i], nz[i], nh[i], nb[i]] = [xs[j], zs[j], hs[j], bias[j] + gauss() * BIAS_JITTER_DEG];
      }
      [xs, zs, hs, bias] = [nx, nz, nh, nb];
    }
    let sx = 0, sz = 0, sh = 0;
    for (let i = 0; i < n; i++) [sx, sz, sh] = [sx + xs[i], sz + zs[i], sh + hs[i]];
    const mean = { x: sx / n, z: sz / n, h: sh / n };
    if (grid.lookup(mean.x, mean.z, mean.h) !== null) {
      estimate = mean;
      return;
    }
    // 모퉁이·장애물 양쪽으로 갈린 입자의 평균은 벽에 떨어질 수 있다 → 평균에 가장 가까운 입자(늘 보행 칸)를 쓴다
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (xs[i] - mean.x) ** 2 + (zs[i] - mean.z) ** 2 + (hs[i] - mean.h) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    estimate = { x: xs[best], z: zs[best], h: hs[best] };
  }

  // 치우침을 빼고 출발 정렬만 적용한 방위. 이동 방위는 여기에 입자별 치우침을 더한다
  function alignedHeadingDeg(): number | null {
    return lastAr && yawOffset !== null ? lastAr.yawDeg + yawOffset : null;
  }

  /** 화살표용 카메라 방위 = 정렬 방위 + 입자 치우침 평균. 치우침이 ±수십° 안이라 산술 평균으로 충분하다 */
  function cameraHeadingDeg(): number | null {
    // AR이 끊긴 동안은 마지막 AR 방위가 멈춰 있으므로 PDR 걸음 방위를 쓴다
    const aligned = !arNormal() && pdrHeading !== null ? pdrHeading : alignedHeadingDeg();
    if (aligned === null) return null;
    let sb = 0;
    for (let i = 0; i < n; i++) sb += bias[i];
    return (((aligned + sb / n) % 360) + 360) % 360;
  }

  function arNormal(): boolean {
    return lastAr !== null && lastAr.tracking === 'normal' && now - lastAr.t <= AR_STALE_S;
  }

  return {
    /** 출구 출발·하차 문에서 위치와 지도 방위를 다시 잡는다. 다음 AR 프레임이 방위 기준이 된다 */
    reset(at: Point, headingDeg: number) {
      scatter(at, RESET_SPREAD_M);
      pendingHeading = headingDeg;
      yawOffset = null;
      lastAr = null;
      pdrOffset = null;
      pdrHeading = null;
      lastPdrT = -Infinity;
    },

    arFrame(f: ArFrame) {
      if (!estimate) return;
      now = Math.max(now, f.t);
      if (pendingHeading !== null) {
        yawOffset = pendingHeading - f.yawDeg;
        pendingHeading = null;
        hBase = estimate.h - f.y;
      } else if (lastAr && lastAr.tracking !== 'normal' && f.tracking === 'normal') {
        // 추적이 끊긴 동안 AR y가 튈 수 있다 → 돌아온 첫 프레임에서 높이 기준을 지금 추정 바닥에 다시 맞춘다
        hBase = estimate.h - f.y;
      } else if (lastAr && f.tracking === 'normal') {
        // 앞뒤 프레임이 모두 정상일 때만 AR 이동을 쓴다 (추적이 나빴던 동안은 PDR이 맡았다)
        const dx = f.x - lastAr.x;
        const dz = f.z - lastAr.z;
        const d = Math.hypot(dx, dz);
        if (d > 0) move(d, (Math.atan2(dx, -dz) / DEG) + yawOffset!, AR_NOISE, f.y + hBase);
      }
      lastAr = f;
      if (f.tracking === 'normal') pdrHeading = null;
    },

    step(s: Step) {
      if (!estimate) return;
      now = Math.max(now, s.t);
      const camera = alignedHeadingDeg();
      if (arNormal()) {
        if (camera !== null) pdrOffset = camera - s.headingDeg;
        return;
      }
      const bearing = pdrOffset !== null ? s.headingDeg + pdrOffset : camera;
      if (bearing === null) return;
      move(s.lengthM, bearing, PDR_NOISE);
      pdrHeading = bearing;
      lastPdrT = s.t;
    },

    /** 입자 평균 위치. reset 전에는 null */
    pose(): Pose | null {
      if (!estimate) return null;
      const tracking = arNormal() || now - lastPdrT <= PDR_TRACKING_S;
      return {
        position: { ...estimate },
        cameraHeadingDeg: cameraHeadingDeg(),
        trackingStatus: tracking ? 'tracking' : 'unavailable',
      };
    },
  };
}

export type Localizer = ReturnType<typeof createLocalizer>;
