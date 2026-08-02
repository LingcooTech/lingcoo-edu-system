import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as courseContractsRepo from '../../db/repositories/course-contracts.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import { readBusinessModel } from '../../lib/business-model.js';
import { httpError } from '../../lib/http-error.js';
import { resolvePaymentReceiverName } from '../../lib/payment-receiver.js';
import type { AppModule } from '../types.js';
import { and, eq, ne } from 'drizzle-orm';

const paymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'wechat_offline',
  'alipay_offline',
  'offline_other',
]);

const courseContractGiftSchema = z.object({
  courseId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  lessonCount: z.number().int().positive(),
  reason: z.string().max(80).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

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
  gifts: z.array(courseContractGiftSchema).max(20).optional(),
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
        gifts: (body.gifts ?? []).map((gift) => ({
          courseId: gift.courseId,
          classId: gift.classId ?? null,
          title: gift.title ?? null,
          lessonCount: gift.lessonCount,
          reason: gift.reason ?? 'other',
          startsAt: normalizeDate(gift.startsAt),
          endsAt: normalizeDate(gift.endsAt),
          note: gift.note ?? null,
        })),
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

    app.post(
      '/v1/course-contracts/:courseContractId/gifts',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseContractId } = request.params as { courseContractId: string };
        const body = courseContractGiftSchema.parse(request.body);
        return courseContractsRepo.addCourseContractGift(app.db, {
          courseContractId,
          gift: {
            courseId: body.courseId,
            classId: body.classId ?? null,
            title: body.title ?? null,
            lessonCount: body.lessonCount,
            reason: body.reason ?? 'other',
            startsAt: normalizeDate(body.startsAt),
            endsAt: normalizeDate(body.endsAt),
            note: body.note ?? null,
          },
          createdByAccountId: request.account!.id,
        });
      },
    );

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

        const [existingContract] = await app.db
          .select()
          .from(schema.courseContracts)
          .where(eq(schema.courseContracts.id, courseContractId))
          .limit(1);

        if (!existingContract) {
          throw httpError(404, 'Course contract not found');
        }

        const nextStudentId = body.studentId ?? existingContract.studentId;
        const nextCourseId = body.courseId ?? existingContract.courseId;
        const nextPackageId =
          body.packageId === undefined ? existingContract.packageId : body.packageId;
        const nextClassId = body.classId === undefined ? existingContract.classId : body.classId;
        const nextLessonCount = body.lessonCount ?? existingContract.lessonCount;
        const nextRemainingLessonCount =
          existingContract.remainingLessonCount + (nextLessonCount - existingContract.lessonCount);
        if (nextRemainingLessonCount < 0) {
          throw httpError(422, '课时数不能低于该课时包已核销的课时数量');
        }

        const defaults = await resolveContractDefaults({
          courseId: nextCourseId,
          paymentReceiverType:
            body.paymentReceiverType ??
            (nextCourseId === existingContract.courseId
              ? existingContract.paymentReceiverType
              : undefined),
          paymentReceiverInstitutionId:
            body.paymentReceiverInstitutionId ??
            (nextCourseId === existingContract.courseId
              ? existingContract.paymentReceiverInstitutionId
              : undefined),
          paymentReceiverName:
            body.paymentReceiverName ??
            (nextCourseId === existingContract.courseId
              ? existingContract.paymentReceiverName
              : undefined),
        });

        const result = await app.db.transaction(async (tx) => {
          const [student, coursePackage] = await Promise.all([
            tx
              .select()
              .from(schema.students)
              .where(eq(schema.students.id, nextStudentId))
              .limit(1)
              .then((rows) => rows[0] ?? null),
            nextPackageId
              ? tx
                  .select()
                  .from(schema.coursePackages)
                  .where(eq(schema.coursePackages.id, nextPackageId))
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
          ]);
          if (!student) throw httpError(404, 'Student not found');
          if (nextPackageId && !coursePackage) throw httpError(404, 'Course package not found');
          if (
            coursePackage?.status !== 'active' &&
            coursePackage?.id !== existingContract.packageId
          ) {
            throw httpError(422, '该课时包已下架');
          }
          if (coursePackage?.courseId && coursePackage.courseId !== nextCourseId) {
            throw httpError(422, '课时包与课程不匹配');
          }
          if (
            coursePackage?.courseSeriesId &&
            defaults.course.courseSeriesId !== coursePackage.courseSeriesId
          ) {
            throw httpError(422, '课时包与课程系列不匹配');
          }

          const isPeriod = packagesRepo.isPeriodPackage(coursePackage);
          let startsAt =
            body.startsAt === undefined ? existingContract.startsAt : normalizeDate(body.startsAt);
          let endsAt =
            body.endsAt === undefined ? existingContract.endsAt : normalizeDate(body.endsAt);
          if (isPeriod) {
            startsAt ??= new Date();
            endsAt ??= packagesRepo.calculatePeriodEnd(startsAt, coursePackage!);
            if (!endsAt || endsAt <= startsAt) {
              throw httpError(422, '周期卡结束时间必须晚于开始时间');
            }
            if (nextLessonCount !== packagesRepo.effectivePackageLessonCount(coursePackage!)) {
              throw httpError(422, '周期卡课时上限必须与所选课时包一致');
            }
            const periodContracts = await tx
              .select({ contract: schema.courseContracts, coursePackage: schema.coursePackages })
              .from(schema.courseContracts)
              .leftJoin(
                schema.coursePackages,
                eq(schema.courseContracts.packageId, schema.coursePackages.id),
              )
              .where(
                and(
                  eq(schema.courseContracts.studentId, nextStudentId),
                  eq(schema.courseContracts.courseId, nextCourseId),
                  eq(schema.courseContracts.status, 'active'),
                  ne(schema.courseContracts.id, existingContract.id),
                ),
              );
            const startsAtMs = startsAt.getTime();
            const endsAtMs = endsAt.getTime();
            if (
              periodContracts.some(
                (row) =>
                  packagesRepo.isPeriodPackage(row.coursePackage) &&
                  (row.contract.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY) <= endsAtMs &&
                  startsAtMs <= (row.contract.endsAt?.getTime() ?? Number.POSITIVE_INFINITY),
              )
            ) {
              throw httpError(422, '同一学员、同一课程的周期卡有效期不能重叠');
            }
          }

          const identityChanged =
            nextStudentId !== existingContract.studentId ||
            nextCourseId !== existingContract.courseId;
          const classChanged = nextClassId !== existingContract.classId || identityChanged;
          const classGroup = classChanged
            ? await courseContractsRepo.changeCourseContractClassInTx(tx, {
                contractId: existingContract.id,
                studentId: nextStudentId,
                courseId: nextCourseId,
                previousStudentId: existingContract.studentId,
                previousCourseId: existingContract.courseId,
                previousClassId: existingContract.classId,
                classId: nextClassId,
              })
            : nextClassId
              ? await tx
                  .select()
                  .from(schema.classes)
                  .where(eq(schema.classes.id, nextClassId))
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : null;

          const nextPaidAmount = body.paidAmount ?? existingContract.paidAmount;
          const nextPaymentMethod = body.paymentMethod ?? existingContract.paymentMethod;
          const nextNote = body.note === undefined ? existingContract.note : body.note || null;
          const nextTitle =
            body.title === undefined
              ? existingContract.title
              : body.title?.trim() || coursePackage?.name || `${defaults.course.name}正式课程`;
          const [courseContract] = await tx
            .update(schema.courseContracts)
            .set({
              studentId: nextStudentId,
              courseId: nextCourseId,
              classId: nextClassId,
              packageId: nextPackageId,
              title: nextTitle,
              lessonCount: nextLessonCount,
              remainingLessonCount: nextRemainingLessonCount,
              paidAmount: nextPaidAmount,
              paymentMethod: nextPaymentMethod,
              paymentReceiverType: defaults.paymentReceiverType,
              paymentReceiverInstitutionId: defaults.paymentReceiverInstitutionId,
              paymentReceiverName: defaults.paymentReceiverName,
              startsAt,
              endsAt,
              note: nextNote,
              updatedAt: new Date(),
            })
            .where(eq(schema.courseContracts.id, courseContractId))
            .returning();

          if (!courseContract) {
            throw httpError(404, 'Course contract not found');
          }

          const accountDelta = identityChanged
            ? -existingContract.remainingLessonCount
            : nextRemainingLessonCount - existingContract.remainingLessonCount;
          if (accountDelta !== 0) {
            const [oldAccount] = await tx
              .select()
              .from(schema.lessonAccounts)
              .where(
                and(
                  eq(schema.lessonAccounts.studentId, existingContract.studentId),
                  eq(schema.lessonAccounts.courseId, existingContract.courseId),
                ),
              )
              .limit(1)
              .for('update');
            if ((oldAccount?.balance ?? 0) + accountDelta < 0) {
              throw httpError(422, '课时数不能低于已使用或已调整的课时数量');
            }
            await lessonRepo.applyLessonDelta(tx, {
              studentId: existingContract.studentId,
              courseId: existingContract.courseId,
              type: 'adjustment',
              amount: accountDelta,
              relatedEntityType: identityChanged
                ? 'course_contract_reassignment'
                : 'course_contract',
              relatedEntityId: courseContract.id,
              courseContractId: courseContract.id,
            });
          }
          if (identityChanged && nextRemainingLessonCount !== 0) {
            await lessonRepo.applyLessonDelta(tx, {
              studentId: nextStudentId,
              courseId: nextCourseId,
              type: 'adjustment',
              amount: nextRemainingLessonCount,
              relatedEntityType: 'course_contract_reassignment',
              relatedEntityId: courseContract.id,
              courseContractId: courseContract.id,
            });
          }

          if (courseContract.orderId) {
            await tx
              .update(schema.orders)
              .set({
                studentId: nextStudentId,
                courseId: nextCourseId,
                courseSeriesId: coursePackage?.courseSeriesId ?? defaults.course.courseSeriesId,
                packageId: nextPackageId,
                amount: coursePackage
                  ? packagesRepo.effectivePackagePrice(coursePackage)
                  : nextPaidAmount,
                paidAmount: nextPaidAmount,
                lessonCount: nextLessonCount,
                paymentReceiverType: defaults.paymentReceiverType,
                paymentReceiverInstitutionId: defaults.paymentReceiverInstitutionId,
                paymentReceiverName: defaults.paymentReceiverName,
                paymentMethod: nextPaymentMethod,
                offlinePaymentNote: nextNote,
                updatedAt: new Date(),
              })
              .where(eq(schema.orders.id, courseContract.orderId));
            await tx
              .update(schema.courseContractPaymentRecords)
              .set({
                paidAmount: nextPaidAmount,
                paymentMethod: nextPaymentMethod,
                note: nextNote,
              })
              .where(eq(schema.courseContractPaymentRecords.courseContractId, courseContract.id));
          }

          return {
            ...courseContract,
            student,
            course: defaults.course,
            class: classGroup,
            package: coursePackage,
          };
        });

        return { courseContract: result };
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
