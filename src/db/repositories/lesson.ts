import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

export async function listLessonAccounts(db: Database) {
  return db.select().from(schema.lessonAccounts);
}

export async function listLessonTransactions(db: Database) {
  return db
    .select()
    .from(schema.lessonTransactions)
    .orderBy(desc(schema.lessonTransactions.createdAt));
}

async function findOrCreateAccount(tx: DbOrTx, input: { studentId: string; courseId: string }) {
  const [existing] = await tx
    .select()
    .from(schema.lessonAccounts)
    .where(
      and(
        eq(schema.lessonAccounts.studentId, input.studentId),
        eq(schema.lessonAccounts.courseId, input.courseId),
      ),
    )
    .limit(1)
    // Lock the account row for the duration of the enclosing transaction so two
    // concurrent consumes can't both read the same balance and lose an update.
    .for('update');
  if (existing) {
    return existing;
  }
  const [created] = await tx
    .insert(schema.lessonAccounts)
    .values({
      studentId: input.studentId,
      courseId: input.courseId,
      balance: 0,
    })
    .returning();
  return created;
}

/**
 * Applies a signed lesson delta to a student's course account and writes the
 * matching transaction row, returning the updated account + transaction.
 * `amount` is signed: positive for purchase/adjustment-up, negative for consume.
 * Runs inside the provided tx (caller owns the transaction boundary).
 */
export async function applyLessonDelta(
  tx: DbOrTx,
  input: {
    studentId: string;
    courseId: string;
    type: (typeof schema.lessonTransactionTypeEnum.enumValues)[number];
    amount: number;
    relatedEntityType?: string;
    relatedEntityId?: string;
  },
) {
  const account = await findOrCreateAccount(tx, {
    studentId: input.studentId,
    courseId: input.courseId,
  });
  const balanceAfter = account.balance + input.amount;

  const [updated] = await tx
    .update(schema.lessonAccounts)
    .set({ balance: balanceAfter, updatedAt: new Date() })
    .where(eq(schema.lessonAccounts.id, account.id))
    .returning();

  const [transaction] = await tx
    .insert(schema.lessonTransactions)
    .values({
      lessonAccountId: account.id,
      studentId: input.studentId,
      type: input.type,
      amount: input.amount,
      balanceAfter,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    })
    .returning();

  return { account: updated, transaction };
}
