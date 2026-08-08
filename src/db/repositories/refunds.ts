import { and, desc, eq, inArray } from 'drizzle-orm';

import { httpError } from '../../lib/http-error.js';
import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { applyLessonMovement } from './lesson-movements.js';
import { createAuditLog } from './audit.js';

export type RefundRequest = typeof schema.refundRequests.$inferSelect;
export type RefundRequestStatus = (typeof schema.refundRequestStatusEnum.enumValues)[number];
export type RefundReason = (typeof schema.refundReasonEnum.enumValues)[number];

export async function findRefundRequestById(
  db: Database,
  id: string,
): Promise<RefundRequest | null> {
  const [row] = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, id))
    .limit(1);
  return row ?? null;
}

export async function findOpenRefundRequestByOrderId(
  db: Database,
  orderId: string,
): Promise<RefundRequest | null> {
  const [row] = await db
    .select()
    .from(schema.refundRequests)
    .where(
      and(eq(schema.refundRequests.orderId, orderId), eq(schema.refundRequests.status, 'pending')),
    )
    .limit(1);
  return row ?? null;
}

export async function createRefundRequest(
  db: Database,
  input: {
    order: typeof schema.orders.$inferSelect;
    accountId?: string | null;
    reason: RefundReason;
    buyerNote?: string | null;
  },
): Promise<RefundRequest> {
  if (input.order.status !== 'paid') {
    throw httpError(422, '当前订单状态不可申请退款');
  }

  const existing = await findOpenRefundRequestByOrderId(db, input.order.id);
  if (existing) {
    throw httpError(409, '该订单已有待处理退款申请');
  }

  const [row] = await db
    .insert(schema.refundRequests)
    .values({
      orderId: input.order.id,
      orderNo: input.order.orderNo,
      accountId: input.accountId ?? input.order.accountId ?? null,
      amount: input.order.paidAmount || input.order.amount,
      reason: input.reason,
      buyerNote: input.buyerNote?.trim() || null,
    })
    .returning();
  return row;
}

export async function listRefundRequests(
  db: Database,
  input: {
    status?: RefundRequestStatus;
    search?: string;
  } = {},
) {
  const rows = await db
    .select({
      refund: schema.refundRequests,
      order: schema.orders,
      account: schema.accounts,
    })
    .from(schema.refundRequests)
    .innerJoin(schema.orders, eq(schema.refundRequests.orderId, schema.orders.id))
    .leftJoin(schema.accounts, eq(schema.refundRequests.accountId, schema.accounts.id))
    .orderBy(desc(schema.refundRequests.createdAt));

  const normalizedSearch = input.search?.trim().toLowerCase();
  return rows
    .filter((row) => !input.status || row.refund.status === input.status)
    .filter((row) => {
      if (!normalizedSearch) return true;
      return [
        row.refund.orderNo,
        row.account?.displayName,
        row.account?.phone,
        row.refund.buyerNote,
        row.refund.adminNote,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
}

export async function listRefundRequestsByAccount(db: Database, accountId: string) {
  return db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.accountId, accountId))
    .orderBy(desc(schema.refundRequests.createdAt));
}

export async function listRefundRequestsForOrders(db: Database, orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(schema.refundRequests)
    .where(inArray(schema.refundRequests.orderId, orderIds))
    .orderBy(desc(schema.refundRequests.createdAt));
}

export async function rejectRefundRequest(
  db: Database,
  input: {
    id: string;
    adminNote?: string | null;
    decidedByAccountId: string;
    requestId?: string | null;
  },
): Promise<RefundRequest> {
  const [existing] = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, input.id))
    .limit(1);

  if (!existing) {
    throw httpError(404, 'Refund request not found');
  }
  if (existing.status !== 'pending') {
    throw httpError(409, '该退款申请已处理');
  }

  const [updated] = await db
    .update(schema.refundRequests)
    .set({
      status: 'rejected',
      adminNote: input.adminNote?.trim() || null,
      decidedByAccountId: input.decidedByAccountId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.refundRequests.id, input.id), eq(schema.refundRequests.status, 'pending')))
    .returning();

  if (!updated) {
    throw httpError(409, '该退款申请已处理');
  }

  return updated;
}

export async function approveRefundRequestAndReverseOrder(
  db: Database,
  input: {
    id: string;
    adminNote?: string | null;
    decidedByAccountId: string;
    requestId?: string | null;
  },
): Promise<{ refund: RefundRequest; order: typeof schema.orders.$inferSelect }> {
  return db.transaction(async (tx) => {
    const [refund] = await tx
      .select()
      .from(schema.refundRequests)
      .where(eq(schema.refundRequests.id, input.id))
      .limit(1)
      .for('update');

    if (!refund) {
      throw httpError(404, 'Refund request not found');
    }
    if (refund.status !== 'pending') {
      throw httpError(409, '该退款申请已处理');
    }

    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, refund.orderId))
      .limit(1)
      .for('update');

    if (!order) {
      throw httpError(404, 'Order not found');
    }
    if (order.status === 'refunded') {
      const [updatedRefund] = await tx
        .update(schema.refundRequests)
        .set({
          status: 'approved',
          adminNote: input.adminNote?.trim() || null,
          decidedByAccountId: input.decidedByAccountId,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.refundRequests.id, refund.id))
        .returning();
      return { refund: updatedRefund, order };
    }
    if (order.status !== 'paid') {
      throw httpError(422, 'Only paid orders can be refunded');
    }

    if (
      ['package_purchase', 'manual_package_grant'].includes(order.orderType) &&
      order.studentId &&
      order.courseId &&
      order.lessonCount > 0
    ) {
      const [courseContract] = await tx
        .select()
        .from(schema.courseContracts)
        .where(eq(schema.courseContracts.orderId, order.id))
        .limit(1)
        .for('update');
      if (!courseContract) {
        throw httpError(409, '订单缺少对应课时包档案，请先完成数据核对');
      }
      const giftContracts = await tx
        .select()
        .from(schema.courseContracts)
        .where(eq(schema.courseContracts.parentCourseContractId, courseContract.id))
        .orderBy(schema.courseContracts.id)
        .for('update');
      const refundableContracts = [courseContract, ...giftContracts];
      if (
        refundableContracts.some(
          (contract) => contract.remainingLessonCount !== contract.lessonCount,
        )
      ) {
        throw httpError(422, '该订单课时已被消耗，暂不能自动全额退款');
      }

      for (const contract of refundableContracts.sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        if (contract.remainingLessonCount > 0) {
          await applyLessonMovement(tx, {
            courseContractId: contract.id,
            studentId: contract.studentId,
            operationId: `order:${order.id}:refund:${contract.id}`,
            type: 'refund',
            units: -contract.remainingLessonCount,
            occurredAt: new Date(),
            actorAccountId: input.decidedByAccountId,
            requestId: input.requestId,
            reason: contract.id === courseContract.id ? '订单全额退款' : '主课时包退款，赠课包同步取消',
            metadata: { orderId: order.id, refundRequestId: refund.id },
          });
        }
        await tx
          .update(schema.courseContracts)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(schema.courseContracts.id, contract.id));
        await createAuditLog(tx, {
          actorAccountId: input.decidedByAccountId,
          institutionId: contract.institutionId,
          requestId: input.requestId ?? null,
          action: 'course_contract.cancelled',
          resourceType: 'course_contract',
          resourceId: contract.id,
          summary: `退款取消课时包：${contract.title}`,
          meta: {
            orderId: order.id,
            refundRequestId: refund.id,
            previousStatus: contract.status,
            remainingLessonCount: 0,
          },
        });
      }
    }

    if (order.orderType === 'seat_reservation') {
      const [reservation] = await tx
        .select()
        .from(schema.seatReservations)
        .where(eq(schema.seatReservations.orderNo, order.orderNo))
        .limit(1)
        .for('update');

      if (reservation) {
        if (reservation.checkInStatus === 'checked_in') {
          throw httpError(422, '已核销试听席位不能自动退款');
        }

        await tx
          .update(schema.seatReservations)
          .set({
            reservationStatus: 'cancelled',
            paymentStatus: 'refunded',
            updatedAt: new Date(),
          })
          .where(eq(schema.seatReservations.id, reservation.id));

        if (reservation.reservationStatus === 'reserved' && reservation.trialSessionId) {
          const [trialSession] = await tx
            .select()
            .from(schema.trialSessions)
            .where(eq(schema.trialSessions.id, reservation.trialSessionId))
            .limit(1)
            .for('update');

          if (trialSession) {
            await tx
              .update(schema.trialSessions)
              .set({
                bookedCount: Math.max(0, trialSession.bookedCount - 1),
                updatedAt: new Date(),
              })
              .where(eq(schema.trialSessions.id, trialSession.id));
          }
        }
      }
    }

    const [updatedOrder] = await tx
      .update(schema.orders)
      .set({
        status: 'refunded',
        paidAmount: 0,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, order.id))
      .returning();

    await tx
      .insert(schema.payments)
      .values({
        orderNo: order.orderNo,
        provider: order.paymentProvider ?? order.paymentMethod ?? 'manual',
        providerOrderId: order.providerOrderId ?? null,
        providerEventId: `refund_${order.orderNo}`,
        amount: -order.paidAmount,
        status: 'refunded',
        raw: {
          source: 'refund_request',
          refundRequestId: refund.id,
          decidedByAccountId: input.decidedByAccountId,
        },
      })
      .onConflictDoNothing({ target: schema.payments.providerEventId });

    const [updatedRefund] = await tx
      .update(schema.refundRequests)
      .set({
        status: 'approved',
        adminNote: input.adminNote?.trim() || null,
        decidedByAccountId: input.decidedByAccountId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.refundRequests.id, refund.id))
      .returning();

    return { refund: updatedRefund, order: updatedOrder };
  });
}
