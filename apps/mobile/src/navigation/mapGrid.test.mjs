import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { decodeLeg } from '../api/routes.ts';
import { createMapGrid } from './mapGrid.ts';
import { rectLeg } from './fixtures.mjs';

const b64 = (typed) => Buffer.from(typed.buffer).toString('base64');

test('decodeLeg round-trips the base64 arrays', () => {
  const cells = Int32Array.from([0, 70000, 1, 2 ** 31 - 1]);
  const h = Int16Array.from([0, -350, 1200, -32768]);
  const direction = Uint16Array.from([0, 900, 3599, 65535]);
  const start = { level: 'B1', x: 1, z: 2, h: 0, heading_deg: 90 };
  const goal = { level: 'B3', x: 3, z: 4, h: -12, arrival_radius: 2 };
  const leg = decodeLeg({
    station_id: 'hongje', map_revision: 'abc', grid: { x0: -5, z0: -6, w: 100, cell: 0.25 },
    start, goal, cells: b64(cells), h: b64(h), direction: b64(direction),
  });
  assert.deepEqual(leg.start, start);
  assert.deepEqual(leg.goal, goal);
  assert.deepEqual([...leg.cells], [...cells]);
  assert.deepEqual([...leg.h], [...h]);
  assert.deepEqual([...leg.direction], [...direction]);
});

test('decodeLeg rejects arrays of different length', () => {
  assert.throws(() => decodeLeg({
    station_id: 's', map_revision: 'r', grid: { x0: 0, z0: 0, w: 1, cell: 0.25 },
    start: {}, goal: {}, cells: b64(Int32Array.from([1, 2])), h: b64(Int16Array.from([0])),
    direction: b64(Uint16Array.from([0, 0])),
  }));
});

test('lookup picks the stacked node nearest in height, within 1 m', () => {
  // 칸 5(0행 5열)에 0m 바닥과 5m 위층 바닥이 겹친다
  const grid = createMapGrid(rectLeg({ cols: 10, rows: 2, extra: [[5, 500, 1800]] }));
  const upper = 20; // 노드 번호 = 배열 순서
  assert.equal(grid.lookup(1.3, 0.1, 0.2), 5);
  assert.equal(grid.lookup(1.3, 0.1, 4.6), upper);
  assert.equal(grid.directionDeg(upper), 180);
  assert.equal(grid.lookup(1.3, 0.1, 2.5), null); // 두 층 사이 높이
  assert.deepEqual(grid.nodeXZH(upper), { x: 1.375, z: 0.125, h: 5 });
});

test('lookup is null off the walkable grid', () => {
  const grid = createMapGrid(rectLeg({ cols: 10, rows: 2 }));
  assert.equal(grid.lookup(-0.1, 0.1, 0), null);
  assert.equal(grid.lookup(2.6, 0.1, 0), null); // 열이 w를 넘음 (옆 행으로 감기지 않아야 함)
  assert.equal(grid.lookup(0.1, 0.6, 0), null); // 없는 행
  assert.equal(grid.lookup(0.1, -0.1, 0), null);
});

test('directionDeg is null for 65535', () => {
  const grid = createMapGrid(rectLeg({ cols: 2, rows: 1, extra: [[2, 0, 65535]] }));
  assert.equal(grid.directionDeg(0), 90);
  assert.equal(grid.directionDeg(2), null);
});
