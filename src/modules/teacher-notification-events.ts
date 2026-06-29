import { and, eq, inArray } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import * as schema from '../db/schema.js';
import { NotificationsService } from './notifications/service.js';

type TeacherRecipient = {
  accountId: string;
  teacherId: string;
  teacherName: string;
  courseName: string;
};

async function listTeacherRecipientsForCourse(
  db: Database,
  courseId: string,
): Promise<TeacherRecipient[]> {
  const rows = await db
    .select({
      accountId: schema.accounts.id,
      teacherId: schema.teachers.id,
      teacherName: schema.teachers.name,
      courseName: schema.courses.name,
    })
    .from(schema.classes)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.classes.courseId))
    .innerJoin(schema.teachers, eq(schema.teachers.id, schema.classes.teacherId))
    .innerJoin(
      schema.accounts,
      and(
        eq(schema.accounts.teacherId, schema.teachers.id),
        eq(schema.accounts.role, 'teacher'),
        eq(schema.accounts.status, 'active'),
      ),
    )
    .where(
      and(
        eq(schema.classes.courseId, courseId),
        inArray(schema.classes.status, ['recruiting', 'active']),
      ),
    );

  const byAccountId = new Map<string, TeacherRecipient>();
  for (const row of rows) {
    byAccountId.set(row.accountId, row);
  }
  return Array.from(byAccountId.values());
}

export async function notifyTeachersFormalStudentEnrolled(
  db: Database,
  input: {
    orderNo: string;
    studentId: string;
    studentName: string;
    courseId: string;
    lessonAccountId?: string | null;
    courseContractId?: string | null;
  },
) {
  const recipients = await listTeacherRecipientsForCourse(db, input.courseId);
  const service = new NotificationsService(db);
  await Promise.all(
    recipients.map((recipient) =>
      service.create({
        recipientType: 'staff',
        recipientId: recipient.accountId,
        category: 'teacher.student.enrolled',
        level: 'info',
        title: '新增正式学员待分班',
        body: `${input.studentName} 已完成 ${recipient.courseName} 正式建档，请安排班级。`,
        ctaLabel: '查看学员',
        sourceEventName: 'teacher.student.enrolled',
        dedupeKey: `teacher.student.enrolled:${recipient.accountId}:${input.orderNo}:${input.studentId}:${input.courseId}`,
        meta: {
          teacherId: recipient.teacherId,
          studentId: input.studentId,
          studentName: input.studentName,
          courseId: input.courseId,
          courseName: recipient.courseName,
          lessonAccountId: input.lessonAccountId ?? null,
          courseContractId: input.courseContractId ?? null,
          orderNo: input.orderNo,
          action: 'class_enrollment',
        },
      }),
    ),
  );
}

export async function notifyTeachersTrialSeatReserved(
  db: Database,
  input: {
    orderNo: string;
    seatReservationId: string;
    trialSessionId: string | null;
    studentName: string;
    courseId: string;
    startsAt?: Date | null;
  },
) {
  const recipients = await listTeacherRecipientsForCourse(db, input.courseId);
  const service = new NotificationsService(db);
  await Promise.all(
    recipients.map((recipient) =>
      service.create({
        recipientType: 'staff',
        recipientId: recipient.accountId,
        category: 'teacher.trial.reserved',
        level: 'info',
        title: '新增试听学员待关注',
        body: `${input.studentName} 已支付 ${recipient.courseName} 试听占位费，请关注试听安排。`,
        ctaLabel: '查看试听',
        sourceEventName: 'teacher.trial.reserved',
        dedupeKey: `teacher.trial.reserved:${recipient.accountId}:${input.seatReservationId}`,
        meta: {
          teacherId: recipient.teacherId,
          seatReservationId: input.seatReservationId,
          trialSessionId: input.trialSessionId,
          studentName: input.studentName,
          courseId: input.courseId,
          courseName: recipient.courseName,
          orderNo: input.orderNo,
          startsAt: input.startsAt?.toISOString() ?? null,
          action: 'trial_follow_up',
        },
      }),
    ),
  );
}
