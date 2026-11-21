import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceGuidance } from './advanceGuidance.ts';

const transitions = [
  ['originWalk', 'platformReached', 'platform'],
  ['platform', 'boarded', 'onTrain'],
  ['onTrain', 'alighted', 'destinationPosition'],
  ['destinationPosition', 'positionConfirmed', 'destinationWalk'],
  ['destinationWalk', 'exitReached', 'arrived'],
];

test('walks, boards, alights and confirms the destination position in order', () => {
  let phase = 'originWalk';
  for (const [from, event, to] of transitions) {
    assert.equal(phase, from);
    phase = advanceGuidance(phase, event);
    assert.equal(phase, to);
  }
});

test('ignores duplicate, out-of-order and post-arrival events', () => {
  for (const phase of [...transitions.map(([from]) => from), 'arrived']) {
    for (const [, event] of transitions) {
      const expected = transitions.find(([from, action]) => from === phase && action === event);
      assert.equal(advanceGuidance(phase, event), expected?.[2] ?? phase);
    }
  }
});
