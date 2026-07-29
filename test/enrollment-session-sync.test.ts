import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldSyncEnrollmentToSession } from '../src/db/repositories/scheduling.js';

const joinedAt = new Date('2026-07-23T08:54:00.000Z');

test('syncs completed sessions on or after the enrollment time', () => {
  assert.equal(
    shouldSyncEnrollmentToSession(
      { status: 'completed', startsAt: new Date('2026-07-27T01:00:00.000Z') },
      joinedAt,
    ),
    true,
  );
});

test('syncs future scheduled sessions', () => {
  assert.equal(
    shouldSyncEnrollmentToSession(
      { status: 'scheduled', startsAt: new Date('2026-07-30T01:00:00.000Z') },
      joinedAt,
    ),
    true,
  );
});

test('does not sync sessions before enrollment or cancelled sessions', () => {
  assert.equal(
    shouldSyncEnrollmentToSession(
      { status: 'completed', startsAt: new Date('2026-07-22T01:00:00.000Z') },
      joinedAt,
    ),
    false,
  );
  assert.equal(
    shouldSyncEnrollmentToSession(
      { status: 'cancelled', startsAt: new Date('2026-07-27T01:00:00.000Z') },
      joinedAt,
    ),
    false,
  );
});
