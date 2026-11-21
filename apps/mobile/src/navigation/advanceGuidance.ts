export type GuidancePhase = 'originWalk' | 'platform' | 'onTrain' | 'destinationPosition' | 'destinationWalk' | 'arrived';
export type GuidanceEvent = 'platformReached' | 'boarded' | 'alighted' | 'positionConfirmed' | 'exitReached';

export function advanceGuidance(phase: GuidancePhase, event: GuidanceEvent): GuidancePhase {
  if (phase === 'originWalk' && event === 'platformReached') return 'platform';
  if (phase === 'platform' && event === 'boarded') return 'onTrain';
  if (phase === 'onTrain' && event === 'alighted') return 'destinationPosition';
  if (phase === 'destinationPosition' && event === 'positionConfirmed') return 'destinationWalk';
  if (phase === 'destinationWalk' && event === 'exitReached') return 'arrived';
  return phase;
}
