// POST /routes 응답 형식 (contracts/와 같게 유지). 좌표: x = 동(m), z = 남(m), h = 높이(m)
export type GridSpec = { x0: number; z0: number; w: number; cell: number };
export type LegStart = { level: string; x: number; z: number; h: number; heading_deg: number };
export type LegGoal = { level: string; x: number; z: number; h: number; arrival_radius: number };
export type PlatformArea = { id: string; name: string; nodes: string; access_name: string };

export type RouteLeg = {
  station_id: string;
  map_revision: string;
  grid: GridSpec;
  start: LegStart;
  goal: LegGoal;
  platform?: PlatformArea | null;
  cells: string; // base64 Int32 LE, 칸 번호(행 × w + 열), 지도 nodes 순서
  h: string; // base64 Int16 LE, 바닥 높이 cm
  direction: string; // base64 Uint16 LE, 방위 0.1° 단위, 65535 = 방향 없음
};

export type TripInfo = {
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

export type RouteResponse = { trip: TripInfo; legs: RouteLeg[] };

export type DecodedLeg = {
  grid: GridSpec;
  start: LegStart;
  goal: LegGoal;
  platform?: Omit<PlatformArea, 'nodes'> & { nodes: Int32Array };
  cells: Int32Array;
  h: Int16Array; // cm
  direction: Uint16Array;
};

export async function requestRoute(
  apiBaseUrl: string,
  originStationId: string,
  destinationStationId: string,
): Promise<RouteResponse> {
  if (!apiBaseUrl.trim()) throw new Error('경로 검색 서버 주소가 설정되지 않았습니다.');
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

  const result: RouteResponse | null = await response.json();
  const trip = result?.trip;
  if (!result || !Array.isArray(result.legs) || result.legs.length !== 2 || !trip ||
      result.legs.some((leg) => !leg?.platform) ||
      trip.origin_station_id !== originStationId || trip.destination_station_id !== destinationStationId ||
      result.legs[0].station_id !== originStationId || result.legs[1].station_id !== destinationStationId ||
      ![trip.origin_station_id, trip.origin_station_name, trip.destination_station_id,
        trip.destination_station_name, trip.line_name, trip.up_down, trip.direction, trip.door_no]
        .every((value) => typeof value === 'string' && value.trim().length > 0) ||
      !/^[1-9][0-9]*-[1-9][0-9]*$/.test(trip.door_no) ||
      ![trip.origin_walk_m, trip.destination_walk_m].every((value) => Number.isFinite(value) && value >= 0) ||
      !(trip.destination_next_station === null || typeof trip.destination_next_station === 'string')) {
    throw new Error('경로 응답의 여정 정보가 올바르지 않습니다.');
  }
  result.legs.forEach(decodeLeg);
  return result;
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
  if (!leg.grid || !leg.start || !leg.goal ||
      ![leg.station_id, leg.map_revision, leg.start.level, leg.goal.level]
        .every((value) => typeof value === 'string' && value.trim()) ||
      ![leg.grid.x0, leg.grid.z0, leg.grid.cell, leg.start.x, leg.start.z, leg.start.h,
        leg.goal.x, leg.goal.z, leg.goal.h, leg.start.heading_deg, leg.goal.arrival_radius].every(Number.isFinite) ||
      !Number.isInteger(leg.grid.w) || leg.grid.w <= 0 || leg.grid.cell <= 0 ||
      leg.start.heading_deg < 0 || leg.start.heading_deg >= 360 || leg.goal.arrival_radius <= 0) {
    throw new Error('경로 응답의 지도 좌표가 올바르지 않습니다.');
  }
  const cells = decodeBase64(leg.cells, Int32Array);
  const h = decodeBase64(leg.h, Int16Array);
  const direction = decodeBase64(leg.direction, Uint16Array);
  if (!cells.length || h.length !== cells.length || direction.length !== cells.length ||
      cells.some((cell) => cell < 0) || direction.some((value) => value >= 3600 && value !== 65535)) {
    throw new Error('경로 응답의 칸 배열 길이가 서로 다릅니다.');
  }
  let platform: DecodedLeg['platform'];
  if (leg.platform) {
    const nodes = decodeBase64(leg.platform.nodes, Int32Array);
    if (![leg.platform.id, leg.platform.name, leg.platform.access_name].every((s) => typeof s === 'string' && s.trim()) ||
        !nodes.length || nodes.some((node) => node < 0 || node >= cells.length)) {
      throw new Error('경로 응답의 승강장 영역이 올바르지 않습니다.');
    }
    platform = { ...leg.platform, nodes };
  }
  return {
    grid: leg.grid,
    start: leg.start,
    goal: leg.goal,
    platform,
    cells,
    h,
    direction,
  };
}
