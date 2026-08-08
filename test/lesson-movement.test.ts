import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateLessonMovementState } from '../src/db/repositories/lesson-movements.js';

test('lesson movement derives the only package balance snapshot', () => {
  assert.deepEqual(calculateLessonMovementState(10, 'active', -2), {
    balanceAfter: 8,
    status: 'active',
  });
  assert.deepEqual(calculateLessonMovementState(2, 'active', -2), {
    balanceAfter: 0,
    status: 'completed',
  });
  assert.deepEqual(calculateLessonMovementState(0, 'completed', 3), {
    balanceAfter: 3,
    status: 'active',
  });
});

test('lesson movement rejects invalid or overdrawn units', () => {
  assert.throws(() => calculateLessonMovementState(1, 'active', -2));
  assert.throws(() => calculateLessonMovementState(1, 'active', 0));
  assert.throws(() => calculateLessonMovementState(1, 'active', 0.5));
  assert.throws(() => calculateLessonMovementState(-1, 'active', 1));
});
