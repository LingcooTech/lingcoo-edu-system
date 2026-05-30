import { z } from 'zod';

import * as financeRepo from '../../db/repositories/finance.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
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
    app.get('/v1/orders', { preHandler: app.authenticate }, async () => {
      const [orders, students, courses] = await Promise.all([
        financeRepo.listOrders(app.db),
        peopleRepo.listStudents(app.db),
        catalogRepo.listCourses(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));

      return {
        orders: orders.map((order) => ({
          ...order,
          student: order.studentId ? studentById.get(order.studentId) : undefined,
          course: order.courseId ? courseById.get(order.courseId) : undefined,
        })),
      };
    });

    app.post('/v1/orders', { preHandler: app.authenticate }, async (request) => {
      const body = orderSchema.parse(request.body);
      await peopleRepo.requireStudent(app.db, body.studentId);
      await catalogRepo.requireCourse(app.db, body.courseId);

      const order = await financeRepo.createOrder(app.db, {
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
