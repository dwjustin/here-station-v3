import type { LegGoal } from '../api/routes.ts';
import type { MapGrid } from './mapGrid.ts';

/** 도착으로 볼 최대 높이 차 (m). 바로 위·아래층에서 도착 처리되지 않게 한다 */
const ARRIVAL_MAX_DH_M = 1.5;

export type Pose = {
  position: { x: number; z: number; h: number };
  /** 카메라 전방의 지도 방위 (북 0°, 시계 방향). 모르면 null */
  cameraHeadingDeg: number | null;
  trackingStatus: 'tracking' | 'unavailable';
};

/** 각도를 [-180, 180) 로 */
export function normalizeDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/** 지난 FLIP_HOLD_S 초 동안 보여 준 방위와 이보다 크게 다른 거리장 방위는 FLIP_HOLD_S 동안 이어져야 바꾼다 (°, s) */
const FLIP_DEG = 120;
const FLIP_HOLD_S = 1;

/**
 * 화면 화살표 회전각 (0° 정면, +90° 오른쪽, 범위 [-180, 180)) = 밟은 칸의 거리장 방위 − 카메라 방위.
 * 추적 불가·방위 없음·벽 위·방향 없는 칸이면 null(화살표 숨김). 구간마다 하나 만든다.
 * 추정 위치가 거리장 분수령을 오가면 방위가 135→0→180°처럼 튄다: 큰 변화는 1초 이어져야 받아들인다. 지금 방위만 비교하면 0→90→180°처럼 나눠 뒤집혀 지난 1초를 본다.
 * 지도 방위에만 거니 사용자가 돌아서는 것(카메라 방위)은 늦추지 않는다.
 */
export function createArrowStabilizer(grid: MapGrid) {
  let shown = 0; // 보여 주는 거리장 방위
  let recent: { t: number; deg: number }[] = []; // 지난 FLIP_HOLD_S 초 동안 보여 준 방위
  let since: number | null = null; // 그와 크게 다른 방위가 처음 나온 시각 (s)
  return (pose: Pose | null, t: number): number | null => {
    if (!pose || pose.trackingStatus !== 'tracking' || pose.cameraHeadingDeg === null) return null;
    const { x, z, h } = pose.position;
    const node = grid.lookup(x, z, h);
    const bearing = node === null ? null : grid.directionDeg(node);
    if (bearing === null) return null;
    recent = recent.filter((r) => t - r.t < FLIP_HOLD_S);
    if (!recent.some((r) => Math.abs(normalizeDeg(bearing - r.deg)) > FLIP_DEG)) [shown, since] = [bearing, null];
    else if (since === null) since = t;
    else if (t - since >= FLIP_HOLD_S) [shown, since, recent] = [bearing, null, []];
    recent.push({ t, deg: shown });
    return normalizeDeg(shown - pose.cameraHeadingDeg);
  };
}

export function arrivedAt(pose: Pose, goal: LegGoal): boolean {
  const p = pose.position;
  return Math.hypot(p.x - goal.x, p.z - goal.z) <= goal.arrival_radius &&
    Math.abs(p.h - goal.h) <= ARRIVAL_MAX_DH_M;
}
