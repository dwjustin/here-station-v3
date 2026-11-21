type Position = { x: number; z: number; h: number };

type MapPosition = {
  stationId: string;
  mapRevision: string;
  level: string;
  position: Position;
};

export type CompassDirectionInput = {
  pose: (MapPosition & {
    trackingStatus: 'tracking' | 'unavailable';
    // 지도 북쪽 0°, 시계 방향. 휴대폰 윗변이 아닌 카메라 전방의 수평 방위각.
    cameraHeadingDeg: number | null;
  }) | null;
  target: MapPosition | null;
  movementKind: string | null;
};

export type CompassDirectionOutput = {
  // 화면 위쪽 화살표 기준: 0° 정면, +90° 오른쪽, -90° 왼쪽. 범위 [-180, 180).
  // 계산 미구현·추적 불가·안내 부적합이면 null이며 화살표를 숨긴다.
  rotationDeg: number | null;
};

export function calculateCompassDirection(input: CompassDirectionInput): CompassDirectionOutput {
  // TODO(위치 추정 팀): 추적 상태·유한한 좌표·방향·동일 역/지도/층을 확인한다.
  // TODO(위치 추정 팀): x=동, z=남에서 atan2(dx, -dz)로 목표 방위를 구한다.
  // TODO(위치 추정 팀): 카메라와 지도 방향을 정렬하고 목표 방위 - cameraHeadingDeg를 정규화한다.
  // TODO: 열차·층 이동·목표점과 현재점이 같은 경우의 안내 정책을 연결한다.
  return { rotationDeg: null };
}
