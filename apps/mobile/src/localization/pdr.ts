export type MotionSample = {
  t: number; // s
  accZ: number; // 수직 사용자 가속도 m/s², 중력 제외
  headingDeg: number; // 기기 방위 (지도 기준 아님)
};
export type Step = { t: number; lengthM: number; headingDeg: number };

/** 이보다 낮은 봉우리는 걸음으로 치지 않는다 (m/s²) */
const PEAK_THRESHOLD = 1.0;
/** 걸음 사이 최소 간격 (s). 한 걸음 안의 잔떨림 봉우리를 거른다 */
const MIN_STEP_INTERVAL_S = 0.3;
/** Weinberg 계수. 사람·폰 쥐는 법마다 달라 실기기에서 보정해야 한다 */
const WEINBERG_K = 0.48;

type Vec3 = { x: number; y: number; z: number };

/**
 * expo-sensors DeviceMotion 한 번 → MotionSample. 폰을 세워 카메라로 앞을 비추는 자세 기준.
 * accZ = 사용자 가속도를 중력 방향에 투영(위가 +), headingDeg = 카메라(기기 −z축)의 수평 방위.
 * rot은 W3C 순서(Z-X-Y) 오일러각 rad. alpha 기준점은 아무래도 된다 (localizer가 AR과 비교해 오프셋을 배운다)
 */
export function motionSample(t: number, acc: Vec3, accWithGravity: Vec3, rot: { alpha: number; beta: number; gamma: number }): MotionSample {
  const g = { x: accWithGravity.x - acc.x, y: accWithGravity.y - acc.y, z: accWithGravity.z - acc.z };
  const gn = Math.hypot(g.x, g.y, g.z) || 1;
  // shortcut: 중력 벡터가 아래를 향하는 iOS 부호를 가정한다, Android에서 걸음이 골에서 잡히면 부호를 플랫폼별로 나눈다.
  const accZ = -(acc.x * g.x + acc.y * g.y + acc.z * g.z) / gn;
  const [sA, cA] = [Math.sin(rot.alpha), Math.cos(rot.alpha)];
  const sB = Math.sin(rot.beta);
  const [sG, cG] = [Math.sin(rot.gamma), Math.cos(rot.gamma)];
  // 기기 −z축의 월드 (동, 북) 성분
  const east = -cA * sG - sA * sB * cG;
  const north = -sA * sG + cA * sB * cG;
  const headingDeg = ((Math.atan2(east, north) * 180 / Math.PI) + 360) % 360;
  return { t, accZ, headingDeg };
}

/** 표본을 시간순으로 넣으면, 봉우리를 지난 순간 그 걸음을 돌려준다 */
export function createStepDetector() {
  let prev: MotionSample | null = null;
  let before: MotionSample | null = null; // prev 바로 앞 표본
  let lastStepT = -Infinity;
  let minSinceStep = Infinity;

  return {
    push(s: MotionSample): Step | null {
      let step: Step | null = null;
      // prev가 극대(앞보다 크고 지금보다 크거나 같음)인지 본다
      if (prev && before && prev.accZ > before.accZ && prev.accZ >= s.accZ &&
        prev.accZ > PEAK_THRESHOLD && prev.t - lastStepT >= MIN_STEP_INTERVAL_S) {
        step = {
          t: prev.t,
          lengthM: WEINBERG_K * Math.pow(prev.accZ - minSinceStep, 0.25),
          headingDeg: prev.headingDeg,
        };
        lastStepT = prev.t;
        minSinceStep = Infinity;
      }
      minSinceStep = Math.min(minSinceStep, s.accZ);
      before = prev;
      prev = s;
      return step;
    },
  };
}
