import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as courseContractsRepo from '../../db/repositories/course-contracts.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import { readBusinessModel } from '../../lib/business-model.js';
import { httpError } from '../../lib/http-error.js';
import { resolvePaymentReceiverName } from '../../lib/payment-receiver.js';
import type { AppModule } from '../types.js';
import { eq } from 'drizzle-orm';

const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'wechat_offline',
  'alipay_offline',
  'offline_other',
]);

const courseContractSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  packageId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  lessonCount: z.number().int().positive(),
  paidAmount: z.number().int().nonnegative(),
  paymentMethod: paymentMethodSchema,
  paymentReceiverType: z.enum(['platform', 'provider', 'other']).optional(),
  paymentReceiverInstitutionId: z.string().uuid().nullable().optional(),
  paymentReceiverName: z.string().max(160).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

const courseContractConversionSchema = courseContractSchema.omit({ studentId: true }).extend({
  school: z.string().max(160).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled']),
});

function normalizeDate(value?: string | null) {
  return value ? new Date(value) : null;
}

export const courseContractsModule: AppModule = {
  name: 'course-contracts',
  async register(app) {
    async function resolveContractDefaults(
      body: Pick<
        z.infer<typeof courseContractSchema>,
        'courseId' | 'paymentReceiverType' | 'paymentReceiverInstitutionId' | 'paymentReceiverName'
      >,
    ) {
      const [organization, course] = await Promise.all([
        organizationRepo.requireOrganization(app.db),
        catalogRepo.requireCourse(app.db, body.courseId),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      if (!businessModel.manualPackageGrantEnabled) {
        throw httpError(403, '当前业务开关未开启后台手动添加课时包');
      }

      const paymentReceiverInstitutionId =
        body.paymentReceiverInstitutionId ?? course.paymentReceiverInstitutionId ?? null;
      const paymentReceiverType = body.paymentReceiverType ?? course.paymentReceiverType;
      const [paymentReceiverInstitution, providerInstitution] = await Promise.all([
        teachingRepo.findInstitution(app.db, paymentReceiverInstitutionId),
        teachingRepo.findInstitution(app.db, course.providerInstitutionId),
      ]);

      return {
        organization,
        course,
        paymentReceiverType,
        paymentReceiverInstitutionId,
        paymentReceiverName: resolvePaymentReceiverName({
          paymentReceiverType,
          receiverInstitutionName: paymentReceiverInstitution?.name,
          providerInstitutionName: providerInstitution?.name,
          legacyDisplayName: body.paymentReceiverName || course.paymentReceiverName,
          organizationBrandName: organization.brandName,
          organizationName: organization.name,
        }),
      };
    }

    function buildContractPayload(
      body: z.infer<typeof courseContractConversionSchema>,
      defaults: Awaited<ReturnType<typeof resolveContractDefaults>>,
    ) {
      return {
        courseId: body.courseId,
        classId: body.classId ?? null,
        packageId: body.packageId ?? null,
        title: body.title ?? null,
        lessonCount: body.lessonCount,
        paidAmount: body.paidAmount,
        paymentMethod: body.paymentMethod,
        paymentReceiverType: defaults.paymentReceiverType,
        paymentReceiverInstitutionId: defaults.paymentReceiverInstitutionId,
        paymentReceiverName: defaults.paymentReceiverName,
        startsAt: normalizeDate(body.startsAt),
        endsAt: normalizeDate(body.endsAt),
        note: body.note ?? null,
      };
    }

    function registerLeadContractRoute(prefix: string) {
      app.post(
        `${prefix}/leads/:leadId/course-contract`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const body = courseContractConversionSchema.parse(request.body);
          const defaults = await resolveContractDefaults(body);
          return courseContractsRepo.createCourseContractFromLead(app.db, {
            ...buildContractPayload(body, defaults),
            leadId,
            school: body.school ?? null,
            createdByAccountId: request.account!.id,
          });
        },
      );
    }

    app.get('/v1/course-contracts', { preHandler: app.requireAdmin }, async () => {
      return {
        courseContracts: await courseContractsRepo.listCourseContracts(app.db),
      };
    });

    app.post('/v1/course-contracts', { preHandler: app.requireAdmin }, async (request) => {
      const body = courseContractSchema.parse(request.body);
      const defaults = await resolveContractDefaults(body);

      const result = await courseContractsRepo.createCourseContract(app.db, {
        studentId: body.studentId,
        ...buildContractPayload(body, defaults),
        createdByAccountId: request.account!.id,
      });

      return result;
    });

    registerLeadContractRoute('/v1');
    registerLeadContractRoute('/v1/crm');

    app.post(
      '/v1/seat-reservations/:seatReservationId/course-contract',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        const body = courseContractConversionSchema.parse(request.body);
        const defaults = await resolveContractDefaults(body);
        return courseContractsRepo.createCourseContractFromSeatReservation(app.db, {
          ...buildContractPayload(body, defaults),
          seatReservationId,
          school: body.school ?? null,
          createdByAccountId: request.account!.id,
        });
      },
    );

    app.patch(
      '/v1/course-contracts/:courseContractId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseContractId } = request.params as { courseContractId: string };
        const body = courseContractSchema.partial().parse(request.body);

        const updateData: Record<string, unknown> = {};

        if (body.title !== undefined) updateData.title = body.title || null;
        if (body.lessonCount !== undefined) updateData.lessonCount = body.lessonCount;
        if (body.paidAmount !== undefined) updateData.paidAmount = body.paidAmount;
        if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
        if (body.startsAt !== undefined) updateData.startsAt = body.startsAt;
        if (body.endsAt !== undefined) updateData.endsAt = body.endsAt;
        if (body.note !== undefined) updateData.note = body.note || null;

        const [courseContract] = await app.db
          .update(schema.courseContracts)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(schema.courseContracts.id, courseContractId))
          .returning();

        if (!courseContract) {
          throw httpError(404, 'Course contract not found');
        }

        return { courseContract };
      },
    );

    app.patch(
      '/v1/course-contracts/:courseContractId/status',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseContractId } = request.params as { courseContractId: string };
        const body = statusSchema.parse(request.body);
        const courseContract = await courseContractsRepo.updateCourseContractStatus(
          app.db,
          courseContractId,
          body.status,
        );
        return { courseContract };
      },
    );
  },
};
