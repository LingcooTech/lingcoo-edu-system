import { z } from 'zod';

import { createId, requireCourse, requireStudent, requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

const orderSchema = z.object({
  studentId: z.string(),
  courseId: z.string(),
  amount: z.number().int().nonnegative(),
  paidAmount: z.number().int().nonnegative(),
  lessonCount: z.number().int().positive(),
  status: z.enum(['pending', 'paid', 'refunded', 'cancelled']).default('paid'),
});

export const financeModule: AppModule = {
  name: 'finance',
  async register(app) {
    app.get('/v1/tenants/:tenantId/orders', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      return {
        orders: store.orders
          .filter((order) => order.tenantId === tenantId)
          .map((order) => ({
            ...order,
            student: store.students.find((student) => student.id === order.studentId),
            course: store.courses.find((course) => course.id === order.courseId),
          })),
      };
    });

    app.post('/v1/tenants/:tenantId/orders', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      const body = orderSchema.parse(request.body);
      requireStudent(tenantId, body.studentId);
      requireCourse(tenantId, body.courseId);

      const order = {
        id: createId('order'),
        tenantId,
        orderNo: `EDU${Date.now()}`,
        paidAt: body.status === 'paid' ? new Date().toISOString() : undefined,
        createdAt: new Date().toISOString(),
        ...body,
      };
      store.orders.unshift(order);

      if (order.status === 'paid') {
        let account = store.lessonAccounts.find(
          (item) => item.studentId === order.studentId && item.courseId === order.courseId,
        );
        if (!account) {
          account = {
            id: createId('lesson_account'),
            tenantId,
            studentId: order.studentId,
            courseId: order.courseId,
            balance: 0,
          };
          store.lessonAccounts.unshift(account);
        }
        account.balance += order.lessonCount;
        store.lessonTransactions.unshift({
          id: createId('lesson_tx'),
          tenantId,
          lessonAccountId: account.id,
          studentId: order.studentId,
          type: 'purchase',
          amount: order.lessonCount,
          balanceAfter: account.balance,
          relatedEntityType: 'order',
          relatedEntityId: order.id,
          createdAt: new Date().toISOString(),
        });
      }

      return { order };
    });
  },
};
