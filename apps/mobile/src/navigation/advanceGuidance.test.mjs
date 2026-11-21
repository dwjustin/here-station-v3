import assert from 'node:assert/strict';
import test from 'node:test';

import { advanceGuidance } from './advanceGuidance.ts';

const route = { nodes: [{ id: 'start' }, { id: 'stairs' }, { id: 'exit' }] };

test('advances only when the next target is reached', () => {
  assert.equal(advanceGuidance(route, 0, 'stairs'), 1);
  assert.equal(advanceGuidance(route, 1, 'exit'), 2);
});

test('ignores duplicate and out-of-order arrival events', () => {
  assert.equal(advanceGuidance(route, 0, 'exit'), 0);
  assert.equal(advanceGuidance(route, 1, 'stairs'), 1);
});

test('stops at the destination', () => {
  assert.equal(advanceGuidance(route, 2, 'exit'), 2);
  assert.equal(advanceGuidance(route, 2, 'unknown'), 2);
});
