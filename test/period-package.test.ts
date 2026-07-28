import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoursePackage } from '../src/db/repositories/packages.js';
import { calculatePeriodEnd, periodPackageLabel } from '../src/db/repositories/packages.js';

function periodPackage(periodUnit: 'week' | 'month', periodCount: number): CoursePackage {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    courseId: '00000000-0000-0000-0000-000000000002',
    courseSeriesId: null,
    name: '周期卡',
    description: '',
    billingType: 'period',
    periodUnit,
    periodCount,
    lessonCount: 20,
    giftedLessonCount: 0,
    priceAmount: 10000,
    discountPriceAmount: null,
    status: 'active',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

test('calculates inclusive weekly period end', () => {
  const end = calculatePeriodEnd(new Date('2026-07-01T00:00:00.000Z'), periodPackage('week', 1));
  assert.equal(end?.toISOString(), '2026-07-07T23:59:59.999Z');
  assert.equal(periodPackageLabel(periodPackage('week', 1)), '1周');
});

test('calculates inclusive monthly period end', () => {
  const end = calculatePeriodEnd(new Date('2026-07-01T00:00:00.000Z'), periodPackage('month', 1));
  assert.equal(end?.toISOString(), '2026-07-31T23:59:59.999Z');
  assert.equal(periodPackageLabel(periodPackage('month', 1)), '1个月');
});
