import { z } from 'zod';

import * as financeRepo from '../../db/repositories/finance.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import { requireTenant } from '../../db/repositories/tenant.js';
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
      await requireTenant(app.db, tenantId);

      const [orders, students, courses] = await Promise.all([
        financeRepo.listOrders(app.db, tenantId),
        peopleRepo.listStudents(app.db, tenantId),
        catalogRepo.listCourses(app.db, tenantId),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));

      return {
        orders: orders.map((order) => ({
          ...order,
          student: studentById.get(order.studentId),
          course: courseById.get(order.courseId),
        })),
      };
    });

    app.post('/v1/tenants/:tenantId/orders', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      const body = orderSchema.parse(request.body);
      await peopleRepo.requireStudent(app.db, tenantId, body.studentId);
      await catalogRepo.requireCourse(app.db, tenantId, body.courseId);

      const order = await financeRepo.createOrder(app.db, {
        tenantId,
        studentId: body.studentId,
        courseId: body.courseId,
        amount: body.amount,
        paidAmount: body.paidAmount,
        lessonCount: body.lessonCount,
        status: body.status,
      });

      return { order };
    });
  },
};
