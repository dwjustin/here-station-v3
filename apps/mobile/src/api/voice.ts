import type { RouteResponse } from './routes';

export type VoiceMessage = { role: 'user' | 'assistant'; text: string };
export type VoiceTurn = { reply: string; route: RouteResponse | null };

/** 지금까지의 대화(마지막은 사용자 말)를 보내고 읽어 줄 답과, 찾았다면 경로를 받는다 */
export async function sendVoiceTurn(apiBaseUrl: string, messages: VoiceMessage[]): Promise<VoiceTurn> {
  if (!apiBaseUrl) throw new Error('길 안내 서버 주소가 설정되지 않았습니다.');
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/voice/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail = body !== null && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
      ? body.detail : null;
    throw new Error(detail ?? `음성 길 찾기에 실패했습니다. (HTTP ${response.status})`);
  }
  return response.json();
}
