import assert from 'node:assert/strict';
import test from 'node:test';

import { arrivedAt, createArrowStabilizer, normalizeDeg } from './guidance.ts';
import { createMapGrid } from './mapGrid.ts';
import { activeLegIndex, nextTripPhase } from './trip.ts';
import { rectLeg } from './fixtures.mjs';

const grid = createMapGrid(rectLeg({ cols: 8, rows: 8, directionDeg: 350, extra: [[64, 0, 65535]] }));
const pose = (x, z, h = 0, trackingStatus = 'tracking', cameraHeadingDeg = 0) =>
  ({ position: { x, z, h }, cameraHeadingDeg, trackingStatus });

test('normalizeDeg wraps into [-180, 180)', () => {
  assert.equal(normalizeDeg(180), -180);
  assert.equal(normalizeDeg(-180), -180);
  assert.equal(normalizeDeg(540), -180);
  assert.equal(normalizeDeg(-190), 170);
  assert.equal(normalizeDeg(359), -1);
});

const arrowRotationDeg = ({ grid, pose }) => createArrowStabilizer(grid)(pose, 0);

test('arrow = node bearing - camera heading', () => {
  assert.equal(arrowRotationDeg({ grid, pose: pose(1, 1, 0, 'tracking', 10) }), -20);
  assert.equal(arrowRotationDeg({ grid, pose: pose(1, 1, 0, 'tracking', 170) }), -180);
  assert.equal(arrowRotationDeg({ grid, pose: pose(1, 1, 0, 'tracking', 300) }), 50);
});

test('arrow is hidden when it cannot be trusted', () => {
  assert.equal(arrowRotationDeg({ grid, pose: null }), null);
  assert.equal(arrowRotationDeg({ grid, pose: pose(1, 1, 0, 'unavailable') }), null);
  assert.equal(arrowRotationDeg({ grid, pose: pose(1, 1, 0, 'tracking', null) }), null);
  assert.equal(arrowRotationDeg({ grid, pose: pose(5, 1) }), null); // 벽
  assert.equal(arrowRotationDeg({ grid, pose: pose(0.1, 2.1) }), null); // 방향 없는 칸
});

test('arrow holds a flipped bearing for 1 s, but follows the camera at once', () => {
  // 칸 1: 0.3m 위에 반대 방향(170°) 층이 겹침. 칸 9: 같은 높이에서 170°, 칸 2: 같은 높이에서 300°
  const g = createMapGrid(rectLeg({ cols: 8, rows: 8, directionDeg: 350, extra: [[1, 30, 1700], [9, 0, 1700], [2, 0, 3000]] }));
  const arrow = createArrowStabilizer(g);
  assert.equal(arrow(pose(0.1, 0.1), 0), -10);
  assert.equal(arrow(pose(0.1, 0.1, 0, 'tracking', 180), 0.1), 170); // 돌아서면 바로 따라간다
  assert.equal(createArrowStabilizer(g)(pose(0.3, 0.1, 0.2), 0), 170);
  assert.equal(arrow(pose(0.6, 0.1), 0.3), -60); // 작은 변화는 바로
  assert.equal(arrow(pose(0.1, 0.1), 0.4), -10);
  assert.equal(arrow(pose(0.3, 0.3), 0.5), -10); // 180° 뒤집힘은 1초 이어져야
  assert.equal(arrow(pose(0.3, 0.3), 1.4), -10);
  assert.equal(arrow(pose(0.3, 0.3), 1.5), 170);
});

test('arrivedAt checks horizontal radius and height', () => {
  const goal = { level: 'B1', x: 0, z: 0, h: 0, arrival_radius: 2 };
  assert.equal(arrivedAt(pose(1.2, 1.6), goal), true);
  assert.equal(arrivedAt(pose(1.5, 1.5), goal), false);
  assert.equal(arrivedAt(pose(0, 0, 1.6), goal), false);
});

test('trip goes legA -> onTrain -> legB -> arrived', () => {
  const goals = [
    { level: 'B3', x: 0, z: 0, h: -10, arrival_radius: 2 },
    { level: '1F', x: 50, z: 0, h: 0, arrival_radius: 1.5 },
  ];
  const at = (x, h) => ({ type: 'pose', pose: pose(x, 0, h) });
  let phase = 'legA';
  assert.equal(activeLegIndex(phase), 0);
  assert.equal(nextTripPhase(phase, { type: 'alighted' }, goals), 'legA');
  assert.equal(nextTripPhase(phase, at(50, 0), goals), 'legA'); // 구간 B 도착점은 무시
  phase = nextTripPhase(phase, at(1, -10), goals);
  assert.equal(phase, 'onTrain');
  assert.equal(activeLegIndex(phase), null);
  assert.equal(nextTripPhase(phase, at(50, 0), goals), 'onTrain'); // 열차 안 위치는 무시
  phase = nextTripPhase(phase, { type: 'alighted' }, goals);
  assert.equal(phase, 'legB');
  assert.equal(activeLegIndex(phase), 1);
  assert.equal(nextTripPhase(phase, at(1, -10), goals), 'legB');
  phase = nextTripPhase(phase, at(49, 0), goals);
  assert.equal(phase, 'arrived');
  assert.equal(nextTripPhase(phase, { type: 'alighted' }, goals), 'arrived');
  assert.equal(activeLegIndex(phase), null);
});
