import { randomBytes } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { httpError } from '../../lib/http-error.js';
import { applyLessonDelta } from './lesson.js';
import { effectivePackagePrice } from './packages.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;
type PaymentReceiverType = (typeof schema.paymentReceiverTypeEnum.enumValues)[number];
type CourseContractStatus = (typeof schema.courseContractStatusEnum.enumValues)[number];

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
      and(eq(schema.students.guardianId, input.guardianId), eq(schema.students.name, input.name)),
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
  input: { classId: string; studentId: string; capacity: number },
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
      .set({ active: true })
      .where(eq(schema.classEnrollments.id, existing.id))
      .returning();
    return enrollment;
  }

  const [enrollment] = await tx
    .insert(schema.classEnrollments)
    .values({
      classId: input.classId,
      studentId: input.studentId,
      active: true,
    })
    .returning();
  return enrollment;
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

  let classGroup: typeof schema.classes.$inferSelect | null = null;
  let enrollment: typeof schema.classEnrollments.$inferSelect | null = null;
  if (input.classId) {
    classGroup = await findClassForUpdate(tx, input.classId);
    if (!classGroup) {
      throw httpError(404, 'Class not found');
    }
    if (classGroup.courseId !== input.courseId) {
      throw httpError(422, '班级与课程不匹配');
    }
    enrollment = await upsertClassEnrollment(tx, {
      classId: classGroup.id,
      studentId: input.studentId,
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

  const [contract] = await tx
    .insert(schema.courseContracts)
    .values({
      studentId: input.studentId,
      courseId: input.courseId,
      classId: input.classId ?? null,
      packageId: coursePackage?.id ?? null,
      orderId: order.id,
      contractNo: generateContractNo(),
      title: input.title?.trim() || coursePackage?.name || `${course.name}正式课程`,
      lessonCount: input.lessonCount,
      paidAmount: input.paidAmount,
      paymentMethod: input.paymentMethod ?? null,
      paymentReceiverType: input.paymentReceiverType,
      paymentReceiverInstitutionId: input.paymentReceiverInstitutionId ?? null,
      paymentReceiverName: input.paymentReceiverName ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      status: 'active',
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

  if (input.lessonCount > 0) {
    await applyLessonDelta(tx, {
      studentId: input.studentId,
      courseId: input.courseId,
      type: 'purchase',
      amount: input.lessonCount,
      relatedEntityType: 'course_contract',
      relatedEntityId: contract.id,
    });
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
    },
    order,
    paymentRecord,
    enrollment,
  };
}

export async function listCourseContracts(db: Database) {
  const [contracts, paymentRecords, students, courses, classes, packages, orders] =
    await Promise.all([
      db.select().from(schema.courseContracts).orderBy(desc(schema.courseContracts.createdAt)),
      db
        .select()
        .from(schema.courseContractPaymentRecords)
        .orderBy(desc(schema.courseContractPaymentRecords.createdAt)),
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

  for (const record of paymentRecords) {
    paymentRecordsByContractId.set(record.courseContractId, [
      ...(paymentRecordsByContractId.get(record.courseContractId) ?? []),
      record,
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
  }));
}

export async function createCourseContract(db: Database, input: CourseContractInput) {
  return db.transaction(async (tx) => createCourseContractInTx(tx, input));
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
) {
  const [courseContract] = await db
    .update(schema.courseContracts)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.courseContracts.id, courseContractId))
    .returning();

  if (!courseContract) {
    throw httpError(404, 'Course contract not found');
  }

  return courseContract;
}
