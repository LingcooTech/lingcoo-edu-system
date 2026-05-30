// Phase 6 smoke test — verifies the mock buy→credit loop and its idempotency
// against the real database. Exercises PaymentService (which fires the parent
// notification) + the transactional finance repo. Safe to re-run.
//
//   npx tsx scripts/smoke-payment.ts
import { and, eq } from 'drizzle-orm';

import { createDb } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import * as financeRepo from '../src/db/repositories/finance.js';
import * as packagesRepo from '../src/db/repositories/packages.js';
import * as paymentsRepo from '../src/db/repositories/payments.js';
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

  // find-or-create a parent linked to the student's guardian
  let [parent] = await db
    .select()
    .from(schema.parents)
    .where(eq(schema.parents.email, 'smoke-parent@fd-edu.local'))
    .limit(1);
  if (!parent) {
    [parent] = await db
      .insert(schema.parents)
      .values({
        email: 'smoke-parent@fd-edu.local',
        passwordHash: await hashPassword('smoke123456'),
        displayName: '冒烟测试家长',
        guardianId: student.guardianId,
        emailVerifiedAt: new Date(),
      })
      .returning();
  } else if (parent.guardianId !== student.guardianId) {
    [parent] = await db
      .update(schema.parents)
      .set({ guardianId: student.guardianId })
      .where(eq(schema.parents.id, parent.id))
      .returning();
  }

  // balance before
  const [accountBefore] = await db
    .select()
    .from(schema.lessonAccounts)
    .where(and(eq(schema.lessonAccounts.studentId, student.id), eq(schema.lessonAccounts.courseId, course.id)))
    .limit(1);
  const balanceBefore = accountBefore?.balance ?? 0;

  console.log('\n[1] create pending package order');
  const order = await financeRepo.createPackageOrder(db, {
    parentId: parent.id,
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
  const paid = await service.markMockPaid({ orderNo: order.orderNo, parentId: parent.id });
  check('order now paid', paid.item.status === 'paid', `(status=${paid.item.status})`);
  check('paidAmount set', paid.item.paidAmount === pkg.priceAmount);

  const [accountAfter] = await db
    .select()
    .from(schema.lessonAccounts)
    .where(and(eq(schema.lessonAccounts.studentId, student.id), eq(schema.lessonAccounts.courseId, course.id)))
    .limit(1);
  check(
    `lesson balance credited +${pkg.lessonCount}`,
    (accountAfter?.balance ?? 0) === balanceBefore + pkg.lessonCount,
    `(before=${balanceBefore} after=${accountAfter?.balance})`,
  );

  const txns = await db
    .select()
    .from(schema.lessonTransactions)
    .where(
      and(
        eq(schema.lessonTransactions.relatedEntityType, 'order'),
        eq(schema.lessonTransactions.relatedEntityId, order.id),
      ),
    );
  check('exactly one purchase ledger row for this order', txns.length === 1, `(found=${txns.length})`);
  check('ledger row type=purchase', txns[0]?.type === 'purchase');

  const payRows = await paymentsRepo.listByOrderNo(db, order.orderNo);
  check('exactly one payment row', payRows.length === 1, `(found=${payRows.length})`);

  const notifs = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.dedupeKey, `payment.paid:${order.orderNo}:mock:mock_${order.orderNo}`));
  check('exactly one paid notification', notifs.length === 1, `(found=${notifs.length})`);

  console.log('\n[3] replay mock-pay → idempotent (no double credit / no dup rows)');
  const replay = await service.markMockPaid({ orderNo: order.orderNo, parentId: parent.id });
  check('replay still reports paid', replay.item.status === 'paid');

  const [accountReplay] = await db
    .select()
    .from(schema.lessonAccounts)
    .where(and(eq(schema.lessonAccounts.studentId, student.id), eq(schema.lessonAccounts.courseId, course.id)))
    .limit(1);
  check(
    'balance unchanged after replay',
    (accountReplay?.balance ?? 0) === (accountAfter?.balance ?? 0),
    `(after=${accountAfter?.balance} replay=${accountReplay?.balance})`,
  );

  const txnsReplay = await db
    .select()
    .from(schema.lessonTransactions)
    .where(
      and(
        eq(schema.lessonTransactions.relatedEntityType, 'order'),
        eq(schema.lessonTransactions.relatedEntityId, order.id),
      ),
    );
  check('still exactly one ledger row after replay', txnsReplay.length === 1, `(found=${txnsReplay.length})`);

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
