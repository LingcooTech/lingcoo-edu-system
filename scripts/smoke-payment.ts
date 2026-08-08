// Phase 6 smoke test — verifies the mock buy→credit loop and its idempotency
// against the real database. Exercises PaymentService (which fires the parent
// notification) + the transactional finance repo. Safe to re-run.
//
//   npx tsx scripts/smoke-payment.ts
import { eq } from 'drizzle-orm';

import { createDb } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import * as financeRepo from '../src/db/repositories/finance.js';
import * as packagesRepo from '../src/db/repositories/packages.js';
import * as paymentsRepo from '../src/db/repositories/payments.js';
import * as lessonMovementsRepo from '../src/db/repositories/lesson-movements.js';
import { hashPassword } from '../src/lib/password.js';
import { loadEnv } from '../src/lib/env.js';
import { PaymentService } from '../src/modules/payment/service.js';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL);

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label} ${detail}`);
  }
}

// Minimal Fastify-like stub: PaymentService only needs db + appEnv.
const appStub = { db, appEnv: env } as unknown as ConstructorParameters<typeof PaymentService>[0];

async function main() {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.name, '小宇'))
    .limit(1);
  if (!student?.guardianId) throw new Error('seed student 小宇 (with guardian) missing');

  const [course] = await db
    .select()
    .from(schema.courses)
    .limit(1);
  if (!course) throw new Error('seed course missing');

  // find-or-create an active 10-lesson package
  const existingPackages = await packagesRepo.listActivePackages(db);
  const pkg =
    existingPackages.find((p) => p.name === '智慧成长 10 课时包') ??
    (await packagesRepo.createPackage(db, {
      courseId: course.id,
      name: '智慧成长 10 课时包',
      description: '体验套餐',
      lessonCount: 10,
      priceAmount: 99800,
      status: 'active',
    }));

  // find-or-create a parent account linked to the student's guardian
  let [account] = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, 'smoke-parent@fd-edu.local'))
    .limit(1);
  if (!account) {
    [account] = await db
      .insert(schema.accounts)
      .values({
        role: 'parent',
        email: 'smoke-parent@fd-edu.local',
        passwordHash: hashPassword('smoke123456'),
        displayName: '冒烟测试家长',
        guardianId: student.guardianId,
        emailVerifiedAt: new Date(),
      })
      .returning();
  } else if (account.guardianId !== student.guardianId) {
    [account] = await db
      .update(schema.accounts)
      .set({ guardianId: student.guardianId })
      .where(eq(schema.accounts.id, account.id))
      .returning();
  }

  // balance before
  const balanceBefore = await lessonMovementsRepo.getStudentAvailableBalance(db, {
    studentId: student.id,
  });

  console.log('\n[1] create pending package order');
  const order = await financeRepo.createPackageOrder(db, {
    accountId: account.id,
    packageId: pkg.id,
    studentId: student.id,
    courseId: course.id,
    amount: pkg.priceAmount,
    lessonCount: pkg.lessonCount,
    currency: 'CNY',
  });
  check('order created pending', order.status === 'pending', `(status=${order.status})`);
  check('order amount matches package', order.amount === pkg.priceAmount);
  check('order lessonCount matches package', order.lessonCount === pkg.lessonCount);

  console.log('\n[2] mock-pay → settle');
  const service = new PaymentService(appStub);
  const paid = await service.markMockPaid({ orderNo: order.orderNo });
  check('order now paid', paid.item.status === 'paid', `(status=${paid.item.status})`);
  check('paidAmount set', paid.item.paidAmount === pkg.priceAmount);

  const balanceAfter = await lessonMovementsRepo.getStudentAvailableBalance(db, {
    studentId: student.id,
  });
  check(
    `lesson balance credited +${pkg.lessonCount}`,
    balanceAfter === balanceBefore + pkg.lessonCount,
    `(before=${balanceBefore} after=${balanceAfter})`,
  );

  const [contract] = await db
    .select()
    .from(schema.courseContracts)
    .where(eq(schema.courseContracts.orderId, order.id))
    .limit(1);
  if (!contract) throw new Error('paid order did not create a course contract');
  const movements = await lessonMovementsRepo.listMovementsForContracts(db, [contract.id]);
  check('exactly one grant movement for this order', movements.length === 1, `(found=${movements.length})`);
  check('movement type=grant', movements[0]?.type === 'grant');

  const payRows = await paymentsRepo.listByOrderNo(db, order.orderNo);
  check('exactly one payment row', payRows.length === 1, `(found=${payRows.length})`);

  const notifs = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.dedupeKey, `payment.paid:${order.orderNo}:mock:mock_${order.orderNo}`));
  check('exactly one paid notification', notifs.length === 1, `(found=${notifs.length})`);

  console.log('\n[3] replay mock-pay → idempotent (no double credit / no dup rows)');
  const replay = await service.markMockPaid({ orderNo: order.orderNo });
  check('replay still reports paid', replay.item.status === 'paid');

  const balanceReplay = await lessonMovementsRepo.getStudentAvailableBalance(db, {
    studentId: student.id,
  });
  check(
    'balance unchanged after replay',
    balanceReplay === balanceAfter,
    `(after=${balanceAfter} replay=${balanceReplay})`,
  );

  const movementsReplay = await lessonMovementsRepo.listMovementsForContracts(db, [contract.id]);
  check('still exactly one movement after replay', movementsReplay.length === 1, `(found=${movementsReplay.length})`);

  const payRowsReplay = await paymentsRepo.listByOrderNo(db, order.orderNo);
  check('still exactly one payment row after replay', payRowsReplay.length === 1, `(found=${payRowsReplay.length})`);

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
}

main()
  .catch((error) => {
    console.error('smoke test crashed:', error);
    failed += 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit(failed === 0 ? 0 : 1);
  });
