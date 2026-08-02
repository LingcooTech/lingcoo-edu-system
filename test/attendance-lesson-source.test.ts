import assert from 'node:assert/strict';
import test from 'node:test';

import { compareAttendanceLessonSourcePriority } from '../src/db/repositories/attendance.js';

function source(
  id: string,
  billingType: 'lesson' | 'period',
  endsAt: string | null,
  createdAt: string,
) {
  return {
    id,
    billingType,
    endsAt: endsAt ? new Date(endsAt) : null,
    createdAt: new Date(createdAt),
  };
}

test('auto lesson-source selection prioritizes an active period package', () => {
  const sources = [
    source('short-package', 'lesson', null, '2026-01-01T00:00:00.000Z'),
    source('monthly-card', 'period', '2026-08-31T23:59:59.999Z', '2026-08-01T00:00:00.000Z'),
  ].sort(compareAttendanceLessonSourcePriority);

  assert.deepEqual(
    sources.map((item) => item.id),
    ['monthly-card', 'short-package'],
  );
});

test('ordinary packages use earliest-expiry then oldest-purchase order', () => {
  const sources = [
    source('no-expiry', 'lesson', null, '2026-01-01T00:00:00.000Z'),
    source('later-expiry', 'lesson', '2026-12-31T23:59:59.999Z', '2026-02-01T00:00:00.000Z'),
    source('early-expiry', 'lesson', '2026-09-30T23:59:59.999Z', '2026-03-01T00:00:00.000Z'),
  ].sort(compareAttendanceLessonSourcePriority);

  assert.deepEqual(
    sources.map((item) => item.id),
    ['early-expiry', 'later-expiry', 'no-expiry'],
  );
});
