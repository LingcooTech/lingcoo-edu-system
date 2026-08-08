import { randomBytes } from 'node:crypto';

import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { httpError } from '../../lib/http-error.js';
import { applyLessonMovement } from './lesson-movements.js';
import { createAuditLog } from './audit.js';
import { effectivePackagePrice } from './packages.js';
import * as packagesRepo from './packages.js';
import { ensureClassCourseAssociation } from './scheduling.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;
type PaymentReceiverType = (typeof schema.paymentReceiverTypeEnum.enumValues)[number];
type CourseContractStatus = (typeof schema.courseContractStatusEnum.enumValues)[number];

export type CourseContractGiftInput = {
  courseId: string;
  classId?: string | null;
  title?: string | null;
  lessonCount: number;
  reason?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  note?: string | null;
};

type CourseContractInput = {
  studentId: string;
  courseId: string;
  classId?: string | null;
  packageId?: string | null;
  title?: string | null;
  lessonCount: number;
  paidAmount: number;
  paymentMethod?: string | null;
  paymentReceiverType: PaymentReceiverType;
  paymentReceiverInstitutionId?: string | null;
  paymentReceiverName?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  note?: string | null;
  createdByAccountId?: string | null;
  requestId?: string | null;
  gifts?: CourseContractGiftInput[];
};

type LeadContractInput = Omit<CourseContractInput, 'studentId'> & {
  leadId: string;
  school?: string | null;
};

type SeatReservationContractInput = Omit<CourseContractInput, 'studentId'> & {
  seatReservationId: string;
  school?: string | null;
};

function generateOrderNo() {
  return `EDU${Date.now()}${randomBytes(2).toString('hex').toUpperCase()}`;
}

function generateContractNo() {
  return `CC${Date.now()}${randomBytes(2).toString('hex').toUpperCase()}`;
}

function onlineOrderPaymentMethod(order: typeof schema.orders.$inferSelect) {
  if (order.paymentProvider) {
    return order.paymentProvider;
  }
  return order.medium === 'wechat_mini_program' ? 'wechat_pay' : 'online_payment';
}

async function findStudent(db: DbOrTx, studentId: string) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .limit(1);
  return student ?? null;
}

async function findGuardian(db: DbOrTx, guardianId: string | null) {
  if (!guardianId) return null;
  const [guardian] = await db
    .select()
    .from(schema.guardians)
    .where(eq(schema.guardians.id, guardianId))
    .limit(1);
  return guardian ?? null;
}

async function findGuardianByPhone(db: DbOrTx, phone: string) {
  const [guardian] = await db
    .select()
    .from(schema.guardians)
    .where(eq(schema.guardians.phone, phone))
    .limit(1);
  return guardian ?? null;
}

async function findStudentForGuardian(db: DbOrTx, input: { guardianId: string; name: string }) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.guardianId, input.guardianId),
        eq(schema.students.name, input.name),
        ne(schema.students.status, 'archived'),
      ),
    )
    .limit(1);
  return student ?? null;
}

async function findCourse(db: DbOrTx, courseId: string) {
  const [course] = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .limit(1);
  return course ?? null;
}

async function findPackage(db: DbOrTx, packageId: string) {
  const [coursePackage] = await db
    .select()
    .from(schema.coursePackages)
    .where(eq(schema.coursePackages.id, packageId))
    .limit(1);
  return coursePackage ?? null;
}

function rangesOverlap(
  left: { startsAt?: Date | null; endsAt?: Date | null },
  right: { startsAt?: Date | null; endsAt?: Date | null },
) {
  const leftStart = left.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const leftEnd = left.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightStart = right.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightEnd = right.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

async function expirePeriodContractInTx(
  tx: Tx,
  contract: typeof schema.courseContracts.$inferSelect,
  now: Date,
) {
  const amount = contract.remainingLessonCount;
  if (amount > 0) {
    await applyLessonMovement(tx, {
      courseContractId: contract.id,
      studentId: contract.studentId,
      operationId: `contract:${contract.id}:expire`,
      type: 'expire',
      units: -amount,
      occurredAt: contract.endsAt ?? now,
      reason: '周期课时包到期失效',
      metadata: { expiredAt: now.toISOString() },
    });
  } else if (contract.status === 'active') {
    await tx
      .update(schema.courseContracts)
      .set({ status: 'completed', updatedAt: now })
      .where(eq(schema.courseContracts.id, contract.id));
    await createAuditLog(tx, {
      institutionId: contract.institutionId,
      action: 'course_contract.completed',
      resourceType: 'course_contract',
      resourceId: contract.id,
      summary: `课时包到期完成：${contract.title}`,
      meta: { previousStatus: contract.status, remainingLessonCount: 0, completedAt: now },
    });
  }
}

async function prepareContractPeriod(
  tx: Tx,
  input: CourseContractInput,
  coursePackage: typeof schema.coursePackages.$inferSelect | null,
) {
  const isPeriod = packagesRepo.isPeriodPackage(coursePackage);
  const startsAt = isPeriod ? (input.startsAt ?? new Date()) : (input.startsAt ?? null);
  const endsAt = isPeriod
    ? (input.endsAt ?? packagesRepo.calculatePeriodEnd(startsAt!, coursePackage!))
    : (input.endsAt ?? null);

  if (isPeriod && (!endsAt || endsAt <= startsAt!)) {
    throw httpError(422, '周期卡结束时间必须晚于开始时间');
  }
  if (
    isPeriod &&
    coursePackage &&
    input.lessonCount !== packagesRepo.effectivePackageLessonCount(coursePackage)
  ) {
    throw httpError(422, '周期卡课时上限必须与所选课时包一致');
  }

  const existingContracts = await tx
    .select({
      contract: schema.courseContracts,
      coursePackage: schema.coursePackages,
    })
    .from(schema.courseContracts)
    .leftJoin(schema.coursePackages, eq(schema.courseContracts.packageId, schema.coursePackages.id))
    .where(
      and(
        eq(schema.courseContracts.studentId, input.studentId),
        eq(schema.courseContracts.courseId, input.courseId),
        ne(schema.courseContracts.status, 'cancelled'),
      ),
    );

  const expiredPeriodContracts = existingContracts.filter(
    (row) =>
      packagesRepo.isPeriodPackage(row.coursePackage) &&
      row.contract.endsAt &&
      row.contract.endsAt < new Date(),
  );
  const expiredActiveIds = expiredPeriodContracts
    .filter((row) => row.contract.status === 'active')
    .map((row) => row.contract.id);
  if (expiredActiveIds.length > 0) {
    for (const row of expiredPeriodContracts) {
      if (row.contract.status === 'active') {
        await expirePeriodContractInTx(tx, row.contract, new Date());
      }
    }
  }

  const currentContracts = existingContracts.filter(
    (row) => !expiredPeriodContracts.some((expired) => expired.contract.id === row.contract.id),
  );
  const conflict = currentContracts.find(
    (row) =>
      isPeriod &&
      packagesRepo.isPeriodPackage(row.coursePackage) &&
      row.contract.status === 'active' &&
      rangesOverlap(
        { startsAt, endsAt },
        { startsAt: row.contract.startsAt, endsAt: row.contract.endsAt },
      ),
  );
  if (conflict) {
    throw httpError(422, '同一学员、同一课程的周期卡有效期不能重叠');
  }

  return { startsAt, endsAt };
}

async function findClassForUpdate(tx: Tx, classId: string) {
  const [classGroup] = await tx
    .select()
    .from(schema.classes)
    .where(eq(schema.classes.id, classId))
    .limit(1)
    .for('update');
  return classGroup ?? null;
}

async function findLeadForUpdate(tx: Tx, leadId: string) {
  const [lead] = await tx
    .select()
    .from(schema.leads)
    .where(eq(schema.leads.id, leadId))
    .limit(1)
    .for('update');
  if (!lead) {
    throw httpError(404, 'Lead not found');
  }
  return lead;
}

async function findSeatReservationForUpdate(tx: Tx, seatReservationId: string) {
  const [seatReservation] = await tx
    .select()
    .from(schema.seatReservations)
    .where(eq(schema.seatReservations.id, seatReservationId))
    .limit(1)
    .for('update');
  if (!seatReservation) {
    throw httpError(404, 'Seat reservation not found');
  }
  return seatReservation;
}

async function findOrCreateStudentFromContact(
  tx: Tx,
  input: {
    convertedStudentId?: string | null;
    guardianName: string;
    phone: string;
    studentName: string;
    grade: string;
    school?: string | null;
  },
) {
  if (input.convertedStudentId) {
    const student = await findStudent(tx, input.convertedStudentId);
    if (student) {
      const guardian = (await findGuardian(tx, student.guardianId)) ?? {
        id: student.guardianId,
        name: input.guardianName,
        phone: input.phone,
      };
      return { guardian, student };
    }
  }

  let guardian = await findGuardianByPhone(tx, input.phone);
  if (!guardian) {
    [guardian] = await tx
      .insert(schema.guardians)
      .values({
        name: input.guardianName,
        phone: input.phone,
      })
      .returning();
  }

  let student = await findStudentForGuardian(tx, {
    guardianId: guardian.id,
    name: input.studentName,
  });
  if (!student) {
    [student] = await tx
      .insert(schema.students)
      .values({
        guardianId: guardian.id,
        name: input.studentName,
        grade: input.grade,
        school: input.school ?? null,
        status: 'active',
      })
      .returning();
  }

  return { guardian, student };
}

async function upsertClassEnrollment(
  tx: Tx,
  input: {
    classId: string;
    studentId: string;
    billingCourseId: string;
    billingCourseContractId?: string | null;
    capacity: number;
  },
) {
  const [existing] = await tx
    .select()
    .from(schema.classEnrollments)
    .where(
      and(
        eq(schema.classEnrollments.classId, input.classId),
        eq(schema.classEnrollments.studentId, input.studentId),
      ),
    )
    .limit(1)
    .for('update');

  if (existing?.active) {
    if (
      existing.billingCourseId !== input.billingCourseId ||
      (input.billingCourseContractId !== undefined &&
        existing.billingCourseContractId !== input.billingCourseContractId)
    ) {
      const [enrollment] = await tx
        .update(schema.classEnrollments)
        .set({
          billingCourseId: input.billingCourseId,
          billingCourseContractId:
            input.billingCourseContractId === undefined
              ? existing.billingCourseContractId
              : input.billingCourseContractId,
        })
        .where(eq(schema.classEnrollments.id, existing.id))
        .returning();
      await syncEnrollmentToScheduledSessions(tx, enrollment);
      return enrollment;
    }
    return existing;
  }

  const activeEnrollments = await tx
    .select({ id: schema.classEnrollments.id })
    .from(schema.classEnrollments)
    .where(
      and(
        eq(schema.classEnrollments.classId, input.classId),
        eq(schema.classEnrollments.active, true),
      ),
    );

  if (activeEnrollments.length >= input.capacity) {
    throw httpError(409, 'Class capacity reached');
  }

  if (existing) {
    const [enrollment] = await tx
      .update(schema.classEnrollments)
      .set({
        active: true,
        billingCourseId: input.billingCourseId,
        billingCourseContractId:
          input.billingCourseContractId === undefined
            ? existing.billingCourseContractId
            : input.billingCourseContractId,
        joinedAt: new Date(),
        leftAt: null,
      })
      .where(eq(schema.classEnrollments.id, existing.id))
      .returning();
    await syncEnrollmentToScheduledSessions(tx, enrollment);
    return enrollment;
  }

  const [enrollment] = await tx
    .insert(schema.classEnrollments)
    .values({
      classId: input.classId,
      studentId: input.studentId,
      billingCourseId: input.billingCourseId,
      billingCourseContractId: input.billingCourseContractId ?? null,
      active: true,
    })
    .returning();
  await syncEnrollmentToScheduledSessions(tx, enrollment);
  return enrollment;
}

async function syncEnrollmentToScheduledSessions(
  tx: Tx,
  enrollment: typeof schema.classEnrollments.$inferSelect,
) {
  const sessions = await tx
    .select()
    .from(schema.classSessions)
    .where(eq(schema.classSessions.classId, enrollment.classId));
  const eligibleSessions = sessions.filter(
    (session) => session.status === 'scheduled' && session.startsAt >= enrollment.joinedAt,
  );
  for (const session of eligibleSessions) {
    await tx
      .insert(schema.classSessionStudents)
      .values({
        classSessionId: session.id,
        studentId: enrollment.studentId,
        billingCourseId: enrollment.billingCourseId,
        billingCourseContractId: enrollment.billingCourseContractId,
        source: 'enrollment',
        active: true,
      })
      .onConflictDoUpdate({
        target: [schema.classSessionStudents.classSessionId, schema.classSessionStudents.studentId],
        set: {
          billingCourseId: enrollment.billingCourseId,
          billingCourseContractId: enrollment.billingCourseContractId,
          source: 'enrollment',
          active: true,
          updatedAt: new Date(),
        },
      });
  }
}

async function createCourseContractInTx(tx: Tx, input: CourseContractInput) {
  const [student, course] = await Promise.all([
    findStudent(tx, input.studentId),
    findCourse(tx, input.courseId),
  ]);
  if (!student) {
    throw httpError(404, 'Student not found');
  }
  if (!course) {
    throw httpError(404, 'Course not found');
  }

  const coursePackage = input.packageId ? await findPackage(tx, input.packageId) : null;
  if (input.packageId && !coursePackage) {
    throw httpError(404, 'Course package not found');
  }
  if (coursePackage && coursePackage.status !== 'active') {
    throw httpError(422, '该课时包已下架');
  }
  if (coursePackage?.courseId && coursePackage.courseId !== input.courseId) {
    throw httpError(422, '课时包与课程不匹配');
  }
  if (coursePackage?.courseSeriesId && course.courseSeriesId !== coursePackage.courseSeriesId) {
    throw httpError(422, '课时包与课程系列不匹配');
  }
  const contractPeriod = await prepareContractPeriod(tx, input, coursePackage);

  let classGroup: typeof schema.classes.$inferSelect | null = null;
  let enrollment: typeof schema.classEnrollments.$inferSelect | null = null;
  if (input.classId) {
    classGroup = await findClassForUpdate(tx, input.classId);
    if (!classGroup) {
      throw httpError(404, 'Class not found');
    }
    await ensureClassCourseAssociation(tx, {
      classId: classGroup.id,
      courseId: input.courseId,
      source: 'contract',
    });
    enrollment = await upsertClassEnrollment(tx, {
      classId: classGroup.id,
      studentId: input.studentId,
      billingCourseId: input.courseId,
      capacity: classGroup.capacity,
    });
  }

  const orderNo = generateOrderNo();
  const [order] = await tx
    .insert(schema.orders)
    .values({
      studentId: input.studentId,
      courseId: input.courseId,
      courseSeriesId: coursePackage?.courseSeriesId ?? course.courseSeriesId ?? null,
      packageId: coursePackage?.id ?? null,
      orderNo,
      orderType: 'manual_package_grant',
      amount: coursePackage ? effectivePackagePrice(coursePackage) : input.paidAmount,
      paidAmount: input.paidAmount,
      lessonCount: input.lessonCount,
      paymentReceiverType: input.paymentReceiverType,
      paymentReceiverInstitutionId: input.paymentReceiverInstitutionId ?? null,
      paymentReceiverName: input.paymentReceiverName ?? null,
      paymentMethod: input.paymentMethod ?? null,
      offlinePaymentNote: input.note ?? null,
      status: 'paid',
      paidAt: new Date(),
      source: 'course_contract',
    })
    .returning();

  let [contract] = await tx
    .insert(schema.courseContracts)
    .values({
      studentId: input.studentId,
      institutionId:
        course.providerInstitutionId ?? input.paymentReceiverInstitutionId ?? null,
      courseId: input.courseId,
      classId: input.classId ?? null,
      packageId: coursePackage?.id ?? null,
      orderId: order.id,
      contractNo: generateContractNo(),
      title: input.title?.trim() || coursePackage?.name || `${course.name}正式课程`,
      lessonCount: input.lessonCount,
      remainingLessonCount: 0,
      paidAmount: input.paidAmount,
      paymentMethod: input.paymentMethod ?? null,
      paymentReceiverType: input.paymentReceiverType,
      paymentReceiverInstitutionId: input.paymentReceiverInstitutionId ?? null,
      paymentReceiverName: input.paymentReceiverName ?? null,
      startsAt: contractPeriod.startsAt,
      endsAt: contractPeriod.endsAt,
      status: 'active',
      origin: 'manual',
      note: input.note ?? null,
      createdByAccountId: input.createdByAccountId ?? null,
    })
    .returning();

  const [paymentRecord] = await tx
    .insert(schema.courseContractPaymentRecords)
    .values({
      courseContractId: contract.id,
      orderId: order.id,
      paidAmount: input.paidAmount,
      paymentMethod: input.paymentMethod ?? null,
      note: input.note ?? null,
      createdByAccountId: input.createdByAccountId ?? null,
    })
    .returning();

  if (enrollment) {
    [enrollment] = await tx
      .update(schema.classEnrollments)
      .set({ billingCourseContractId: contract.id })
      .where(eq(schema.classEnrollments.id, enrollment.id))
      .returning();
    await syncEnrollmentToScheduledSessions(tx, enrollment);
  }

  if (input.lessonCount > 0) {
    const grant = await applyLessonMovement(tx, {
      courseContractId: contract.id,
      studentId: input.studentId,
      operationId: `contract:${contract.id}:grant`,
      type: 'grant',
      units: input.lessonCount,
      occurredAt: contract.createdAt,
      actorAccountId: input.createdByAccountId,
      requestId: input.requestId,
      reason: '创建课时包档案发放课时',
      metadata: { source: 'course_contract' },
    });
    contract = grant.contract;
  }

  await createAuditLog(tx, {
    actorAccountId: input.createdByAccountId ?? null,
    institutionId: contract.institutionId,
    requestId: input.requestId ?? null,
    action: 'course_contract.created',
    resourceType: 'course_contract',
    resourceId: contract.id,
    summary: `创建课时包：${contract.title}`,
    meta: {
      studentId: contract.studentId,
      origin: contract.origin,
      lessonCount: contract.lessonCount,
      remainingLessonCount: contract.remainingLessonCount,
      startsAt: contract.startsAt,
      endsAt: contract.endsAt,
    },
  });

  const gifts = [];
  for (const giftInput of input.gifts ?? []) {
    gifts.push(
      await createCourseContractGiftInTx(tx, {
        contract,
        gift: giftInput,
        createdByAccountId: input.createdByAccountId,
        requestId: input.requestId,
      }),
    );
  }

  return {
    courseContract: {
      ...contract,
      student,
      course,
      class: classGroup ?? undefined,
      package: coursePackage ?? undefined,
      order,
      paymentRecords: [paymentRecord],
      gifts,
    },
    order,
    paymentRecord,
    enrollment,
    gifts,
  };
}

async function createCourseContractGiftInTx(
  tx: Tx,
  input: {
    contract: typeof schema.courseContracts.$inferSelect;
    gift: CourseContractGiftInput;
    createdByAccountId?: string | null;
    requestId?: string | null;
  },
) {
  const giftCourse = await findCourse(tx, input.gift.courseId);
  if (!giftCourse) {
    throw httpError(404, 'Gift course not found');
  }

  let giftClass: typeof schema.classes.$inferSelect | null = null;
  let giftEnrollment: typeof schema.classEnrollments.$inferSelect | null = null;
  if (input.gift.classId) {
    giftClass = await findClassForUpdate(tx, input.gift.classId);
    if (!giftClass) {
      throw httpError(404, 'Gift class not found');
    }
    await ensureClassCourseAssociation(tx, {
      classId: giftClass.id,
      courseId: input.gift.courseId,
      source: 'contract',
    });
    giftEnrollment = await upsertClassEnrollment(tx, {
      classId: giftClass.id,
      studentId: input.contract.studentId,
      billingCourseId: input.gift.courseId,
      capacity: giftClass.capacity,
    });
  }

  const [gift] = await tx
    .insert(schema.courseContractGifts)
    .values({
      courseContractId: input.contract.id,
      studentId: input.contract.studentId,
      courseId: input.gift.courseId,
      classId: input.gift.classId ?? null,
      title: input.gift.title?.trim() || `${giftCourse.name}赠课`,
      lessonCount: input.gift.lessonCount,
      reason: input.gift.reason ?? 'other',
      startsAt: input.gift.startsAt ?? null,
      endsAt: input.gift.endsAt ?? null,
      status: 'active',
      note: input.gift.note ?? null,
      createdByAccountId: input.createdByAccountId ?? null,
    })
    .returning();

  let [giftContract] = await tx
    .insert(schema.courseContracts)
    .values({
      studentId: input.contract.studentId,
      institutionId: input.contract.institutionId,
      courseId: input.gift.courseId,
      classId: input.gift.classId ?? null,
      packageId: null,
      orderId: null,
      parentCourseContractId: input.contract.id,
      contractNo: generateContractNo(),
      title: input.gift.title?.trim() || `${giftCourse.name}赠课包`,
      lessonCount: input.gift.lessonCount,
      remainingLessonCount: 0,
      paidAmount: 0,
      paymentMethod: null,
      paymentReceiverType: input.contract.paymentReceiverType,
      paymentReceiverInstitutionId: input.contract.paymentReceiverInstitutionId,
      paymentReceiverName: input.contract.paymentReceiverName,
      startsAt: input.gift.startsAt ?? input.contract.startsAt,
      endsAt: input.gift.endsAt ?? input.contract.endsAt,
      status: 'active',
      origin: 'gift',
      note: input.gift.note ?? null,
      createdByAccountId: input.createdByAccountId ?? null,
    })
    .returning();

  const giftGrant = await applyLessonMovement(tx, {
    courseContractId: giftContract.id,
    studentId: input.contract.studentId,
    operationId: `gift:${gift.id}:grant`,
    type: 'grant',
    units: input.gift.lessonCount,
    occurredAt: giftContract.createdAt,
    actorAccountId: input.createdByAccountId,
    requestId: input.requestId,
    reason: '赠课包发放课时',
    metadata: { giftId: gift.id, parentCourseContractId: input.contract.id },
  });
  giftContract = giftGrant.contract;
  await createAuditLog(tx, {
    actorAccountId: input.createdByAccountId ?? null,
    institutionId: giftContract.institutionId,
    requestId: input.requestId ?? null,
    action: 'course_contract.created',
    resourceType: 'course_contract',
    resourceId: giftContract.id,
    summary: `创建赠课包：${giftContract.title}`,
    meta: {
      studentId: giftContract.studentId,
      origin: giftContract.origin,
      parentCourseContractId: input.contract.id,
      giftId: gift.id,
      lessonCount: giftContract.lessonCount,
      remainingLessonCount: giftContract.remainingLessonCount,
    },
  });
  const [updatedGift] = await tx
    .update(schema.courseContractGifts)
    .set({ grantedCourseContractId: giftContract.id, updatedAt: new Date() })
    .where(eq(schema.courseContractGifts.id, gift.id))
    .returning();
  if (giftEnrollment) {
    [giftEnrollment] = await tx
      .update(schema.classEnrollments)
      .set({ billingCourseContractId: giftContract.id })
      .where(eq(schema.classEnrollments.id, giftEnrollment.id))
      .returning();
    await syncEnrollmentToScheduledSessions(tx, giftEnrollment);
  }

  return {
    ...updatedGift,
    grantedCourseContract: giftContract,
    course: giftCourse,
    class: giftClass ?? undefined,
    enrollment: giftEnrollment ?? undefined,
  };
}

export async function listCourseContracts(
  db: Database,
  input: { institutionId?: string | null } = {},
) {
  const [contracts, paymentRecords, gifts, students, courses, classes, packages, orders] =
    await Promise.all([
      db
        .select()
        .from(schema.courseContracts)
        .where(
          input.institutionId
            ? eq(schema.courseContracts.institutionId, input.institutionId)
            : undefined,
        )
        .orderBy(desc(schema.courseContracts.createdAt)),
      db
        .select()
        .from(schema.courseContractPaymentRecords)
        .orderBy(desc(schema.courseContractPaymentRecords.createdAt)),
      db
        .select()
        .from(schema.courseContractGifts)
        .orderBy(desc(schema.courseContractGifts.createdAt)),
      db.select().from(schema.students),
      db.select().from(schema.courses),
      db.select().from(schema.classes),
      db.select().from(schema.coursePackages),
      db.select().from(schema.orders),
    ]);

  const studentById = new Map(students.map((student) => [student.id, student]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
  const packageById = new Map(packages.map((coursePackage) => [coursePackage.id, coursePackage]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const paymentRecordsByContractId = new Map<
    string,
    (typeof schema.courseContractPaymentRecords.$inferSelect)[]
  >();
  const giftsByContractId = new Map<
    string,
    Array<
      typeof schema.courseContractGifts.$inferSelect & {
        course?: typeof schema.courses.$inferSelect;
        class?: typeof schema.classes.$inferSelect;
      }
    >
  >();

  for (const record of paymentRecords) {
    paymentRecordsByContractId.set(record.courseContractId, [
      ...(paymentRecordsByContractId.get(record.courseContractId) ?? []),
      record,
    ]);
  }
  for (const gift of gifts) {
    giftsByContractId.set(gift.courseContractId, [
      ...(giftsByContractId.get(gift.courseContractId) ?? []),
      {
        ...gift,
        course: courseById.get(gift.courseId),
        class: gift.classId ? classById.get(gift.classId) : undefined,
      },
    ]);
  }

  return contracts.map((contract) => ({
    ...contract,
    student: studentById.get(contract.studentId),
    course: courseById.get(contract.courseId),
    class: contract.classId ? classById.get(contract.classId) : undefined,
    package: contract.packageId ? packageById.get(contract.packageId) : undefined,
    order: contract.orderId ? orderById.get(contract.orderId) : undefined,
    paymentRecords: paymentRecordsByContractId.get(contract.id) ?? [],
    gifts: giftsByContractId.get(contract.id) ?? [],
  }));
}

export async function expirePeriodPackageContracts(
  db: Database,
  now = new Date(),
  institutionId?: string | null,
) {
  return db.transaction(async (tx) => {
    const expired = (
      await tx
        .select({
          contract: schema.courseContracts,
          billingType: schema.coursePackages.billingType,
        })
        .from(schema.courseContracts)
        .innerJoin(
          schema.coursePackages,
          eq(schema.courseContracts.packageId, schema.coursePackages.id),
        )
        .where(
          and(
            eq(schema.courseContracts.status, 'active'),
            institutionId ? eq(schema.courseContracts.institutionId, institutionId) : undefined,
          ),
        )
        .for('update')
    ).filter(
      (row) =>
        row.billingType === 'period' && Boolean(row.contract.endsAt && row.contract.endsAt < now),
    );

    for (const row of expired) {
      await expirePeriodContractInTx(tx, row.contract, now);
    }

    return expired.length;
  });
}

export async function createCourseContract(db: Database, input: CourseContractInput) {
  return db.transaction(async (tx) => createCourseContractInTx(tx, input));
}

export async function changeCourseContractClassInTx(
  tx: Tx,
  input: {
    contractId: string;
    studentId: string;
    courseId: string;
    previousStudentId?: string;
    previousCourseId?: string;
    previousClassId?: string | null;
    classId?: string | null;
  },
) {
  const previousStudentId = input.previousStudentId ?? input.studentId;
  const previousCourseId = input.previousCourseId ?? input.courseId;
  const identityChanged =
    previousStudentId !== input.studentId || previousCourseId !== input.courseId;
  if (input.previousClassId && (input.previousClassId !== input.classId || identityChanged)) {
    const [otherContract] = await tx
      .select({ id: schema.courseContracts.id })
      .from(schema.courseContracts)
      .where(
        and(
          eq(schema.courseContracts.studentId, previousStudentId),
          eq(schema.courseContracts.classId, input.previousClassId),
          eq(schema.courseContracts.status, 'active'),
          ne(schema.courseContracts.id, input.contractId),
        ),
      )
      .limit(1);
    if (!otherContract) {
      const now = new Date();
      await tx
        .update(schema.classEnrollments)
        .set({ active: false, leftAt: now })
        .where(
          and(
            eq(schema.classEnrollments.classId, input.previousClassId),
            eq(schema.classEnrollments.studentId, previousStudentId),
          ),
        );
      const futureSessionIds = (
        await tx
          .select({ id: schema.classSessions.id, startsAt: schema.classSessions.startsAt })
          .from(schema.classSessions)
          .where(eq(schema.classSessions.classId, input.previousClassId))
      )
        .filter((session) => session.startsAt >= now)
        .map((session) => session.id);
      if (futureSessionIds.length > 0) {
        await tx
          .update(schema.classSessionStudents)
          .set({ active: false, updatedAt: now })
          .where(
            and(
              inArray(schema.classSessionStudents.classSessionId, futureSessionIds),
              eq(schema.classSessionStudents.studentId, previousStudentId),
            ),
          );
      }
    }
  }

  let classGroup: typeof schema.classes.$inferSelect | null = null;
  if (input.classId) {
    classGroup = await findClassForUpdate(tx, input.classId);
    if (!classGroup) {
      throw httpError(404, 'Class not found');
    }
    await ensureClassCourseAssociation(tx, {
      classId: classGroup.id,
      courseId: input.courseId,
      source: 'contract',
    });
    if (['archived', 'completed'].includes(classGroup.status)) {
      throw httpError(422, '不能转入已结束或已归档的班级');
    }
    await upsertClassEnrollment(tx, {
      classId: classGroup.id,
      studentId: input.studentId,
      billingCourseId: input.courseId,
      billingCourseContractId: input.contractId,
      capacity: classGroup.capacity,
    });
  }

  return classGroup;
}

export async function createCourseContractFromPaidPackageOrderInTx(
  tx: Tx,
  input: {
    order: typeof schema.orders.$inferSelect;
    studentId: string;
    actorAccountId?: string | null;
    requestId?: string | null;
  },
) {
  const { order } = input;
  if (!['package_purchase', 'manual_package_grant'].includes(order.orderType)) {
    throw httpError(422, '该订单不是课时包订单');
  }
  if (order.status !== 'paid') {
    throw httpError(422, '订单支付完成后才能生成正式课程档案');
  }
  if (order.studentId !== input.studentId) {
    throw httpError(422, '订单关联孩子信息不匹配');
  }
  if (!order.courseId || !order.packageId || order.lessonCount <= 0) {
    throw httpError(422, '订单课程信息不完整');
  }

  const [existingContract] = await tx
    .select()
    .from(schema.courseContracts)
    .where(eq(schema.courseContracts.orderId, order.id))
    .limit(1)
    .for('update');
  if (existingContract) {
    const [paymentRecord] = await tx
      .select()
      .from(schema.courseContractPaymentRecords)
      .where(eq(schema.courseContractPaymentRecords.orderId, order.id))
      .limit(1);
    return {
      courseContract: existingContract,
      paymentRecord: paymentRecord ?? null,
      created: false,
    };
  }

  const [student, course, coursePackage] = await Promise.all([
    findStudent(tx, input.studentId),
    findCourse(tx, order.courseId),
    findPackage(tx, order.packageId),
  ]);
  if (!student) {
    throw httpError(404, 'Student not found');
  }
  if (!course) {
    throw httpError(404, 'Course not found');
  }
  if (!coursePackage) {
    throw httpError(404, 'Course package not found');
  }
  if (coursePackage.courseId && coursePackage.courseId !== order.courseId) {
    throw httpError(422, '课时包与课程不匹配');
  }
  if (coursePackage.courseSeriesId && course.courseSeriesId !== coursePackage.courseSeriesId) {
    throw httpError(422, '课时包与课程系列不匹配');
  }
  const contractInput: CourseContractInput = {
    studentId: input.studentId,
    courseId: order.courseId,
    packageId: order.packageId,
    lessonCount: order.lessonCount,
    paidAmount: order.paidAmount || order.amount,
    paymentMethod: onlineOrderPaymentMethod(order),
    paymentReceiverType: order.paymentReceiverType,
    paymentReceiverInstitutionId: order.paymentReceiverInstitutionId ?? null,
    paymentReceiverName: order.paymentReceiverName ?? null,
    startsAt: order.paidAt ?? new Date(),
    endsAt: null,
  };
  const contractPeriod = await prepareContractPeriod(tx, contractInput, coursePackage);

  const paymentMethod = onlineOrderPaymentMethod(order);
  const isManualGrant = order.orderType === 'manual_package_grant';
  const note = isManualGrant
    ? order.offlinePaymentNote || '后台手动发放课时包。'
    : '线上支付自动生成，待老师确认正式课程档案、分班与签约信息。';
  let [contract] = await tx
    .insert(schema.courseContracts)
    .values({
      studentId: input.studentId,
      institutionId:
        course.providerInstitutionId ?? order.paymentReceiverInstitutionId ?? null,
      courseId: order.courseId,
      classId: null,
      packageId: order.packageId,
      orderId: order.id,
      contractNo: generateContractNo(),
      title: coursePackage.name || `${course.name}正式课程`,
      lessonCount: order.lessonCount,
      remainingLessonCount: 0,
      paidAmount: order.paidAmount || order.amount,
      paymentMethod,
      paymentReceiverType: order.paymentReceiverType,
      paymentReceiverInstitutionId: order.paymentReceiverInstitutionId ?? null,
      paymentReceiverName: order.paymentReceiverName ?? null,
      startsAt: contractPeriod.startsAt,
      endsAt: contractPeriod.endsAt,
      status: 'active',
      origin: isManualGrant ? 'manual' : 'online_order',
      note,
      createdByAccountId: input.actorAccountId ?? null,
    })
    .returning();

  const grant = await applyLessonMovement(tx, {
    courseContractId: contract.id,
    studentId: input.studentId,
    operationId: `order:${order.id}:grant`,
    type: 'grant',
    units: order.lessonCount,
    occurredAt: order.paidAt ?? contract.createdAt,
    actorAccountId: input.actorAccountId ?? null,
    requestId: input.requestId ?? null,
    reason: '支付订单创建课时包并发放课时',
    metadata: { orderId: order.id, orderNo: order.orderNo },
  });
  contract = grant.contract;

  await createAuditLog(tx, {
    actorAccountId: input.actorAccountId ?? null,
    institutionId: contract.institutionId,
    requestId: input.requestId ?? null,
    action: 'course_contract.created',
    resourceType: 'course_contract',
    resourceId: contract.id,
    summary: `支付订单创建课时包：${contract.title}`,
    meta: {
      studentId: contract.studentId,
      origin: contract.origin,
      orderId: order.id,
      lessonCount: contract.lessonCount,
      remainingLessonCount: contract.remainingLessonCount,
    },
  });

  const [paymentRecord] = await tx
    .insert(schema.courseContractPaymentRecords)
    .values({
      courseContractId: contract.id,
      orderId: order.id,
      paidAmount: order.paidAmount || order.amount,
      paymentMethod,
      note,
      createdByAccountId: input.actorAccountId ?? null,
    })
    .returning();

  return {
    courseContract: {
      ...contract,
      student,
      course,
      package: coursePackage,
      order,
      paymentRecords: [paymentRecord],
      gifts: [],
    },
    paymentRecord,
    created: true,
  };
}

export async function addCourseContractGift(
  db: Database,
  input: {
    courseContractId: string;
    gift: CourseContractGiftInput;
    createdByAccountId?: string | null;
    requestId?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [contract] = await tx
      .select()
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.id, input.courseContractId))
      .limit(1)
      .for('update');
    if (!contract) {
      throw httpError(404, 'Course contract not found');
    }
    if (contract.status !== 'active') {
      throw httpError(422, '只能为进行中的正式课程档案补赠课');
    }

    const gift = await createCourseContractGiftInTx(tx, {
      contract,
      gift: input.gift,
      createdByAccountId: input.createdByAccountId,
      requestId: input.requestId,
    });

    return { gift };
  });
}

export async function createCourseContractFromLead(db: Database, input: LeadContractInput) {
  return db.transaction(async (tx) => {
    const lead = await findLeadForUpdate(tx, input.leadId);
    if (lead.courseId && lead.courseId !== input.courseId) {
      throw httpError(422, '线索课程与正式课程不匹配');
    }

    const { guardian, student } = await findOrCreateStudentFromContact(tx, {
      convertedStudentId: lead.convertedStudentId,
      guardianName: lead.guardianName,
      phone: lead.phone,
      studentName: lead.studentName,
      grade: lead.grade,
      school: input.school,
    });

    const result = await createCourseContractInTx(tx, {
      ...input,
      studentId: student.id,
      courseId: input.courseId,
    });

    const [updatedLead] = await tx
      .update(schema.leads)
      .set({
        convertedStudentId: student.id,
        status: 'paid',
        updatedAt: new Date(),
      })
      .where(eq(schema.leads.id, lead.id))
      .returning();

    return {
      ...result,
      guardian,
      student,
      lead: updatedLead,
    };
  });
}

export async function createCourseContractFromSeatReservation(
  db: Database,
  input: SeatReservationContractInput,
) {
  return db.transaction(async (tx) => {
    const seatReservation = await findSeatReservationForUpdate(tx, input.seatReservationId);
    if (
      seatReservation.paymentStatus !== 'paid' ||
      seatReservation.reservationStatus !== 'reserved'
    ) {
      throw httpError(422, 'Only paid reserved seats can be converted');
    }
    if (seatReservation.checkInStatus !== 'checked_in') {
      throw httpError(422, 'Only checked-in seat reservations can be converted');
    }
    if (seatReservation.courseId && seatReservation.courseId !== input.courseId) {
      throw httpError(422, '席位预约课程与正式课程不匹配');
    }

    const lead = seatReservation.leadId
      ? await findLeadForUpdate(tx, seatReservation.leadId)
      : null;
    const { guardian, student } = await findOrCreateStudentFromContact(tx, {
      convertedStudentId: lead?.convertedStudentId,
      guardianName: lead?.guardianName ?? seatReservation.guardianName,
      phone: lead?.phone ?? seatReservation.phone,
      studentName: lead?.studentName ?? seatReservation.studentName,
      grade: lead?.grade ?? seatReservation.grade,
      school: input.school,
    });

    const result = await createCourseContractInTx(tx, {
      ...input,
      studentId: student.id,
      courseId: input.courseId,
    });

    let updatedLead: typeof schema.leads.$inferSelect | null = null;
    if (lead) {
      [updatedLead] = await tx
        .update(schema.leads)
        .set({
          convertedStudentId: student.id,
          status: 'paid',
          updatedAt: new Date(),
        })
        .where(eq(schema.leads.id, lead.id))
        .returning();
    }

    return {
      ...result,
      guardian,
      student,
      lead: updatedLead,
      seatReservation,
    };
  });
}

export async function updateCourseContractStatus(
  db: Database,
  courseContractId: string,
  status: CourseContractStatus,
  input: { actorAccountId?: string | null; requestId?: string | null } = {},
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.id, courseContractId))
      .limit(1)
      .for('update');
    if (!existing) throw httpError(404, 'Course contract not found');
    if (existing.status === status) return existing;
    if (status === 'active') throw httpError(422, '已结束或已取消的课时包不能直接恢复');
    if (status === 'completed') throw httpError(422, '课时包仅能在余额归零或到期后自动完成');

    if (existing.remainingLessonCount > 0) {
      await applyLessonMovement(tx, {
        courseContractId: existing.id,
        studentId: existing.studentId,
        operationId: `contract:${existing.id}:cancel`,
        type: 'adjustment',
        units: -existing.remainingLessonCount,
        occurredAt: new Date(),
        actorAccountId: input.actorAccountId,
        requestId: input.requestId,
        reason: '取消课时包，剩余课时作废',
        metadata: { previousStatus: existing.status },
      });
    }

    const [courseContract] = await tx
      .update(schema.courseContracts)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.courseContracts.id, courseContractId))
      .returning();
    await createAuditLog(tx, {
      actorAccountId: input.actorAccountId ?? null,
      institutionId: existing.institutionId,
      requestId: input.requestId ?? null,
      action: 'course_contract.cancelled',
      resourceType: 'course_contract',
      resourceId: existing.id,
      summary: `取消课时包：${existing.title}`,
      meta: {
        before: { status: existing.status, remainingLessonCount: existing.remainingLessonCount },
        after: { status: 'cancelled', remainingLessonCount: courseContract!.remainingLessonCount },
      },
    });
    return courseContract!;
  });
}
