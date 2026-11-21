// POST /routes 응답 형식 (contracts/와 같게 유지). 좌표: x = 동(m), z = 남(m), h = 높이(m)
export type GridSpec = { x0: number; z0: number; w: number; cell: number };
export type LegStart = { level: string; x: number; z: number; h: number; heading_deg: number };
export type LegGoal = { level: string; x: number; z: number; h: number; arrival_radius: number };

export type RouteLeg = {
  station_id: string;
  map_revision: string;
  grid: GridSpec;
  start: LegStart;
  goal: LegGoal;
  cells: string; // base64 Int32 LE, 칸 번호(행 × w + 열), 지도 nodes 순서
  h: string; // base64 Int16 LE, 바닥 높이 cm
  direction: string; // base64 Uint16 LE, 방위 0.1° 단위, 65535 = 방향 없음
};

export type RouteTrip = {
  origin_station_id: string;
  origin_station_name: string;
  destination_station_id: string;
  destination_station_name: string;
  line_name: string;
  up_down: string;
  direction: string;
  destination_next_station: string | null;
  door_no: string;
  origin_walk_m: number;
  destination_walk_m: number;
};

export type RouteResponse = {
  trip: RouteTrip;
  legs: RouteLeg[];
};

export type DecodedLeg = {
  grid: GridSpec;
  start: LegStart;
  goal: LegGoal;
  cells: Int32Array;
  h: Int16Array; // cm
  direction: Uint16Array;
};

export async function requestRoute(
  apiBaseUrl: string,
  originStationId: string,
  destinationStationId: string,
): Promise<RouteResponse> {
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_station_id: originStationId,
      destination_station_id: destinationStationId,
    }),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body !== null && typeof body === 'object' &&
      'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : `경로 요청에 실패했습니다. (HTTP ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

// shortcut: 기기 바이트 순서를 리틀 엔디언으로 가정한다(iOS·Android 기기 모두 해당), 빅 엔디언 기기를 지원할 때 DataView로 바꾼다.
function decodeBase64<T>(b64: string, Ctor: new (buffer: ArrayBuffer) => T): T {
  const binary = atob(b64);
  // 새 버퍼에 복사해야 Int32Array가 요구하는 4바이트 정렬이 보장된다
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Ctor(bytes.buffer);
}

export function decodeLeg(leg: RouteLeg): DecodedLeg {
  const cells = decodeBase64(leg.cells, Int32Array);
  const h = decodeBase64(leg.h, Int16Array);
  const direction = decodeBase64(leg.direction, Uint16Array);
  if (h.length !== cells.length || direction.length !== cells.length) {
    throw new Error('경로 응답의 칸 배열 길이가 서로 다릅니다.');
  }
  return {
    grid: leg.grid,
    start: leg.start,
    goal: leg.goal,
    cells,
    h,
    direction,
  };
}
