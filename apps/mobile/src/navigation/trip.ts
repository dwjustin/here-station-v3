import type { LegGoal } from '../api/routes.ts';
import { arrivedAt, type Pose } from './guidance.ts';

// legA(홍제 출구 → 1-1) → onTrain(열차, 추적 안 함) → legB(잠원 1-1 → 출구) → arrived
export type TripPhase = 'legA' | 'onTrain' | 'legB' | 'arrived';
export type TripEvent = { type: 'pose'; pose: Pose } | { type: 'alighted' }; // alighted = "내렸어요" 버튼

export function nextTripPhase(phase: TripPhase, event: TripEvent, goals: readonly [LegGoal, LegGoal]): TripPhase {
  if (event.type === 'alighted') return phase === 'onTrain' ? 'legB' : phase;
  if (phase === 'legA' && arrivedAt(event.pose, goals[0])) return 'onTrain';
  if (phase === 'legB' && arrivedAt(event.pose, goals[1])) return 'arrived';
  return phase;
}

/** 지금 안내 중인 구간(legs 배열 번호). 열차 안·도착 후는 null */
export function activeLegIndex(phase: TripPhase): 0 | 1 | null {
  return phase === 'legA' ? 0 : phase === 'legB' ? 1 : null;
}
