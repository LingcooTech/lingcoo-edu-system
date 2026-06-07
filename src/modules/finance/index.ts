import { z } from 'zod';

import * as financeRepo from '../../db/repositories/finance.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as settlementsRepo from '../../db/repositories/settlements.js';
import { readBusinessModel } from '../../lib/business-model.js';
import { httpError } from '../../lib/http-error.js';
import type { AppModule } from '../types.js';

const orderSchema = z.object({
  studentId: z.string(),
  courseId: z.string(),
  packageId: z.string().optional(),
  amount: z.number().int().nonnegative(),
  paidAmount: z.number().int().nonnegative(),
  lessonCount: z.number().int().positive(),
  status: z.enum(['pending', 'paid', 'refunded', 'cancelled']).default('paid'),
  paymentReceiverType: z.enum(['platform', 'provider', 'other']).optional(),
  paymentReceiverInstitutionId: z.string().nullable().optional(),
  paymentReceiverName: z.string().nullable().optional(),
  paymentMethod: z.string().max(40).nullable().optional(),
  offlinePaymentNote: z.string().nullable().optional(),
});

const manualPackageGrantSchema = z.object({
  studentId: z.string(),
  packageId: z.string(),
  paidAmount: z.number().int().nonnegative(),
  paymentMethod: z.enum([
    'cash',
    'bank_transfer',
    'wechat_offline',
    'alipay_offline',
    'offline_other',
  ]),
  offlinePaymentNote: z.string().max(500).optional(),
});

const settlementBatchSchema = z.object({
  paymentReceiverType: z.enum(['platform', 'provider', 'other']),
  paymentReceiverInstitutionId: z.string().nullable().optional(),
  paymentReceiverName: z.string().min(1).max(160),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const financeModule: AppModule = {
  name: 'finance',
  async register(app) {
    app.get('/v1/orders', { preHandler: app.requireAdmin }, async () => {
      const [orders, students, courses, packages] = await Promise.all([
        financeRepo.listOrders(app.db),
        peopleRepo.listStudents(app.db),
        catalogRepo.listCourses(app.db),
        packagesRepo.listPackages(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const packageById = new Map(
        packages.map((coursePackage) => [coursePackage.id, coursePackage]),
      );

      return {
        orders: orders.map((order) => ({
          ...order,
          student: order.studentId ? studentById.get(order.studentId) : undefined,
          course: order.courseId ? courseById.get(order.courseId) : undefined,
          package: order.packageId ? packageById.get(order.packageId) : undefined,
        })),
      };
    });

    app.get('/v1/settlement-batches', { preHandler: app.requireAdmin }, async () => {
      return { settlementBatches: await settlementsRepo.listSettlementBatches(app.db) };
    });

    app.post('/v1/settlement-batches', { preHandler: app.requireAdmin }, async (request) => {
      const body = settlementBatchSchema.parse(request.body);
      const settlementBatch = await settlementsRepo.createSettlementBatch(app.db, {
        paymentReceiverType: body.paymentReceiverType,
        paymentReceiverInstitutionId: body.paymentReceiverInstitutionId ?? null,
        paymentReceiverName: body.paymentReceiverName,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        note: body.note ?? null,
        createdByAccountId: request.account!.id,
      });
      return { settlementBatch };
    });

    app.post(
      '/v1/settlement-batches/:settlementBatchId/void',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { settlementBatchId } = request.params as { settlementBatchId: string };
        const settlementBatch = await settlementsRepo.voidSettlementBatch(
          app.db,
          settlementBatchId,
        );
        return { settlementBatch };
      },
    );

    app.post('/v1/orders', { preHandler: app.requireAdmin }, async (request) => {
      const body = orderSchema.parse(request.body);
      await peopleRepo.requireStudent(app.db, body.studentId);
      await catalogRepo.requireCourse(app.db, body.courseId);

      const order = await financeRepo.createOrder(app.db, {
        studentId: body.studentId,
        courseId: body.courseId,
        packageId: body.packageId,
        orderType: 'manual_package_grant',
        amount: body.amount,
        paidAmount: body.paidAmount,
        lessonCount: body.lessonCount,
        status: body.status,
        paymentReceiverType: body.paymentReceiverType,
        paymentReceiverInstitutionId: body.paymentReceiverInstitutionId,
        paymentReceiverName: body.paymentReceiverName,
        paymentMethod: body.paymentMethod,
        offlinePaymentNote: body.offlinePaymentNote,
      });

      return { order };
    });

    app.post(
      '/v1/orders/manual-package-grants',
      { preHandler: app.requireAdmin },
      async (request) => {
        const body = manualPackageGrantSchema.parse(request.body);
        const [organization, student, pkg] = await Promise.all([
          organizationRepo.requireOrganization(app.db),
          peopleRepo.requireStudent(app.db, body.studentId),
          packagesRepo.requirePackage(app.db, body.packageId),
        ]);
        const businessModel = readBusinessModel(organization.settings);
        if (!businessModel.manualPackageGrantEnabled) {
          throw httpError(403, '当前业务开关未开启后台手动添加课时包');
        }
        if (pkg.status !== 'active') {
          throw httpError(422, '该课时包已下架');
        }
        if (!pkg.courseId) {
          throw httpError(422, '该课时包未绑定课程，不能添加课时');
        }
        const course = await catalogRepo.requireCourse(app.db, pkg.courseId);
        const order = await financeRepo.createOrder(app.db, {
          studentId: student.id,
          courseId: course.id,
          packageId: pkg.id,
          orderType: 'manual_package_grant',
          amount: pkg.priceAmount,
          paidAmount: body.paidAmount,
          lessonCount: pkg.lessonCount,
          status: 'paid',
          paymentReceiverType: course.paymentReceiverType,
          paymentReceiverInstitutionId: course.paymentReceiverInstitutionId,
          paymentReceiverName:
            course.paymentReceiverName || organization.brandName || organization.name,
          paymentMethod: body.paymentMethod,
          offlinePaymentNote: body.offlinePaymentNote,
        });

        return {
          order: {
            ...order,
            student,
            course,
            package: pkg,
          },
        };
      },
    );
  },
};
