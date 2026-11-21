import type { RouteResponse } from '../api/routes';

export function advanceGuidance(
  route: Pick<RouteResponse, 'nodes'>,
  currentNodeIndex: number,
  arrivedNodeId: string,
): number {
  const target = route.nodes[currentNodeIndex + 1];
  return target?.id === arrivedNodeId ? currentNodeIndex + 1 : currentNodeIndex;
}
