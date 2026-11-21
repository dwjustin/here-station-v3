// 테스트용 합성 구간: 0.25m 칸으로 된 직사각형 보행 영역. 모든 칸 방향 = directionDeg
export function rectLeg({ cols, rows, hCm = 0, directionDeg = 90, extra = [] }) {
  const w = cols;
  const nodes = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) nodes.push([r * w + c, hCm, directionDeg * 10]);
  nodes.push(...extra); // [cell, hCm, direction(0.1°)]
  return {
    grid: { x0: 0, z0: 0, w, cell: 0.25 },
    start: { level: 'B1', x: 0, z: 0, h: 0, heading_deg: directionDeg },
    goal: { level: 'B1', x: 0, z: 0, h: 0, arrival_radius: 1 },
    cells: Int32Array.from(nodes, (n) => n[0]),
    h: Int16Array.from(nodes, (n) => n[1]),
    direction: Uint16Array.from(nodes, (n) => n[2]),
  };
}
