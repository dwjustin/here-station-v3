export type Station = { id: string; name: string; lines: string[] };

function isStation(value: unknown): value is Station {
  return value !== null && typeof value === 'object' &&
    'id' in value && typeof value.id === 'string' && value.id.length > 0 &&
    'name' in value && typeof value.name === 'string' && value.name.length > 0 &&
    'lines' in value && Array.isArray(value.lines) && value.lines.length > 0 &&
    value.lines.every((line: unknown) => typeof line === 'string' && line.length > 0);
}

export async function searchStations(
  apiBaseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<Station[]> {
  try {
    if (!apiBaseUrl) throw new Error('역 검색 서버 주소가 설정되지 않았습니다.');
    const url = `${apiBaseUrl.replace(/\/+$/, '')}/stations?q=${encodeURIComponent(query.trim())}`;
    if (__DEV__) console.log('[stations:request]', { url });
    const response = await fetch(url, { signal });
    const body: unknown = await response.json().catch(() => null);
    if (__DEV__) console.log('[stations:response]', { status: response.status });
    if (!response.ok) {
      const message = body !== null && typeof body === 'object' &&
        'detail' in body && typeof body.detail === 'string'
        ? body.detail : `역 검색에 실패했습니다. (HTTP ${response.status})`;
      throw new Error(message);
    }
    if (body === null || typeof body !== 'object' || !('stations' in body) ||
      !Array.isArray(body.stations) || !body.stations.every(isStation)) {
      throw new Error('역 검색 응답 형식이 올바르지 않습니다.');
    }
    if (__DEV__) console.log('[stations:results]', body.stations);
    return body.stations;
  } catch (error) {
    if (__DEV__ && !signal?.aborted) {
      console.warn('[stations:error]', error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}
