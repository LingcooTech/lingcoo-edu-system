import { z } from 'zod';
import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as refundsRepo from '../../db/repositories/refunds.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as seatReservationRepo from '../../db/repositories/seat-reservations.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as trialRepo from '../../db/repositories/trial.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import { QiniuSettingsService } from '../../lib/qiniu-settings.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
import type { AppModule } from '../types.js';

const seatReservationRescheduleSchema = z.object({
  trialSessionId: z.string(),
});

const parentCheckInSchema = z.object({
  studentId: z.string().uuid(),
});
const parentCalendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  studentId: z.string().uuid().optional(),
});

const homeworkCheckInSchema = z
  .object({
    studentId: z.string().uuid(),
    courseId: z.string().uuid().optional().nullable(),
    classSessionId: z.string().uuid().optional().nullable(),
    title: z.string().trim().max(160).optional(),
    content: z.string().trim().max(2000).default(''),
    imageUrls: z.array(z.string().trim().url().max(500)).max(9).default([]),
  })
  .refine((value) => value.content || value.imageUrls.length > 0, {
    message: '请填写作业打卡内容或图片',
  });

const parentUploadTokenSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  prefix: z.enum(['parent-homework', 'student-works']).optional(),
});

const studentWorkSchema = z
  .object({
    studentId: z.string().uuid(),
    courseId: z.string().uuid().optional().nullable(),
    classId: z.string().uuid().optional().nullable(),
    classSessionId: z.string().uuid().optional().nullable(),
    title: z.string().trim().max(160).default('作品展示'),
    description: z.string().trim().max(2000).default(''),
    imageUrls: z.array(z.string().trim().url().max(500)).min(1).max(9),
    frameStyle: z.enum(['classic', 'gallery', 'paper']).default('classic'),
  })
  .refine((value) => value.title || value.description || value.imageUrls.length > 0, {
    message: '请上传作品图片',
  });

function canRescheduleSeatReservation(
  reservation: typeof schema.seatReservations.$inferSelect,
  now: Date,
) {
  return (
    reservation.paymentStatus === 'paid' &&
    reservation.reservationStatus === 'reserved' &&
    reservation.checkInStatus === 'pending' &&
    reservation.rescheduleCount < 1 &&
    (!reservation.cancelBefore || reservation.cancelBefore > now)
  );
}

function overlapsRange(session: { startsAt: Date; endsAt: Date }, from?: Date, to?: Date) {
  if (from && session.endsAt < from) return false;
  if (to && session.startsAt > to) return false;
  return true;
}

export const parentCenterModule: AppModule = {
  name: 'parent-center',
  async register(app) {
    const lessonNotifications = new LessonNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });

    // Resolves the students linked to the authenticated parent account. A parent
    // account links to a guardian (CRM contact); students reference that guardian.
    async function resolveChildren(accountId: string) {
      const account = await accountsRepo.findById(app.db, accountId);
      if (!account) {
        throw httpError(404, 'Account not found');
      }
      if (!account.guardianId) {
        return { account, students: [] as (typeof schema.students.$inferSelect)[] };
      }
      const students = await app.db
        .select()
        .from(schema.students)
        .where(
          and(
            eq(schema.students.guardianId, account.guardianId),
            ne(schema.students.status, 'archived'),
          ),
        );
      return { account, students };
    }

    async function requireSeatReservationForAccount(accountId: string, seatReservationId: string) {
      const { students } = await resolveChildren(accountId);
      const studentIds = students.map((student) => student.id);
      const [row] = await app.db
        .select({ seatReservation: schema.seatReservations })
        .from(schema.seatReservations)
        .innerJoin(schema.orders, eq(schema.seatReservations.orderId, schema.orders.id))
        .where(
          and(
            eq(schema.seatReservations.id, seatReservationId),
            studentIds.length > 0
              ? or(
                  eq(schema.orders.accountId, accountId),
                  inArray(schema.orders.studentId, studentIds),
                )
              : eq(schema.orders.accountId, accountId),
          ),
        )
        .limit(1);
      if (!row) {
        throw httpError(404, 'Seat reservation not found');
      }
      return row.seatReservation;
    }

    function requireOwnedStudent(
      students: (typeof schema.students.$inferSelect)[],
      studentId: string,
    ) {
      const student = students.find((item) => item.id === studentId);
      if (!student) {
        throw httpError(403, '无权操作该学员');
      }
      return student;
    }

    async function assertCourseBelongsToStudent(studentId: string, courseId: string) {
      const [lessonAccount] = await app.db
        .select({ id: schema.lessonAccounts.id })
        .from(schema.lessonAccounts)
        .where(
          and(
            eq(schema.lessonAccounts.studentId, studentId),
            eq(schema.lessonAccounts.courseId, courseId),
          ),
        )
        .limit(1);
      if (lessonAccount) {
        return;
      }

      const [enrollment] = await app.db
        .select({ id: schema.classEnrollments.id })
        .from(schema.classEnrollments)
        .innerJoin(schema.classes, eq(schema.classEnrollments.classId, schema.classes.id))
        .where(
          and(
            eq(schema.classEnrollments.studentId, studentId),
            eq(schema.classEnrollments.active, true),
            eq(schema.classes.courseId, courseId),
          ),
        )
        .limit(1);
      if (!enrollment) {
        throw httpError(422, '该学员未关联所选课程');
      }
    }

    async function enrichHomeworkCheckIns(
      students: (typeof schema.students.$inferSelect)[],
      items: (typeof schema.homeworkCheckIns.$inferSelect)[],
    ) {
      if (items.length === 0) {
        return [];
      }
      const [courses, sessions, classes] = await Promise.all([
        catalogRepo.listCourses(app.db),
        schedulingRepo.listClassSessions(app.db),
        schedulingRepo.listClasses(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));

      return items.map((item) => {
        const session = item.classSessionId ? (sessionById.get(item.classSessionId) ?? null) : null;
        const classGroup = session ? (classById.get(session.classId) ?? null) : null;
        return {
          ...item,
          student: studentById.get(item.studentId)
            ? { id: item.studentId, name: studentById.get(item.studentId)!.name }
            : null,
          course: item.courseId ? (courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
        };
      });
    }

    async function enrichLessonFeedbacks(
      students: (typeof schema.students.$inferSelect)[],
      items: (typeof schema.lessonFeedbacks.$inferSelect)[],
    ) {
      if (items.length === 0) {
        return [];
      }
      const [courses, sessions, classes, teachers, assignments] = await Promise.all([
        catalogRepo.listCourses(app.db),
        schedulingRepo.listClassSessions(app.db),
        schedulingRepo.listClasses(app.db),
        teachingRepo.listTeachers(app.db),
        app.db
          .select()
          .from(schema.homeworkAssignments)
          .where(
            inArray(
              schema.homeworkAssignments.classSessionId,
              Array.from(new Set(items.map((item) => item.classSessionId))),
            ),
          ),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
      const assignmentByKey = new Map(
        assignments.map((assignment) => [
          `${assignment.classSessionId}:${assignment.studentId ?? 'class'}`,
          assignment,
        ]),
      );

      return items.map((item) => {
        const session = sessionById.get(item.classSessionId) ?? null;
        const classGroup = session ? (classById.get(session.classId) ?? null) : null;
        const teacher = item.teacherId ? (teacherById.get(item.teacherId) ?? null) : null;
        const personalAssignment =
          assignmentByKey.get(`${item.classSessionId}:${item.studentId}`) ?? null;
        const classAssignment = assignmentByKey.get(`${item.classSessionId}:class`) ?? null;
        const homeworkAssignment = personalAssignment ?? classAssignment;
        return {
          ...item,
          student: studentById.get(item.studentId)
            ? { id: item.studentId, name: studentById.get(item.studentId)!.name }
            : null,
          course: item.courseId ? (courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          homeworkAssignment: homeworkAssignment
            ? {
                id: homeworkAssignment.id,
                content: homeworkAssignment.content,
                studentId: homeworkAssignment.studentId,
                isPersonal: Boolean(homeworkAssignment.studentId),
              }
            : null,
        };
      });
    }

    async function enrichStudentWorks(
      students: (typeof schema.students.$inferSelect)[],
      items: (typeof schema.studentWorks.$inferSelect)[],
    ) {
      if (items.length === 0) {
        return [];
      }
      const [courses, sessions, classes, teachers] = await Promise.all([
        catalogRepo.listCourses(app.db),
        schedulingRepo.listClassSessions(app.db),
        schedulingRepo.listClasses(app.db),
        teachingRepo.listTeachers(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

      return items.map((item) => {
        const session = item.classSessionId ? (sessionById.get(item.classSessionId) ?? null) : null;
        const classGroup =
          (item.classId ? (classById.get(item.classId) ?? null) : null) ??
          (session ? (classById.get(session.classId) ?? null) : null);
        const teacher =
          (item.teacherId ? (teacherById.get(item.teacherId) ?? null) : null) ??
          (classGroup?.teacherId ? (teacherById.get(classGroup.teacherId) ?? null) : null);
        return {
          ...item,
          student: studentById.get(item.studentId)
            ? { id: item.studentId, name: studentById.get(item.studentId)!.name }
            : null,
          course: item.courseId ? (courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        };
      });
    }

    async function listHomeworkAssignmentsForStudents(
      students: (typeof schema.students.$inferSelect)[],
    ) {
      const studentIds = students.map((student) => student.id);
      if (studentIds.length === 0) {
        return [];
      }
      const enrollments = await app.db
        .select()
        .from(schema.classEnrollments)
        .where(
          and(
            inArray(schema.classEnrollments.studentId, studentIds),
            eq(schema.classEnrollments.active, true),
          ),
        );
      const classIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.classId)));
      if (classIds.length === 0) {
        return [];
      }
      const items = await app.db
        .select()
        .from(schema.homeworkAssignments)
        .where(inArray(schema.homeworkAssignments.classId, classIds))
        .orderBy(desc(schema.homeworkAssignments.createdAt));
      const [courses, sessions, classes, teachers] = await Promise.all([
        catalogRepo.listCourses(app.db),
        schedulingRepo.listClassSessions(app.db),
        schedulingRepo.listClasses(app.db),
        teachingRepo.listTeachers(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
      const studentIdsByClassId = new Map<string, Set<string>>();
      for (const enrollment of enrollments) {
        const set = studentIdsByClassId.get(enrollment.classId) ?? new Set<string>();
        set.add(enrollment.studentId);
        studentIdsByClassId.set(enrollment.classId, set);
      }
      return items
        .filter((item) => {
          if (item.studentId) return studentIds.includes(item.studentId);
          return (studentIdsByClassId.get(item.classId)?.size ?? 0) > 0;
        })
        .map((item) => ({
          ...item,
          student: item.studentId
            ? studentById.get(item.studentId)
              ? { id: item.studentId, name: studentById.get(item.studentId)!.name }
              : null
            : null,
          course: item.courseId ? (courseById.get(item.courseId) ?? null) : null,
          session: sessionById.get(item.classSessionId) ?? null,
          class: classById.get(item.classId)
            ? { id: item.classId, name: classById.get(item.classId)!.name }
            : null,
          teacher: item.teacherId
            ? teacherById.get(item.teacherId)
              ? { id: item.teacherId, name: teacherById.get(item.teacherId)!.name }
              : null
            : null,
          isPersonal: Boolean(item.studentId),
        }));
    }

    app.get('/public/me/children', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      if (students.length === 0) {
        return { children: [] };
      }

      const studentIds = students.map((student) => student.id);
      const [enrollments, classes, courses, campuses, teachers] = await Promise.all([
        app.db
          .select()
          .from(schema.classEnrollments)
          .where(
            and(
              inArray(schema.classEnrollments.studentId, studentIds),
              eq(schema.classEnrollments.active, true),
            ),
          ),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        organizationRepo.listCampuses(app.db),
        teachingRepo.listTeachers(app.db),
      ]);
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
      const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
      const enrollmentsByStudentId = new Map<string, typeof enrollments>();
      for (const enrollment of enrollments) {
        enrollmentsByStudentId.set(enrollment.studentId, [
          ...(enrollmentsByStudentId.get(enrollment.studentId) ?? []),
          enrollment,
        ]);
      }

      return {
        children: students.map((student) => ({
          ...student,
          enrollments: (enrollmentsByStudentId.get(student.id) ?? []).flatMap((enrollment) => {
            const classGroup = classById.get(enrollment.classId);
            if (!classGroup) return [];
            const course = courseById.get(classGroup.courseId) ?? null;
            const campus = campusById.get(classGroup.campusId) ?? null;
            const teacher = teacherById.get(classGroup.teacherId) ?? null;
            return [
              {
                id: enrollment.id,
                classId: classGroup.id,
                className: classGroup.name,
                course: course ? { id: course.id, name: course.name, slug: course.slug } : null,
                campus: campus ? { id: campus.id, name: campus.name } : null,
                teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
              },
            ];
          }),
        })),
      };
    });

    app.get('/public/me/lesson-accounts', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((s) => s.id);
      if (studentIds.length === 0) {
        return { lessonAccounts: [] };
      }
      const [lessonAccounts, courses] = await Promise.all([
        app.db
          .select()
          .from(schema.lessonAccounts)
          .where(inArray(schema.lessonAccounts.studentId, studentIds)),
        catalogRepo.listCourses(app.db),
      ]);
      const studentById = new Map(students.map((s) => [s.id, s]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      return {
        lessonAccounts: lessonAccounts.map((row) => ({
          ...row,
          student: studentById.get(row.studentId),
          course: courseById.get(row.courseId) ?? null,
        })),
      };
    });

    app.get('/public/me/orders', { preHandler: app.requireParent }, async (request) => {
      const { students: ownedStudents } = await resolveChildren(request.account!.id);
      const ownedStudentIds = ownedStudents.map((student) => student.id);
      const orderVisibilityCondition =
        ownedStudentIds.length > 0
          ? or(
              eq(schema.orders.accountId, request.account!.id),
              inArray(schema.orders.studentId, ownedStudentIds),
            )
          : eq(schema.orders.accountId, request.account!.id);
      const [orders, students, courses, packages] = await Promise.all([
        app.db
          .select()
          .from(schema.orders)
          .where(orderVisibilityCondition)
          .orderBy(desc(schema.orders.createdAt)),
        peopleRepo.listStudents(app.db),
        catalogRepo.listCourses(app.db),
        packagesRepo.listPackages(app.db),
      ]);
      const refundRequests = await refundsRepo.listRefundRequestsForOrders(
        app.db,
        orders.map((order) => order.id),
      );
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));
      const refundRequestsByOrderId = new Map<string, typeof refundRequests>();
      for (const refund of refundRequests) {
        refundRequestsByOrderId.set(refund.orderId, [
          ...(refundRequestsByOrderId.get(refund.orderId) ?? []),
          refund,
        ]);
      }

      return {
        orders: orders.map((order) => ({
          ...order,
          student: order.studentId ? (studentById.get(order.studentId) ?? null) : null,
          course: order.courseId ? (courseById.get(order.courseId) ?? null) : null,
          package: order.packageId ? (packageById.get(order.packageId) ?? null) : null,
          refundRequests: refundRequestsByOrderId.get(order.id) ?? [],
        })),
      };
    });

    app.get('/public/me/seat-reservations', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((student) => student.id);
      const rows = await app.db
        .select({ seatReservation: schema.seatReservations })
        .from(schema.seatReservations)
        .innerJoin(schema.orders, eq(schema.seatReservations.orderId, schema.orders.id))
        .where(
          studentIds.length > 0
            ? or(
                eq(schema.orders.accountId, request.account!.id),
                inArray(schema.orders.studentId, studentIds),
              )
            : eq(schema.orders.accountId, request.account!.id),
        )
        .orderBy(desc(schema.seatReservations.createdAt));

      if (rows.length === 0) {
        return { seatReservations: [] };
      }

      const [courses, trialSessions, campuses] = await Promise.all([
        catalogRepo.listCourses(app.db),
        trialRepo.listTrialSessions(app.db),
        organizationRepo.listCampuses(app.db),
      ]);
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const trialSessionById = new Map(trialSessions.map((session) => [session.id, session]));
      const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
      const now = new Date();

      return {
        seatReservations: rows.map(({ seatReservation }) => {
          const canReschedule = canRescheduleSeatReservation(seatReservation, now);
          const rescheduleOptions = canReschedule
            ? trialSessions
                .filter(
                  (session) =>
                    session.status === 'open' &&
                    seatReservation.courseId === session.courseId &&
                    seatReservation.trialSessionId !== session.id &&
                    session.startsAt > now &&
                    session.bookedCount < session.capacity,
                )
                .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
            : [];

          return {
            ...seatReservation,
            course: seatReservation.courseId
              ? (courseById.get(seatReservation.courseId) ?? null)
              : null,
            trialSession: seatReservation.trialSessionId
              ? (trialSessionById.get(seatReservation.trialSessionId) ?? null)
              : null,
            campus: seatReservation.campusId
              ? (campusById.get(seatReservation.campusId) ?? null)
              : null,
            canReschedule,
            rescheduleOptions,
          };
        }),
      };
    });

    app.post(
      '/public/me/seat-reservations/:seatReservationId/reschedule',
      { preHandler: app.requireParent },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        const body = seatReservationRescheduleSchema.parse(request.body);
        await requireSeatReservationForAccount(request.account!.id, seatReservationId);
        return seatReservationRepo.rescheduleSeatReservation(app.db, {
          reservationId: seatReservationId,
          trialSessionId: body.trialSessionId,
        });
      },
    );

    app.get('/public/me/check-in-sessions', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((student) => student.id);
      if (studentIds.length === 0) {
        return { checkInSessions: [] };
      }

      const enrollments = await app.db
        .select()
        .from(schema.classEnrollments)
        .where(
          and(
            inArray(schema.classEnrollments.studentId, studentIds),
            eq(schema.classEnrollments.active, true),
          ),
        );
      if (enrollments.length === 0) {
        return { checkInSessions: [] };
      }

      const classIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.classId)));
      const now = new Date();
      const windowStartsAt = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const windowEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const [sessions, classes, courses, classrooms] = await Promise.all([
        app.db
          .select()
          .from(schema.classSessions)
          .where(inArray(schema.classSessions.classId, classIds)),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listClassrooms(app.db),
      ]);
      const visibleSessions = sessions
        .filter(
          (session) =>
            session.status === 'scheduled' &&
            session.endsAt >= windowStartsAt &&
            session.startsAt <= windowEndsAt,
        )
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      if (visibleSessions.length === 0) {
        return { checkInSessions: [] };
      }

      const sessionIds = visibleSessions.map((session) => session.id);
      const attendanceRecords = await app.db
        .select()
        .from(schema.attendanceRecords)
        .where(
          and(
            inArray(schema.attendanceRecords.classSessionId, sessionIds),
            inArray(schema.attendanceRecords.studentId, studentIds),
          ),
        );

      const studentById = new Map(students.map((student) => [student.id, student]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
      const enrollmentsByClassId = new Map<string, typeof enrollments>();
      for (const enrollment of enrollments) {
        enrollmentsByClassId.set(enrollment.classId, [
          ...(enrollmentsByClassId.get(enrollment.classId) ?? []),
          enrollment,
        ]);
      }
      const attendanceBySessionStudent = new Map(
        attendanceRecords.map((record) => [`${record.classSessionId}:${record.studentId}`, record]),
      );

      return {
        checkInSessions: visibleSessions.flatMap((session) => {
          const classGroup = classById.get(session.classId);
          if (!classGroup) {
            return [];
          }
          const course = courseById.get(classGroup.courseId) ?? null;
          const classroom = classroomById.get(session.classroomId) ?? null;
          return (enrollmentsByClassId.get(session.classId) ?? []).flatMap((enrollment) => {
            const student = studentById.get(enrollment.studentId);
            if (!student) {
              return [];
            }
            const attendanceRecord = attendanceBySessionStudent.get(`${session.id}:${student.id}`);
            return [
              {
                sessionId: session.id,
                startsAt: session.startsAt,
                endsAt: session.endsAt,
                topic: session.topic,
                status: session.status,
                student: { id: student.id, name: student.name, grade: student.grade },
                class: { id: classGroup.id, name: classGroup.name },
                course,
                classroom,
                checkedIn: Boolean(attendanceRecord),
                attendanceStatus: attendanceRecord?.status ?? null,
                canCheckIn: !attendanceRecord,
              },
            ];
          });
        }),
      };
    });

    app.get('/public/me/calendar', { preHandler: app.requireParent }, async (request) => {
      const query = parentCalendarQuerySchema.parse(request.query);
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = query.studentId
        ? students.some((student) => student.id === query.studentId)
          ? [query.studentId]
          : []
        : students.map((student) => student.id);

      if (studentIds.length === 0) {
        return { events: [] };
      }

      const enrollments = await app.db
        .select()
        .from(schema.classEnrollments)
        .where(
          and(
            inArray(schema.classEnrollments.studentId, studentIds),
            eq(schema.classEnrollments.active, true),
          ),
        );
      if (enrollments.length === 0) {
        return { events: [] };
      }

      const classIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.classId)));
      const [sessions, classes, courses, classrooms, attendanceRecords] = await Promise.all([
        app.db
          .select()
          .from(schema.classSessions)
          .where(inArray(schema.classSessions.classId, classIds)),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listClassrooms(app.db),
        app.db
          .select()
          .from(schema.attendanceRecords)
          .where(inArray(schema.attendanceRecords.studentId, studentIds)),
      ]);

      const studentById = new Map(students.map((student) => [student.id, student]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
      const enrollmentsByClassId = new Map<string, typeof enrollments>();
      for (const enrollment of enrollments) {
        enrollmentsByClassId.set(enrollment.classId, [
          ...(enrollmentsByClassId.get(enrollment.classId) ?? []),
          enrollment,
        ]);
      }
      const attendanceBySessionStudent = new Map(
        attendanceRecords.map((record) => [`${record.classSessionId}:${record.studentId}`, record]),
      );

      return {
        events: sessions
          .filter((session) => overlapsRange(session, from, to))
          .flatMap((session) => {
            const classGroup = classById.get(session.classId);
            if (!classGroup) return [];
            const course = courseById.get(classGroup.courseId) ?? null;
            const classroom = classroomById.get(session.classroomId) ?? null;
            return (enrollmentsByClassId.get(session.classId) ?? []).flatMap((enrollment) => {
              const student = studentById.get(enrollment.studentId);
              if (!student) return [];
              const attendanceRecord = attendanceBySessionStudent.get(
                `${session.id}:${student.id}`,
              );
              return [
                {
                  id: `${session.id}:${student.id}`,
                  sessionId: session.id,
                  type: 'class_session',
                  title: session.topic,
                  startsAt: session.startsAt,
                  endsAt: session.endsAt,
                  status: session.status,
                  student: { id: student.id, name: student.name, grade: student.grade },
                  class: { id: classGroup.id, name: classGroup.name },
                  course,
                  classroom,
                  attendanceStatus: attendanceRecord?.status ?? null,
                  checkedIn: Boolean(attendanceRecord),
                },
              ];
            });
          }),
      };
    });

    app.post(
      '/public/me/check-in-sessions/:sessionId/check-in',
      { preHandler: app.requireParent },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const body = parentCheckInSchema.parse(request.body);
        const { students } = await resolveChildren(request.account!.id);
        requireOwnedStudent(students, body.studentId);

        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) {
          throw httpError(404, 'Class session not found');
        }
        if (session.status === 'cancelled') {
          throw httpError(422, '课次已取消');
        }

        const classGroup = await schedulingRepo.findClass(app.db, session.classId);
        if (!classGroup) {
          throw httpError(404, 'Class not found');
        }
        const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
        const enrolled = enrollments.some((enrollment) => enrollment.studentId === body.studentId);
        if (!enrolled) {
          throw httpError(422, '该学员未报名本班级');
        }

        const existingRecords = await attendanceRepo.listAttendanceForSession(app.db, sessionId);
        const alreadyCheckedIn = existingRecords.some(
          (record) => record.studentId === body.studentId,
        );
        if (session.status === 'completed' && !alreadyCheckedIn) {
          throw httpError(422, '课次已完成');
        }

        const existingStudentIds = new Set(existingRecords.map((record) => record.studentId));
        const attendanceRecords = await attendanceRepo.recordAttendance(app.db, {
          sessionId,
          courseId: classGroup.courseId,
          records: [{ studentId: body.studentId, status: 'present', note: '家长中心签到' }],
          completeSession: false,
        });
        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
        });

        const latestAttendanceRecords = alreadyCheckedIn
          ? existingRecords
          : await attendanceRepo.listAttendanceForSession(app.db, sessionId);
        const checkedInStudentIds = new Set(
          latestAttendanceRecords.map((record) => record.studentId),
        );
        if (
          enrollments.length > 0 &&
          enrollments.every((enrollment) => checkedInStudentIds.has(enrollment.studentId))
        ) {
          await schedulingRepo.markSessionCompleted(app.db, sessionId);
        }

        return {
          attendanceRecord:
            attendanceRecords.find((record) => record.studentId === body.studentId) ?? null,
          message: alreadyCheckedIn ? '已签到，无需重复操作。' : '签到成功，课时已自动扣减。',
        };
      },
    );

    app.get('/public/me/attendance', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((s) => s.id);
      const records = await attendanceRepo.listAttendanceForStudents(app.db, studentIds);
      const studentById = new Map(students.map((s) => [s.id, s]));
      return {
        attendance: records.map((row) => ({
          ...row,
          student: studentById.get(row.studentId)
            ? { id: row.studentId, name: studentById.get(row.studentId)!.name }
            : undefined,
        })),
      };
    });

    app.get('/public/me/homework-check-ins', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((student) => student.id);
      if (studentIds.length === 0) {
        return { homeworkCheckIns: [] };
      }
      const items = await app.db
        .select()
        .from(schema.homeworkCheckIns)
        .where(inArray(schema.homeworkCheckIns.studentId, studentIds))
        .orderBy(desc(schema.homeworkCheckIns.createdAt));
      return { homeworkCheckIns: await enrichHomeworkCheckIns(students, items) };
    });

    app.get('/public/me/lesson-feedbacks', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((student) => student.id);
      if (studentIds.length === 0) {
        return { lessonFeedbacks: [] };
      }
      const items = await app.db
        .select()
        .from(schema.lessonFeedbacks)
        .where(inArray(schema.lessonFeedbacks.studentId, studentIds))
        .orderBy(desc(schema.lessonFeedbacks.createdAt));
      return { lessonFeedbacks: await enrichLessonFeedbacks(students, items) };
    });

    app.get('/public/me/homework-assignments', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      return { homeworkAssignments: await listHomeworkAssignmentsForStudents(students) };
    });

    app.post(
      '/public/me/homework-check-ins',
      { preHandler: app.requireParent },
      async (request) => {
        const body = homeworkCheckInSchema.parse(request.body);
        const { students } = await resolveChildren(request.account!.id);
        requireOwnedStudent(students, body.studentId);

        let courseId = body.courseId ?? null;
        if (body.classSessionId) {
          const session = await schedulingRepo.findSession(app.db, body.classSessionId);
          if (!session) {
            throw httpError(404, 'Class session not found');
          }
          const classGroup = await schedulingRepo.findClass(app.db, session.classId);
          if (!classGroup) {
            throw httpError(404, 'Class not found');
          }
          const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
          const enrolled = enrollments.some(
            (enrollment) => enrollment.studentId === body.studentId,
          );
          if (!enrolled) {
            throw httpError(422, '该学员未报名本班级');
          }
          courseId = classGroup.courseId;
        } else if (courseId) {
          await assertCourseBelongsToStudent(body.studentId, courseId);
        }

        const [item] = await app.db
          .insert(schema.homeworkCheckIns)
          .values({
            accountId: request.account!.id,
            studentId: body.studentId,
            courseId,
            classSessionId: body.classSessionId ?? null,
            title: body.title || '作业打卡',
            content: body.content,
            imageUrls: body.imageUrls,
          })
          .returning();

        return {
          homeworkCheckIn: (await enrichHomeworkCheckIns(students, [item]))[0],
          message: '作业打卡已提交',
        };
      },
    );

    app.get('/public/me/student-works', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((student) => student.id);
      if (studentIds.length === 0) {
        return { studentWorks: [] };
      }
      const items = await app.db
        .select()
        .from(schema.studentWorks)
        .where(inArray(schema.studentWorks.studentId, studentIds))
        .orderBy(desc(schema.studentWorks.createdAt));
      return { studentWorks: await enrichStudentWorks(students, items) };
    });

    app.post('/public/me/student-works', { preHandler: app.requireParent }, async (request) => {
      const body = studentWorkSchema.parse(request.body);
      const { students } = await resolveChildren(request.account!.id);
      requireOwnedStudent(students, body.studentId);

      let courseId = body.courseId ?? null;
      let classId = body.classId ?? null;
      let teacherId: string | null = null;

      if (body.classSessionId) {
        const session = await schedulingRepo.findSession(app.db, body.classSessionId);
        if (!session) {
          throw httpError(404, 'Class session not found');
        }
        const classGroup = await schedulingRepo.findClass(app.db, session.classId);
        if (!classGroup) {
          throw httpError(404, 'Class not found');
        }
        const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
        if (!enrollments.some((enrollment) => enrollment.studentId === body.studentId)) {
          throw httpError(422, '该成员未加入此活动组');
        }
        classId = classGroup.id;
        courseId = classGroup.courseId;
        teacherId = session.teacherId ?? classGroup.teacherId ?? null;
      } else if (classId) {
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) {
          throw httpError(404, 'Class not found');
        }
        const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
        if (!enrollments.some((enrollment) => enrollment.studentId === body.studentId)) {
          throw httpError(422, '该成员未加入此活动组');
        }
        courseId = classGroup.courseId;
        teacherId = classGroup.teacherId ?? null;
      } else if (courseId) {
        await assertCourseBelongsToStudent(body.studentId, courseId);
      }

      const [item] = await app.db
        .insert(schema.studentWorks)
        .values({
          accountId: request.account!.id,
          studentId: body.studentId,
          courseId,
          classId,
          classSessionId: body.classSessionId ?? null,
          teacherId,
          title: body.title || '作品展示',
          description: body.description,
          imageUrls: body.imageUrls,
          frameStyle: body.frameStyle,
          source: 'parent',
        })
        .returning();

      return {
        studentWork: (await enrichStudentWorks(students, [item]))[0],
        message: '作品已发布',
      };
    });

    // Issues a short-lived Qiniu upload token so the Mini Program can upload
    // homework photos directly to object storage (wx.uploadFile), then submit
    // the returned public URL with the homework check-in.
    app.post('/public/me/upload-token', { preHandler: app.requireParent }, async (request) => {
      const body = parentUploadTokenSchema.parse(request.body);
      const qiniu = new QiniuSettingsService(app.db, app.appEnv);
      return qiniu.createUploadToken({
        filename: body.filename,
        prefix: body.prefix ?? 'parent-homework',
      });
    });

    app.get('/public/me/notifications', { preHandler: app.requireParent }, async (request) => {
      const items = await notificationsRepo.listForRecipient(app.db, {
        recipientType: 'parent',
        recipientId: request.account!.id,
      });
      return { notifications: items };
    });

    app.post(
      '/public/me/notifications/:notificationId/read',
      { preHandler: app.requireParent },
      async (request) => {
        const { notificationId } = request.params as { notificationId: string };
        const item = await notificationsRepo.markAsRead(
          app.db,
          notificationId,
          request.account!.id,
        );
        if (!item) {
          throw httpError(404, 'Notification not found');
        }
        return { notification: item };
      },
    );
  },
};
