import type { DecodedLeg } from '../api/routes.ts';

/** 이보다 높이 차가 크면 겹친 다른 층으로 보고 고르지 않는다 (m) */
const MAX_LOOKUP_DH_M = 1.0;
const NO_DIRECTION = 65535;

export type MapGrid = {
  /** (x, z, h)가 밟은 보행 칸의 노드 번호. 벽·격자 밖·다른 층이면 null */
  lookup(x: number, z: number, h: number): number | null;
  /** 지도 북 0° 시계 방향. 목적지 칸·도달 불가 칸은 null */
  directionDeg(node: number): number | null;
  /** 칸 중심 좌표와 바닥 높이 (m) */
  nodeXZH(node: number): { x: number; z: number; h: number };
};

export function createMapGrid(leg: DecodedLeg): MapGrid {
  const { x0, z0, w, cell } = leg.grid;
  // 칸 번호는 층이 겹치는 곳에서 여러 번 나오므로 칸 번호 → 노드 목록
  const byCell = new Map<number, number[]>();
  leg.cells.forEach((c, node) => {
    const list = byCell.get(c);
    if (list) list.push(node);
    else byCell.set(c, [node]);
  });

  return {
    lookup(x, z, h) {
      const col = Math.floor((x - x0) / cell);
      const row = Math.floor((z - z0) / cell);
      // 열이 범위를 넘으면 옆 행의 칸 번호와 겹치므로 먼저 거른다
      if (col < 0 || col >= w || row < 0) return null;
      let best: number | null = null;
      let bestDh = MAX_LOOKUP_DH_M;
      for (const node of byCell.get(row * w + col) ?? []) {
        const dh = Math.abs(leg.h[node] / 100 - h);
        if (dh <= bestDh) {
          best = node;
          bestDh = dh;
        }
      }
      return best;
    },
    directionDeg(node) {
      const d = leg.direction[node];
      return d === NO_DIRECTION ? null : d / 10;
    },
    nodeXZH(node) {
      const c = leg.cells[node];
      return { x: x0 + ((c % w) + 0.5) * cell, z: z0 + (Math.floor(c / w) + 0.5) * cell, h: leg.h[node] / 100 };
    },
  };
}
