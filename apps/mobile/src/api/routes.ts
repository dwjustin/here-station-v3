import type routeExample from '../../../../contracts/examples/route.json';

// shortcut: 예시 JSON의 타입을 사용하며, API 스키마 확정 시 공유 타입으로 교체한다.
export type RouteResponse = typeof routeExample;

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
