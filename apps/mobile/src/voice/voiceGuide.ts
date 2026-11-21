import type { RouteTrip } from '../api/routes.ts';
import type { TripPhase } from '../navigation/trip.ts';

/**
 * 화면을 보지 않고 에어팟으로만 들어도 걸을 수 있게, 화살표 각도와 여정 단계를 말로 바꾼다 (LLM 안 씀).
 * 화살표는 위치 추정 때문에 조금씩 흔들리므로 같은 방향이 HOLD_S 동안 이어져야 말한다.
 */

/** 같은 방향 분류가 이만큼 이어져야 말한다 (s) */
const HOLD_S = 1;
/** 돌라는 말을 했는데 아직 돌지 않았으면 이 간격으로 다시 말한다 (s) */
const REPEAT_S = 8;
/** 화살표가 이만큼 계속 없으면 휴대폰을 들어 달라고 한다 (s) */
const LOST_S = 4;
const LOST_REPEAT_S = 15;
/** 구간 목적지까지 직선거리가 이보다 가까우면 한 번 알려 준다 (m) */
const NEAR_M = 10;

export type Direction = 'straight' | 'slightLeft' | 'slightRight' | 'left' | 'right' | 'back' | 'lost';
export type Utterance = { text: string; urgent: boolean };
export type GuideInput = {
  t: number; // s
  phase: TripPhase;
  /** 화면 화살표 회전각 (0° 정면, +90° 오른쪽). 모르면 null */
  rotationDeg: number | null;
  /** 지금 구간 목적지까지 직선거리 (m). 모르면 null */
  distanceToGoalM: number | null;
};

const SAY: Record<Exclude<Direction, 'lost'>, string> = {
  straight: '앞으로 계속 가세요.',
  slightLeft: '조금 왼쪽으로 가세요.',
  slightRight: '조금 오른쪽으로 가세요.',
  left: '왼쪽으로 도세요.',
  right: '오른쪽으로 도세요.',
  back: '뒤로 돌아 주세요.',
};
const LOST_TEXT = '방향을 찾고 있어요. 휴대폰 카메라가 앞을 보게 가슴 앞에 들어 주세요.';

export function classify(rotationDeg: number | null): Direction {
  if (rotationDeg === null) return 'lost';
  const a = Math.abs(rotationDeg);
  if (a <= 30) return 'straight';
  if (a > 135) return 'back';
  const side = rotationDeg < 0 ? 'Left' : 'Right';
  return a <= 60 ? `slight${side}` : side === 'Left' ? 'left' : 'right';
}

/** 단계가 바뀔 때 할 말. 열차 안에서는 사용자가 "내렸어"라고 말하거나 버튼을 눌러야 다음 구간이 시작된다 */
export function phaseText(phase: TripPhase, trip: RouteTrip | undefined): string {
  if (phase === 'onTrain') {
    if (!trip) return '승강장에 도착했어요. 열차를 타고, 내리면 내렸어라고 말해 주세요.';
    const [car, door] = trip.door_no.split('-');
    return `승강장에 도착했어요. ${trip.line_name} ${trip.direction} 방면 열차를 타세요. ` +
      `${trip.destination_station_name}역에서 ${car}번 칸 ${door}번 문으로 내리고, 내리면 내렸어라고 말해 주세요.`;
  }
  if (phase === 'legB') return '도착역 안내를 시작할게요. 말하는 방향으로 걸어가세요.';
  if (phase === 'arrived') {
    return `${trip ? `${trip.destination_station_name}역 ` : ''}1번 출구에 도착했어요. 안내를 마칠게요.`;
  }
  return '안내를 시작할게요.';
}

export function createVoiceGuide(trip?: RouteTrip) {
  let phase: TripPhase | null = null;
  let candidate: Direction | null = null;
  let candidateSince = 0;
  let spoken: Direction | null = null; // 이번 구간에서 마지막으로 말한 방향
  let spokenAt = -Infinity;
  let nearSaid = false;

  return ({ t, phase: now, rotationDeg, distanceToGoalM }: GuideInput): Utterance | null => {
    if (now !== phase) {
      const first = phase === null;
      phase = now;
      [candidate, spoken, spokenAt, nearSaid] = [null, null, -Infinity, false];
      // 첫 구간 시작은 서버가 이미 경로를 말로 설명했으므로 따로 말하지 않는다
      if (!first) return { text: phaseText(now, trip), urgent: true };
    }
    if (now !== 'legA' && now !== 'legB') return null;

    // 다른 말을 하는 동안에도 방향이 이어진 시간은 센다
    const direction = classify(rotationDeg);
    if (direction !== candidate) [candidate, candidateSince] = [direction, t];
    const held = t - candidateSince;

    if (!nearSaid && distanceToGoalM !== null && distanceToGoalM <= NEAR_M) {
      nearSaid = true;
      return { text: now === 'legA' ? '곧 승강장이에요.' : '곧 출구예요.', urgent: false };
    }

    if (direction === 'lost') {
      if (held < LOST_S || (spoken === 'lost' && t - spokenAt < LOST_REPEAT_S)) return null;
      [spoken, spokenAt] = ['lost', t];
      return { text: LOST_TEXT, urgent: false };
    }
    if (held < HOLD_S) return null;
    const changed = direction !== spoken;
    // 직진은 처음 한 번과 돈 뒤 확인으로만 말한다. 돌라는 말은 돌 때까지 REPEAT_S마다 다시 한다
    const repeat = direction !== 'straight' && t - spokenAt >= REPEAT_S;
    if (!changed && !repeat) return null;
    [spoken, spokenAt] = [direction, t];
    return { text: SAY[direction], urgent: direction === 'back' || direction === 'left' || direction === 'right' };
  };
}

/** 열차 안에서 들은 말이 "내렸다"는 뜻인지 */
export function meansAlighted(heard: string): boolean {
  return /내렸|내려|내릴게|도착했|다\s*왔/.test(heard);
}
