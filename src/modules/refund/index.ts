import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';

import * as financeRepo from '../../db/repositories/finance.js';
import * as refundsRepo from '../../db/repositories/refunds.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import { NotificationsService } from '../notifications/service.js';
import type { AppModule } from '../types.js';

const refundReasonSchema = z.enum([
  'schedule_conflict',
  'course_not_fit',
  'duplicate_payment',
  'service_issue',
  'other',
]);

const refundCreateSchema = z.object({
  reason: refundReasonSchema,
  buyerNote: z.string().max(500).optional(),
});

const refundListQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  search: z.string().max(120).optional(),
});

const refundDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  adminNote: z.string().max(500).optional(),
});

const REFUND_REASON_LABEL: Record<z.infer<typeof refundReasonSchema>, string> = {
  schedule_conflict: '时间冲突',
  course_not_fit: '课程不合适',
  duplicate_payment: '重复支付',
  service_issue: '服务问题',
  other: '其他原因',
};

export const refundModule: AppModule = {
  name: 'refund',
  async register(app) {
    async function canAccountAccessOrder(
      accountId: string,
      order: typeof schema.orders.$inferSelect,
    ) {
      if (order.accountId === accountId) {
        return true;
      }
      if (!order.studentId) {
        return false;
      }

      const [account] = await app.db
        .select({ guardianId: schema.accounts.guardianId })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, accountId))
        .limit(1);
      if (!account?.guardianId) {
        return false;
      }

      const [student] = await app.db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.id, order.studentId),
            eq(schema.students.guardianId, account.guardianId),
            ne(schema.students.status, 'archived'),
          ),
        )
        .limit(1);
      return Boolean(student);
    }

    app.post(
      '/public/me/orders/:orderNo/refund',
      { preHandler: app.requireParent },
      async (request) => {
        const { orderNo } = request.params as { orderNo: string };
        const body = refundCreateSchema.parse(request.body);
        const order = await financeRepo.findOrderByOrderNo(app.db, orderNo);

        if (!order || !(await canAccountAccessOrder(request.account!.id, order))) {
          throw httpError(404, 'Order not found');
        }

        const refund = await refundsRepo.createRefundRequest(app.db, {
          order,
          accountId: request.account!.id,
          reason: body.reason,
          buyerNote: body.buyerNote,
        });

        await new NotificationsService(app.db).create({
          recipientType: 'parent',
          recipientId: request.account!.id,
          category: 'refund',
          level: 'info',
          title: '退款申请已提交',
          body: `订单 ${order.orderNo} 的退款申请已受理，工作人员会尽快审核。`,
          ctaLabel: '查看订单',
          ctaUrl: '/pages/account-orders/index',
          sourceEventName: 'refund.applied',
          dedupeKey: `refund.applied:${refund.id}`,
        });

        return { refund };
      },
    );

    app.get('/public/me/refunds', { preHandler: app.requireParent }, async (request) => {
      return {
        refunds: await refundsRepo.listRefundRequestsByAccount(app.db, request.account!.id),
      };
    });

    app.get('/v1/refunds', { preHandler: app.requireAdmin }, async (request) => {
      const query = refundListQuerySchema.parse(request.query);
      return { refunds: await refundsRepo.listRefundRequests(app.db, query) };
    });

    app.post(
      '/v1/refunds/:refundId/decision',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { refundId } = request.params as { refundId: string };
        const body = refundDecisionSchema.parse(request.body);

        const outcome =
          body.decision === 'approve'
            ? await refundsRepo.approveRefundRequestAndReverseOrder(app.db, {
                id: refundId,
                adminNote: body.adminNote,
                decidedByAccountId: request.account!.id,
              })
            : {
                refund: await refundsRepo.rejectRefundRequest(app.db, {
                  id: refundId,
                  adminNote: body.adminNote,
                  decidedByAccountId: request.account!.id,
                }),
                order: null,
              };

        const refund = outcome.refund;
        const order =
          outcome.order ?? (await financeRepo.findOrderByOrderNo(app.db, refund.orderNo));
        if (refund.accountId && order) {
          const reasonLabel = REFUND_REASON_LABEL[refund.reason] ?? '其他原因';
          await new NotificationsService(app.db).create({
            recipientType: 'parent',
            recipientId: refund.accountId,
            category: 'refund',
            level: body.decision === 'approve' ? 'success' : 'warning',
            title: body.decision === 'approve' ? '退款申请已通过' : '退款申请未通过',
            body:
              body.decision === 'approve'
                ? `订单 ${order.orderNo}（${reasonLabel}）已标记退款。`
                : `订单 ${order.orderNo} 的退款申请未通过${body.adminNote ? `：${body.adminNote}` : ''}`,
            ctaLabel: '查看订单',
            ctaUrl: '/pages/account-orders/index',
            sourceEventName: body.decision === 'approve' ? 'refund.approved' : 'refund.rejected',
            dedupeKey: `refund.${body.decision}:${refund.id}`,
          });
        }

        return { refund, order };
      },
    );
  },
};
