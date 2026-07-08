import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import { hashPassword, defaultPasswordFromPhone } from '../../lib/password.js';
import { QiniuSettingsService } from '../../lib/qiniu-settings.js';
import { LearningNotificationService } from '../notifications/learning-notification-service.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
import { NotificationsService } from '../notifications/service.js';
import type { AppModule } from '../types.js';

const teacherSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(''),
  title: z.string().max(120).optional(),
  avatarUrl: z.string().max(500).optional(),
  institutionId: z.string().uuid().nullable().optional(),
  tagline: z.string().max(200).optional(),
  wechatQrUrl: z.string().max(500).optional(),
  education: z.string().default(''),
  teachingExperience: z.string().default(''),
  teachingStyle: z.string().default(''),
  achievements: z.string().default(''),
  teachingYears: z.string().max(40).optional(),
  studentCount: z.string().max(40).optional(),
  retentionRate: z.string().max(40).optional(),
  practiceDuration: z.string().max(40).optional(),
  teachingPhilosophy: z.string().default(''),
  classPhotoUrls: z.array(z.string().min(1).max(500)).max(24).default([]),
  studentWorkUrls: z.array(z.string().min(1).max(500)).max(24).default([]),
  parentTestimonials: z.array(z.string().min(1).max(240)).max(12).default([]),
  bio: z.string().default(''),
  specialties: z.array(z.string()).default([]),
  isPinned: z.boolean().default(false),
  status: z.enum(['active', 'archived']).default('active'),
});

const teacherUpdateSchema = teacherSchema.partial();

type TeacherRow = typeof schema.teachers.$inferSelect;

function normalizeTeacherBody<T extends { practiceDuration?: string; retentionRate?: string }>(
  body: T,
): Omit<T, 'practiceDuration'> {
  const { practiceDuration, ...rest } = body;
  return {
    ...rest,
    retentionRate: practiceDuration ?? body.retentionRate,
  } as Omit<T, 'practiceDuration'>;
}

function toTeacherDto<T extends TeacherRow>(teacher: T) {
  return {
    ...teacher,
    practiceDuration: teacher.retentionRate,
  };
}

const institutionImageCaptionSchema = z.object({
  imageUrl: z.string().trim().max(500).default(''),
  caption: z.string().trim().max(200).default(''),
});

const institutionSchema = z.object({
  name: z.string().min(1).max(160),
  logoUrl: z.string().max(500).optional(),
  intro: z.string().default(''),
  qualificationItems: z.array(institutionImageCaptionSchema).max(20).default([]),
  outcomeItems: z.array(institutionImageCaptionSchema).max(20).default([]),
  contact: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(['active', 'archived']).default('active'),
});

const institutionUpdateSchema = institutionSchema.partial();

const institutionOrderSchema = z.object({
  ids: z.array(z.string().uuid()).default([]),
});

const classroomSchema = z.object({
  campusId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z.enum(['active', 'archived']).default('active'),
});

const classroomUpdateSchema = classroomSchema.partial();

const teacherAttendanceSchema = z.object({
  records: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(['present', 'late', 'leave', 'absent', 'makeup', 'trial']),
      note: z.string().optional(),
    }),
  ),
});
const teacherCalendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const teacherNotificationQuerySchema = z.object({
  status: z.enum(['unread', 'read', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const teacherClassOptionsQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
});

const teacherEnrollmentSchema = z.object({
  classId: z.string().uuid(),
  notificationId: z.string().uuid().optional(),
});

function overlapsRange(session: { startsAt: Date; endsAt: Date }, from?: Date, to?: Date) {
  if (from && session.endsAt < from) return false;
  if (to && session.startsAt > to) return false;
  return true;
}

function summarizeAttendance(records: Array<{ status: string }>) {
  return records.reduce(
    (summary, record) => ({
      ...summary,
      [record.status]: (summary[record.status as keyof typeof summary] ?? 0) + 1,
    }),
    { present: 0, late: 0, leave: 0, absent: 0, makeup: 0, trial: 0 },
  );
}

const teacherHomeworkReviewSchema = z.object({
  reviewStatus: z.enum(['reviewed', 'needs_revision']).default('reviewed'),
  teacherFeedback: z.string().trim().max(2000).default(''),
  rating: z.number().int().min(0).max(5).default(0),
});

const teacherUploadTokenSchema = z.object({
  filename: z.string().trim().min(1).max(200),
});

const teacherStudentWorkSchema = z
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

const teacherLessonFeedbackSchema = z.object({
  classAssignmentContent: z.string().trim().max(2000).default(''),
  studentAssignments: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        content: z.string().trim().max(2000).default(''),
      }),
    )
    .default([]),
  items: z
    .array(
      z
        .object({
          studentId: z.string().uuid(),
          content: z.string().trim().max(2000).default(''),
          rating: z.number().int().min(0).max(5).default(0),
          imageUrls: z.array(z.string().trim().url().max(500)).max(9).default([]),
        })
        .refine((value) => value.rating > 0 || value.content || value.imageUrls.length > 0, {
          message: '请选择星星或填写点评内容',
        }),
    )
    .default([]),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function compactText(value: string | null | undefined, fallback: string, maxLength = 80) {
  const normalized = value?.trim() || fallback;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export const teachingModule: AppModule = {
  name: 'teaching',
  async register(app) {
    const lessonNotifications = new LessonNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });
    const learningNotifications = new LearningNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });

    function billingCourseByStudentId(
      roster: Array<Pick<schedulingRepo.SessionRosterEntry, 'studentId' | 'billingCourseId'>>,
    ) {
      return new Map(roster.map((entry) => [entry.studentId, entry.billingCourseId]));
    }

    app.get(
      '/public/teacher/dashboard',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const account = await accountsRepo.findById(app.db, request.account!.id);
        if (!account?.teacherId) {
          throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
        }

        const [
          sessions,
          classes,
          courses,
          classrooms,
          students,
          attendanceRecords,
          lessonAccounts,
        ] = await Promise.all([
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          catalogRepo.listCourses(app.db),
          teachingRepo.listClassrooms(app.db),
          peopleRepo.listStudents(app.db),
          app.db.select().from(schema.attendanceRecords),
          app.db.select().from(schema.lessonAccounts),
        ]);
        const classById = new Map(classes.map((item) => [item.id, item]));
        const courseById = new Map(courses.map((item) => [item.id, item]));
        const classroomById = new Map(classrooms.map((item) => [item.id, item]));
        const studentById = new Map(students.map((item) => [item.id, item]));
        const lessonAccountByStudentCourse = new Map(
          lessonAccounts.map((item) => [`${item.studentId}:${item.courseId}`, item]),
        );
        const myClasses = classes.filter((item) => item.teacherId === account.teacherId);
        const enrollmentsByClassId = new Map<
          string,
          Awaited<ReturnType<typeof schedulingRepo.listEnrollments>>
        >();

        const classCards = await Promise.all(
          myClasses.map(async (classGroup) => {
            const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
            enrollmentsByClassId.set(classGroup.id, enrollments);
            return {
              ...classGroup,
              course: courseById.get(classGroup.courseId),
              classroom: classroomById.get(classGroup.classroomId),
              students: enrollments
                .map((enrollment) => studentById.get(enrollment.studentId))
                .filter(Boolean)
                .map((student) => ({
                  id: student!.id,
                  name: student!.name,
                  grade: student!.grade,
                  school: student!.school,
                  status: student!.status,
                  lessonBalance:
                    lessonAccountByStudentCourse.get(`${student!.id}:${classGroup.courseId}`)
                      ?.balance ?? null,
                })),
            };
          }),
        );
        const mySessionIds = sessions
          .filter((session) => session.teacherId === account.teacherId)
          .map((session) => session.id);
        const temporaryStudents = await schedulingRepo.listTemporaryStudentsForSessions(
          app.db,
          mySessionIds,
        );
        const temporaryCountBySessionId = new Map<string, number>();
        for (const temporaryStudent of temporaryStudents) {
          temporaryCountBySessionId.set(
            temporaryStudent.classSessionId,
            (temporaryCountBySessionId.get(temporaryStudent.classSessionId) ?? 0) + 1,
          );
        }

        return {
          sessions: sessions
            .filter((session) => session.teacherId === account.teacherId)
            .map((session) => {
              const classGroup = classById.get(session.classId);
              const sessionAttendance = attendanceRecords.filter(
                (record) => record.classSessionId === session.id,
              );
              return {
                ...session,
                class: classGroup ? { name: classGroup.name } : undefined,
                course: classGroup ? courseById.get(classGroup.courseId) : undefined,
                classroom: classroomById.get(session.classroomId),
                rosterCount: classGroup
                  ? (enrollmentsByClassId.get(classGroup.id)?.length ?? 0) +
                    (temporaryCountBySessionId.get(session.id) ?? 0)
                  : 0,
                attendanceCount: sessionAttendance.length,
                attendanceSummary: summarizeAttendance(sessionAttendance),
              };
            }),
          classes: classCards,
        };
      },
    );

    app.get(
      '/public/teacher/notifications',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const query = teacherNotificationQuerySchema.parse(request.query);
        const service = new NotificationsService(app.db);
        const items = await service.listForRecipient({
          recipientType: 'staff',
          recipientId: request.account!.id,
          status: query.status,
          limit: query.limit ?? 50,
        });
        return {
          notifications: items.filter((item) => item.category.startsWith('teacher.')),
        };
      },
    );

    app.post(
      '/public/teacher/notifications/:notificationId/read',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { notificationId } = request.params as { notificationId: string };
        const service = new NotificationsService(app.db);
        const item = await service.markAsRead(notificationId, request.account!.id);
        if (!item || !item.category.startsWith('teacher.')) {
          throw notFound('Notification not found');
        }
        return { notification: item };
      },
    );

    app.get(
      '/public/teacher/students/:studentId/class-options',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { studentId } = request.params as { studentId: string };
        const query = teacherClassOptionsQuerySchema.parse(request.query);
        const options = await loadTeacherClassOptions({
          accountId: request.account!.id,
          studentId,
          courseId: query.courseId,
        });
        return {
          student: options.student,
          lessonAccounts: options.lessonAccounts,
          classes: options.classes,
        };
      },
    );

    app.post(
      '/public/teacher/students/:studentId/enrollments',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { studentId } = request.params as { studentId: string };
        const body = teacherEnrollmentSchema.parse(request.body);
        const account = await requireTeacherAccount(request.account!.id);
        const classGroup = await schedulingRepo.findClass(app.db, body.classId);
        if (!classGroup) throw notFound('Class not found');
        if (classGroup.teacherId !== account.teacherId) {
          throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
        }
        if (!['recruiting', 'active'].includes(classGroup.status)) {
          throw Object.assign(new Error('只能分入招生中或开课中班级'), { statusCode: 422 });
        }

        await peopleRepo.requireStudent(app.db, studentId);
        const [lessonAccount] = await app.db
          .select()
          .from(schema.lessonAccounts)
          .where(
            and(
              eq(schema.lessonAccounts.studentId, studentId),
              eq(schema.lessonAccounts.courseId, classGroup.courseId),
            ),
          )
          .limit(1);
        if (!lessonAccount) {
          throw Object.assign(new Error('该学员暂无此课程的正式课时档案'), { statusCode: 422 });
        }

        const allClasses = await schedulingRepo.listClasses(app.db);
        const sameCourseClasses = allClasses.filter(
          (item) => item.courseId === classGroup.courseId,
        );
        const sameCourseEnrollments = (
          await Promise.all(
            sameCourseClasses.map((item) => schedulingRepo.listEnrollments(app.db, item.id)),
          )
        ).flat();
        const existingSameCourseEnrollment = sameCourseEnrollments.find(
          (enrollment) => enrollment.studentId === studentId,
        );
        if (existingSameCourseEnrollment) {
          throw Object.assign(
            new Error(
              existingSameCourseEnrollment.classId === classGroup.id
                ? '该学员已在此班'
                : '该学员已在同课程其他班级，需管理员调整',
            ),
            { statusCode: 409 },
          );
        }

        const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classGroup.id);
        if (enrolledCount >= classGroup.capacity) {
          throw Object.assign(new Error('班级已满'), { statusCode: 409 });
        }

        const enrollment = await schedulingRepo.createEnrollment(app.db, {
          classId: classGroup.id,
          studentId,
          active: true,
        });

        if (body.notificationId) {
          await new NotificationsService(app.db).markAsRead(
            body.notificationId,
            request.account!.id,
          );
        }

        return { enrollment };
      },
    );

    app.get(
      '/public/teacher/calendar',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const account = await accountsRepo.findById(app.db, request.account!.id);
        if (!account?.teacherId) {
          throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
        }
        const query = teacherCalendarQuerySchema.parse(request.query);
        const from = query.from ? new Date(query.from) : undefined;
        const to = query.to ? new Date(query.to) : undefined;

        const [sessions, classes, courses, classrooms, attendanceRecords] = await Promise.all([
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          catalogRepo.listCourses(app.db),
          teachingRepo.listClassrooms(app.db),
          app.db.select().from(schema.attendanceRecords),
        ]);
        const classById = new Map(classes.map((item) => [item.id, item]));
        const courseById = new Map(courses.map((item) => [item.id, item]));
        const classroomById = new Map(classrooms.map((item) => [item.id, item]));
        const myClasses = classes.filter((item) => item.teacherId === account.teacherId);
        const enrollments = (
          await Promise.all(
            myClasses.map((classGroup) => schedulingRepo.listEnrollments(app.db, classGroup.id)),
          )
        ).flat();
        const rosterCountByClassId = new Map<string, number>();
        for (const enrollment of enrollments) {
          rosterCountByClassId.set(
            enrollment.classId,
            (rosterCountByClassId.get(enrollment.classId) ?? 0) + 1,
          );
        }
        const mySessionIds = sessions
          .filter((session) => session.teacherId === account.teacherId)
          .map((session) => session.id);
        const temporaryStudents = await schedulingRepo.listTemporaryStudentsForSessions(
          app.db,
          mySessionIds,
        );
        const temporaryCountBySessionId = new Map<string, number>();
        for (const temporaryStudent of temporaryStudents) {
          temporaryCountBySessionId.set(
            temporaryStudent.classSessionId,
            (temporaryCountBySessionId.get(temporaryStudent.classSessionId) ?? 0) + 1,
          );
        }

        return {
          events: sessions
            .filter(
              (session) =>
                session.teacherId === account.teacherId && overlapsRange(session, from, to),
            )
            .map((session) => {
              const classGroup = classById.get(session.classId);
              const course = classGroup ? courseById.get(classGroup.courseId) : undefined;
              const classroom = classroomById.get(session.classroomId);
              const sessionAttendance = attendanceRecords.filter(
                (record) => record.classSessionId === session.id,
              );
              return {
                id: session.id,
                type: 'class_session',
                title: session.topic,
                startsAt: session.startsAt,
                endsAt: session.endsAt,
                status: session.status,
                class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
                course: course ? { id: course.id, name: course.name } : null,
                classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
                rosterCount: classGroup
                  ? (rosterCountByClassId.get(classGroup.id) ?? 0) +
                    (temporaryCountBySessionId.get(session.id) ?? 0)
                  : 0,
                attendanceCount: sessionAttendance.length,
                attendanceSummary: summarizeAttendance(sessionAttendance),
              };
            }),
        };
      },
    );

    // Resolves the authenticated teacher's session and asserts they own it, so a
    // teacher can only read/record attendance for their own class sessions.
    async function requireOwnedSession(accountId: string, sessionId: string) {
      const account = await accountsRepo.findById(app.db, accountId);
      if (!account?.teacherId) {
        throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
      }
      const session = await schedulingRepo.findSession(app.db, sessionId);
      if (!session) {
        throw notFound('Class session not found');
      }
      if (session.teacherId !== account.teacherId) {
        throw Object.assign(new Error('无权操作该课次'), { statusCode: 403 });
      }
      return { account, session };
    }

    async function requireTeacherAccount(accountId: string) {
      const account = await accountsRepo.findById(app.db, accountId);
      if (!account?.teacherId) {
        throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
      }
      return account;
    }

    async function loadTeacherClassOptions(input: {
      accountId: string;
      studentId: string;
      courseId?: string;
    }) {
      const account = await requireTeacherAccount(input.accountId);
      const [student, allClasses, courses, classrooms, lessonAccounts] = await Promise.all([
        peopleRepo.requireStudent(app.db, input.studentId),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listClassrooms(app.db),
        app.db
          .select()
          .from(schema.lessonAccounts)
          .where(eq(schema.lessonAccounts.studentId, input.studentId)),
      ]);

      const lessonCourseIds = new Set(lessonAccounts.map((item) => item.courseId));
      const targetCourseIds = input.courseId ? new Set([input.courseId]) : lessonCourseIds;
      if (input.courseId && !lessonCourseIds.has(input.courseId)) {
        throw Object.assign(new Error('该学员暂无此课程的正式课时档案'), { statusCode: 422 });
      }

      const myClasses = allClasses.filter(
        (classGroup) =>
          classGroup.teacherId === account.teacherId &&
          targetCourseIds.has(classGroup.courseId) &&
          ['recruiting', 'active'].includes(classGroup.status),
      );
      const enrollmentsByClassId = new Map<
        string,
        Awaited<ReturnType<typeof schedulingRepo.listEnrollments>>
      >();
      for (const classGroup of myClasses) {
        enrollmentsByClassId.set(
          classGroup.id,
          await schedulingRepo.listEnrollments(app.db, classGroup.id),
        );
      }
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
      return {
        account,
        student,
        lessonAccounts: lessonAccounts.map((item) => ({
          ...item,
          course: courseById.get(item.courseId) ?? null,
        })),
        classes: myClasses.map((classGroup) => {
          const enrollments = enrollmentsByClassId.get(classGroup.id) ?? [];
          const enrolledCount = enrollments.length;
          const alreadyEnrolled = enrollments.some(
            (enrollment) => enrollment.studentId === input.studentId,
          );
          const capacityReached = enrolledCount >= classGroup.capacity;
          return {
            ...classGroup,
            course: courseById.get(classGroup.courseId) ?? null,
            classroom: classroomById.get(classGroup.classroomId) ?? null,
            enrolledCount,
            remainingSeats: Math.max(classGroup.capacity - enrolledCount, 0),
            alreadyEnrolled,
            canEnroll: !alreadyEnrolled && !capacityReached,
            disabledReason: alreadyEnrolled ? '已在班' : capacityReached ? '已满' : '',
          };
        }),
      };
    }

    async function loadTeacherHomeworkScope(accountId: string) {
      const account = await accountsRepo.findById(app.db, accountId);
      if (!account?.teacherId) {
        throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
      }

      const [classes, courses, students, sessions, teachers] = await Promise.all([
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        peopleRepo.listStudents(app.db),
        schedulingRepo.listClassSessions(app.db),
        teachingRepo.listTeachers(app.db),
      ]);
      const myClasses = classes.filter((classGroup) => classGroup.teacherId === account.teacherId);
      const myClassIds = new Set(myClasses.map((classGroup) => classGroup.id));
      const mySessionIds = sessions
        .filter((session) => myClassIds.has(session.classId))
        .map((session) => session.id);
      const temporaryStudents = await schedulingRepo.listTemporaryStudentsForSessions(
        app.db,
        mySessionIds,
      );
      const enrollments = (
        await Promise.all(
          myClasses.map((classGroup) => schedulingRepo.listEnrollments(app.db, classGroup.id)),
        )
      ).flat();
      const studentIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
      for (const temporaryStudent of temporaryStudents) {
        studentIds.add(temporaryStudent.studentId);
      }
      const courseIds = new Set(myClasses.map((classGroup) => classGroup.courseId));
      const classIds = new Set(myClasses.map((classGroup) => classGroup.id));
      const classByStudentCourse = new Map<string, typeof schema.classes.$inferSelect>();

      for (const classGroup of myClasses) {
        const classEnrollments = enrollments.filter(
          (enrollment) => enrollment.classId === classGroup.id,
        );
        for (const enrollment of classEnrollments) {
          classByStudentCourse.set(`${enrollment.studentId}:${classGroup.courseId}`, classGroup);
        }
      }
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      for (const temporaryStudent of temporaryStudents) {
        const session = sessionById.get(temporaryStudent.classSessionId);
        const classGroup = session ? classById.get(session.classId) : null;
        if (classGroup) {
          classByStudentCourse.set(
            `${temporaryStudent.studentId}:${classGroup.courseId}`,
            classGroup,
          );
        }
      }

      return {
        account,
        teacherId: account.teacherId,
        studentIds,
        courseIds,
        classIds,
        classByStudentCourse,
        classById,
        courseById: new Map(courses.map((course) => [course.id, course])),
        studentById: new Map(students.map((student) => [student.id, student])),
        sessionById,
        teacherById: new Map(teachers.map((teacher) => [teacher.id, teacher])),
      };
    }

    type TeacherHomeworkScope = Awaited<ReturnType<typeof loadTeacherHomeworkScope>>;

    async function notifyLearningSafely(
      input: Parameters<LearningNotificationService['notifyStudent']>[0],
    ) {
      try {
        await learningNotifications.notifyStudent(input);
      } catch (error) {
        app.log.warn(
          { err: error, sourceEventName: input.sourceEventName },
          'learning notification failed',
        );
      }
    }

    function studentName(scope: TeacherHomeworkScope, studentId: string) {
      return scope.studentById.get(studentId)?.name || '孩子';
    }

    function classCourseLabel(
      scope: TeacherHomeworkScope,
      classId?: string | null,
      courseId?: string | null,
    ) {
      const className = classId ? scope.classById.get(classId)?.name : '';
      const courseName = courseId ? scope.courseById.get(courseId)?.name : '';
      return [courseName, className].filter(Boolean).join(' · ') || '活动';
    }

    function canAccessHomework(
      scope: TeacherHomeworkScope,
      item: typeof schema.homeworkCheckIns.$inferSelect,
    ) {
      if (!scope.studentIds.has(item.studentId)) {
        return false;
      }
      if (item.classSessionId) {
        const session = scope.sessionById.get(item.classSessionId);
        if (!session || !scope.classIds.has(session.classId)) {
          return false;
        }
      }
      return !item.courseId || scope.courseIds.has(item.courseId);
    }

    function enrichTeacherHomework(
      scope: TeacherHomeworkScope,
      items: (typeof schema.homeworkCheckIns.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = item.classSessionId
          ? (scope.sessionById.get(item.classSessionId) ?? null)
          : null;
        const classGroup = session
          ? (scope.classById.get(session.classId) ?? null)
          : item.courseId
            ? (scope.classByStudentCourse.get(`${item.studentId}:${item.courseId}`) ?? null)
            : null;
        const reviewer = item.reviewedByTeacherId
          ? (scope.teacherById.get(item.reviewedByTeacherId) ?? null)
          : null;
        return {
          ...item,
          student: scope.studentById.get(item.studentId)
            ? {
                id: item.studentId,
                name: scope.studentById.get(item.studentId)!.name,
                grade: scope.studentById.get(item.studentId)!.grade,
              }
            : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          reviewer: reviewer ? { id: reviewer.id, name: reviewer.name } : null,
        };
      });
    }

    function canAccessLessonFeedback(
      scope: TeacherHomeworkScope,
      item: typeof schema.lessonFeedbacks.$inferSelect,
    ) {
      if (!scope.studentIds.has(item.studentId)) {
        return false;
      }
      const session = scope.sessionById.get(item.classSessionId);
      return Boolean(session && scope.classIds.has(session.classId));
    }

    function enrichTeacherLessonFeedbacks(
      scope: TeacherHomeworkScope,
      items: (typeof schema.lessonFeedbacks.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = scope.sessionById.get(item.classSessionId) ?? null;
        const classGroup = session ? (scope.classById.get(session.classId) ?? null) : null;
        const teacher = item.teacherId ? (scope.teacherById.get(item.teacherId) ?? null) : null;
        return {
          ...item,
          student: scope.studentById.get(item.studentId)
            ? {
                id: item.studentId,
                name: scope.studentById.get(item.studentId)!.name,
                grade: scope.studentById.get(item.studentId)!.grade,
              }
            : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        };
      });
    }

    function enrichTeacherHomeworkAssignments(
      scope: TeacherHomeworkScope,
      items: (typeof schema.homeworkAssignments.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = scope.sessionById.get(item.classSessionId) ?? null;
        const classGroup = scope.classById.get(item.classId) ?? null;
        const teacher = item.teacherId ? (scope.teacherById.get(item.teacherId) ?? null) : null;
        return {
          ...item,
          student: item.studentId
            ? scope.studentById.get(item.studentId)
              ? {
                  id: item.studentId,
                  name: scope.studentById.get(item.studentId)!.name,
                  grade: scope.studentById.get(item.studentId)!.grade,
                }
              : null
            : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        };
      });
    }

    function canAccessStudentWork(
      scope: TeacherHomeworkScope,
      item: typeof schema.studentWorks.$inferSelect,
    ) {
      if (!item.studentId) {
        return false;
      }
      if (!scope.studentIds.has(item.studentId)) {
        return false;
      }
      if (item.classSessionId) {
        const session = scope.sessionById.get(item.classSessionId);
        return Boolean(session && scope.classIds.has(session.classId));
      }
      if (item.classId) {
        return scope.classIds.has(item.classId);
      }
      return !item.courseId || scope.courseIds.has(item.courseId);
    }

    function enrichTeacherStudentWorks(
      scope: TeacherHomeworkScope,
      items: (typeof schema.studentWorks.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = item.classSessionId
          ? (scope.sessionById.get(item.classSessionId) ?? null)
          : null;
        const classGroup =
          (item.classId ? (scope.classById.get(item.classId) ?? null) : null) ??
          (session ? (scope.classById.get(session.classId) ?? null) : null) ??
          (item.studentId && item.courseId
            ? (scope.classByStudentCourse.get(`${item.studentId}:${item.courseId}`) ?? null)
            : null);
        const teacher =
          (item.teacherId ? (scope.teacherById.get(item.teacherId) ?? null) : null) ??
          (classGroup?.teacherId ? (scope.teacherById.get(classGroup.teacherId) ?? null) : null);
        return {
          ...item,
          student:
            item.studentId && scope.studentById.get(item.studentId)
              ? {
                  id: item.studentId,
                  name: scope.studentById.get(item.studentId)!.name,
                  grade: scope.studentById.get(item.studentId)!.grade,
                }
              : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        };
      });
    }

    app.get(
      '/public/teacher/sessions/:sessionId/attendance',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { session } = await requireOwnedSession(request.account!.id, sessionId);
        const [classGroup, attendanceRecords, allStudents, rosterEntries] = await Promise.all([
          schedulingRepo.findClass(app.db, session.classId),
          attendanceRepo.listAttendanceForSession(app.db, sessionId),
          peopleRepo.listStudents(app.db),
          schedulingRepo.listSessionRoster(app.db, sessionId),
        ]);
        const studentById = new Map(allStudents.map((s) => [s.id, s]));
        const roster = rosterEntries
          .map((entry) => studentById.get(entry.studentId))
          .filter(Boolean)
          .map((student) => ({
            id: student!.id,
            name: student!.name,
            grade: student!.grade,
          }));
        return {
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          roster,
          attendanceRecords,
        };
      },
    );

    app.post(
      '/public/teacher/sessions/:sessionId/attendance',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { session } = await requireOwnedSession(request.account!.id, sessionId);
        const classGroup = await schedulingRepo.findClass(app.db, session.classId);
        if (!classGroup) {
          throw notFound('Class not found');
        }
        const body = teacherAttendanceSchema.parse(request.body);
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const billingCourseMap = billingCourseByStudentId(rosterEntries);
        const rosterStudentIds = new Set(rosterEntries.map((entry) => entry.studentId));
        const invalidRecord = body.records.find(
          (record) => !rosterStudentIds.has(record.studentId),
        );
        if (invalidRecord) {
          throw Object.assign(new Error('只能为本班学员点名'), { statusCode: 400 });
        }
        const existingRecords = await attendanceRepo.listAttendanceForSession(app.db, sessionId);
        const existingStudentIds = new Set(existingRecords.map((record) => record.studentId));
        const attendanceRecords = await attendanceRepo.recordAttendance(app.db, {
          sessionId,
          courseId: classGroup.courseId,
          records: body.records.map((record) => ({
            ...record,
            courseId: billingCourseMap.get(record.studentId),
          })),
        });
        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
          billingCourseIdByStudentId: billingCourseMap,
        });
        return { attendanceRecords };
      },
    );

    app.get(
      '/public/teacher/lesson-feedbacks',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const studentIds = Array.from(scope.studentIds);
        if (studentIds.length === 0) {
          return { lessonFeedbacks: [] };
        }

        const items = await app.db
          .select()
          .from(schema.lessonFeedbacks)
          .where(inArray(schema.lessonFeedbacks.studentId, studentIds))
          .orderBy(desc(schema.lessonFeedbacks.createdAt));

        return {
          lessonFeedbacks: enrichTeacherLessonFeedbacks(
            scope,
            items.filter((item) => canAccessLessonFeedback(scope, item)),
          ),
        };
      },
    );

    app.post(
      '/public/teacher/sessions/:sessionId/feedbacks',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { account, session } = await requireOwnedSession(request.account!.id, sessionId);
        const classGroup = await schedulingRepo.findClass(app.db, session.classId);
        if (!classGroup) {
          throw notFound('Class not found');
        }

        const body = teacherLessonFeedbackSchema.parse(request.body);
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const rosterStudentIds = new Set(rosterEntries.map((entry) => entry.studentId));
        const invalidItem = [...body.items, ...body.studentAssignments].find(
          (item) => !rosterStudentIds.has(item.studentId),
        );
        if (invalidItem) {
          throw Object.assign(new Error('只能操作本班正式学员'), { statusCode: 400 });
        }

        const updatedItems = [];
        for (const item of body.items) {
          const [updated] = await app.db
            .insert(schema.lessonFeedbacks)
            .values({
              classSessionId: sessionId,
              studentId: item.studentId,
              teacherId: account.teacherId,
              courseId: classGroup.courseId,
              classId: classGroup.id,
              content: item.content,
              rating: item.rating,
              imageUrls: item.imageUrls,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.lessonFeedbacks.classSessionId, schema.lessonFeedbacks.studentId],
              set: {
                teacherId: account.teacherId,
                courseId: classGroup.courseId,
                classId: classGroup.id,
                content: item.content,
                rating: item.rating,
                imageUrls: item.imageUrls,
                updatedAt: new Date(),
              },
            })
            .returning();
          updatedItems.push(updated);
        }

        if (body.classAssignmentContent) {
          await app.db
            .insert(schema.homeworkAssignments)
            .values({
              classSessionId: sessionId,
              classId: classGroup.id,
              courseId: classGroup.courseId,
              teacherId: account.teacherId,
              studentId: null,
              content: body.classAssignmentContent,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.homeworkAssignments.classSessionId],
              targetWhere: isNull(schema.homeworkAssignments.studentId),
              set: {
                courseId: classGroup.courseId,
                classId: classGroup.id,
                teacherId: account.teacherId,
                content: body.classAssignmentContent,
                updatedAt: new Date(),
              },
            });
        } else {
          await app.db
            .delete(schema.homeworkAssignments)
            .where(
              and(
                eq(schema.homeworkAssignments.classSessionId, sessionId),
                isNull(schema.homeworkAssignments.studentId),
              ),
            );
        }

        for (const assignment of body.studentAssignments) {
          if (assignment.content) {
            await app.db
              .insert(schema.homeworkAssignments)
              .values({
                classSessionId: sessionId,
                classId: classGroup.id,
                courseId: classGroup.courseId,
                teacherId: account.teacherId,
                studentId: assignment.studentId,
                content: assignment.content,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [
                  schema.homeworkAssignments.classSessionId,
                  schema.homeworkAssignments.studentId,
                ],
                set: {
                  courseId: classGroup.courseId,
                  classId: classGroup.id,
                  teacherId: account.teacherId,
                  content: assignment.content,
                  updatedAt: new Date(),
                },
              });
          } else {
            await app.db
              .delete(schema.homeworkAssignments)
              .where(
                and(
                  eq(schema.homeworkAssignments.classSessionId, sessionId),
                  eq(schema.homeworkAssignments.studentId, assignment.studentId),
                ),
              );
          }
        }

        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const assignments = await app.db
          .select()
          .from(schema.homeworkAssignments)
          .where(eq(schema.homeworkAssignments.classSessionId, sessionId))
          .orderBy(desc(schema.homeworkAssignments.updatedAt));
        const notificationStamp = Date.now();
        const lessonLabel = classCourseLabel(scope, classGroup.id, classGroup.courseId);
        await Promise.all([
          ...updatedItems.map((item) => {
            const ratingText = item.rating > 0 ? `，获得 ${item.rating} 星` : '';
            return notifyLearningSafely({
              studentId: item.studentId,
              studentName: studentName(scope, item.studentId),
              title: '课堂互动已更新',
              body: compactText(
                item.content ||
                  `${studentName(scope, item.studentId)} 的课堂表现已更新${ratingText}`,
                '课堂表现已更新',
              ),
              updateType: '课堂互动',
              page: '/pages/account-interactions/index',
              sourceEventName: 'learning.feedback',
              dedupeKey: `learning.feedback:${sessionId}:${item.studentId}:${notificationStamp}`,
              meta: {
                sessionId,
                studentId: item.studentId,
                courseId: classGroup.courseId,
                classId: classGroup.id,
              },
            });
          }),
          ...(body.classAssignmentContent
            ? rosterEntries.map((entry) =>
                notifyLearningSafely({
                  studentId: entry.studentId,
                  studentName: studentName(scope, entry.studentId),
                  title: '活动任务已布置',
                  body: compactText(body.classAssignmentContent, '有新的活动任务'),
                  updateType: '任务布置',
                  page: '/pages/account-homework/index',
                  sourceEventName: 'homework.assignment',
                  dedupeKey:
                    `homework.assignment:${sessionId}:class:` +
                    `${entry.studentId}:${notificationStamp}`,
                  meta: {
                    sessionId,
                    studentId: entry.studentId,
                    courseId: classGroup.courseId,
                    classId: classGroup.id,
                    scope: 'class',
                  },
                }),
              )
            : []),
          ...body.studentAssignments
            .filter((assignment) => assignment.content)
            .map((assignment) =>
              notifyLearningSafely({
                studentId: assignment.studentId,
                studentName: studentName(scope, assignment.studentId),
                title: '个人任务已布置',
                body: compactText(assignment.content, `${lessonLabel} 有新的个人任务`),
                updateType: '任务布置',
                page: '/pages/account-homework/index',
                sourceEventName: 'homework.assignment',
                dedupeKey: `homework.assignment:${sessionId}:${assignment.studentId}:${notificationStamp}`,
                meta: {
                  sessionId,
                  studentId: assignment.studentId,
                  courseId: classGroup.courseId,
                  classId: classGroup.id,
                  scope: 'student',
                },
              }),
            ),
        ]);
        return {
          lessonFeedbacks: enrichTeacherLessonFeedbacks(scope, updatedItems),
          homeworkAssignments: enrichTeacherHomeworkAssignments(scope, assignments),
        };
      },
    );

    app.get(
      '/public/teacher/homework-assignments',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        if (scope.classIds.size === 0) {
          return { homeworkAssignments: [] };
        }
        const items = await app.db
          .select()
          .from(schema.homeworkAssignments)
          .where(inArray(schema.homeworkAssignments.classId, Array.from(scope.classIds)))
          .orderBy(desc(schema.homeworkAssignments.createdAt));
        return { homeworkAssignments: enrichTeacherHomeworkAssignments(scope, items) };
      },
    );

    app.get(
      '/public/teacher/student-works',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const studentIds = Array.from(scope.studentIds);
        if (studentIds.length === 0) {
          return { studentWorks: [] };
        }
        const items = await app.db
          .select()
          .from(schema.studentWorks)
          .where(inArray(schema.studentWorks.studentId, studentIds))
          .orderBy(desc(schema.studentWorks.createdAt));
        return {
          studentWorks: enrichTeacherStudentWorks(
            scope,
            items.filter((item) => canAccessStudentWork(scope, item)),
          ),
        };
      },
    );

    app.post(
      '/public/teacher/student-works',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const body = teacherStudentWorkSchema.parse(request.body);
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        if (!scope.studentIds.has(body.studentId)) {
          throw Object.assign(new Error('无权操作该成员'), { statusCode: 403 });
        }

        let courseId = body.courseId ?? null;
        let classId = body.classId ?? null;
        let teacherId = scope.teacherId ?? null;

        if (body.classSessionId) {
          const session = scope.sessionById.get(body.classSessionId);
          if (!session || !scope.classIds.has(session.classId)) {
            throw Object.assign(new Error('无权操作该安排'), { statusCode: 403 });
          }
          const classGroup = scope.classById.get(session.classId);
          if (!classGroup) {
            throw notFound('Class not found');
          }
          classId = classGroup.id;
          courseId = classGroup.courseId;
          teacherId = session.teacherId ?? classGroup.teacherId ?? teacherId;
        } else if (classId) {
          const classGroup = scope.classById.get(classId);
          if (!classGroup || !scope.classIds.has(classId)) {
            throw Object.assign(new Error('无权操作该活动组'), { statusCode: 403 });
          }
          courseId = classGroup.courseId;
          teacherId = classGroup.teacherId ?? teacherId;
        } else if (courseId && !scope.courseIds.has(courseId)) {
          throw Object.assign(new Error('无权操作该活动'), { statusCode: 403 });
        } else if (!courseId) {
          const firstClass = Array.from(scope.classByStudentCourse.entries()).find(([key]) =>
            key.startsWith(`${body.studentId}:`),
          )?.[1];
          courseId = firstClass?.courseId ?? null;
          classId = firstClass?.id ?? null;
        }

        const candidate = {
          id: '',
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
          source: 'teacher',
          status: 'published',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (!canAccessStudentWork(scope, candidate)) {
          throw Object.assign(new Error('无权发布该作品'), { statusCode: 403 });
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
            source: 'teacher',
          })
          .returning();

        await notifyLearningSafely({
          studentId: item.studentId!,
          studentName: studentName(scope, item.studentId!),
          title: '作品已发布',
          body: compactText(
            `${studentName(scope, item.studentId!)} 的作品「${item.title || '作品展示'}」已发布`,
            '作品已发布',
          ),
          updateType: '作品展示',
          page: '/pages/account-gallery/index',
          level: 'success',
          sourceEventName: 'student.work.published',
          dedupeKey: `student.work.published:${item.id}`,
          meta: {
            studentWorkId: item.id,
            studentId: item.studentId,
            courseId: item.courseId,
            classId: item.classId,
          },
        });

        return {
          studentWork: enrichTeacherStudentWorks(scope, [item])[0],
          message: '作品已发布',
        };
      },
    );

    app.post(
      '/public/teacher/upload-token',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const body = teacherUploadTokenSchema.parse(request.body);
        const qiniu = new QiniuSettingsService(app.db, app.appEnv);
        return qiniu.createUploadToken({ filename: body.filename, prefix: 'teacher-works' });
      },
    );

    app.get(
      '/public/teacher/homework-check-ins',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const studentIds = Array.from(scope.studentIds);
        if (studentIds.length === 0) {
          return { homeworkCheckIns: [] };
        }

        const items = await app.db
          .select()
          .from(schema.homeworkCheckIns)
          .where(inArray(schema.homeworkCheckIns.studentId, studentIds))
          .orderBy(desc(schema.homeworkCheckIns.createdAt));

        return {
          homeworkCheckIns: enrichTeacherHomework(
            scope,
            items.filter((item) => canAccessHomework(scope, item)),
          ),
        };
      },
    );

    app.post(
      '/public/teacher/homework-check-ins/:homeworkCheckInId/review',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { homeworkCheckInId } = request.params as { homeworkCheckInId: string };
        const body = teacherHomeworkReviewSchema.parse(request.body);
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const [item] = await app.db
          .select()
          .from(schema.homeworkCheckIns)
          .where(eq(schema.homeworkCheckIns.id, homeworkCheckInId))
          .limit(1);
        if (!item) {
          throw notFound('Homework check-in not found');
        }
        if (!canAccessHomework(scope, item)) {
          throw Object.assign(new Error('无权批阅该作业打卡'), { statusCode: 403 });
        }

        const [updated] = await app.db
          .update(schema.homeworkCheckIns)
          .set({
            reviewStatus: body.reviewStatus,
            teacherFeedback: body.teacherFeedback,
            rating: body.rating,
            reviewedByTeacherId: scope.teacherId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.homeworkCheckIns.id, homeworkCheckInId),
              inArray(schema.homeworkCheckIns.studentId, Array.from(scope.studentIds)),
            ),
          )
          .returning();
        if (!updated) {
          throw notFound('Homework check-in not found');
        }

        const reviewStatusText = body.reviewStatus === 'needs_revision' ? '需要订正' : '已批阅';
        const ratingText = body.rating > 0 ? `，${body.rating} 星` : '';
        await notifyLearningSafely({
          studentId: updated.studentId,
          studentName: studentName(scope, updated.studentId),
          title: '任务批阅已更新',
          body: compactText(
            body.teacherFeedback || `老师已批阅打卡，结果：${reviewStatusText}${ratingText}`,
            '任务批阅已更新',
          ),
          updateType: '任务批阅',
          page: '/pages/account-homework/index',
          sourceEventName: 'homework.review',
          dedupeKey: `homework.review:${homeworkCheckInId}:${updated.updatedAt.getTime()}`,
          meta: {
            homeworkCheckInId,
            studentId: updated.studentId,
            courseId: updated.courseId,
            classSessionId: updated.classSessionId,
            reviewStatus: updated.reviewStatus,
          },
        });

        return { homeworkCheckIn: enrichTeacherHomework(scope, [updated])[0] };
      },
    );

    app.get('/v1/teachers', { preHandler: app.requireAdmin }, async () => {
      const teachers = await teachingRepo.listTeachers(app.db);
      return { teachers: teachers.map(toTeacherDto) };
    });

    // When a teacher resource carries a phone number, provision a teacher login
    // account: password = last 6 of the phone, forced change on first login.
    // Idempotent — skips when the teacher already has an account; refuses (with a
    // warning, not a hard error) when the phone already belongs to someone else.
    async function ensureTeacherAccount(teacher: typeof schema.teachers.$inferSelect): Promise<{
      accountCreated: boolean;
      defaultPassword?: string;
      accountWarning?: string;
    }> {
      const phone = teacher.phone?.trim();
      const password = defaultPasswordFromPhone(phone);
      if (!phone || !password) {
        return { accountCreated: false };
      }
      if (await accountsRepo.findByTeacherId(app.db, teacher.id)) {
        return { accountCreated: false };
      }
      if (await accountsRepo.findByPhone(app.db, phone)) {
        return {
          accountCreated: false,
          accountWarning: '该手机号已被其他账号占用，未自动创建老师账号',
        };
      }
      try {
        await accountsRepo.createAccount(app.db, {
          role: 'teacher',
          phone,
          displayName: teacher.name,
          passwordHash: hashPassword(password),
          teacherId: teacher.id,
          mustChangePassword: true,
        });
        return { accountCreated: true, defaultPassword: password };
      } catch (error) {
        app.log.error(
          { err: error, teacherId: teacher.id },
          'failed to auto-create teacher account',
        );
        return {
          accountCreated: false,
          accountWarning: '自动创建老师账号失败，请在账号管理中手动创建',
        };
      }
    }

    app.post('/v1/teachers', { preHandler: app.requireAdmin }, async (request) => {
      const body = teacherSchema.parse(request.body);
      const teacher = await teachingRepo.createTeacher(app.db, normalizeTeacherBody(body));
      const account = await ensureTeacherAccount(teacher);
      return { teacher: toTeacherDto(teacher), ...account };
    });

    app.patch('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const body = teacherUpdateSchema.parse(request.body);
      const teacher = await teachingRepo.updateTeacher(
        app.db,
        teacherId,
        normalizeTeacherBody(body),
      );
      if (!teacher) throw notFound('Teacher not found');
      const account = await ensureTeacherAccount(teacher);
      return { teacher: toTeacherDto(teacher), ...account };
    });

    app.delete('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const teacher = await teachingRepo.deleteTeacher(app.db, teacherId);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher: toTeacherDto(teacher) };
    });

    app.get('/v1/institutions', { preHandler: app.requireAdmin }, async () => {
      return { institutions: await teachingRepo.listInstitutions(app.db) };
    });

    app.post('/v1/institutions', { preHandler: app.requireAdmin }, async (request) => {
      const body = institutionSchema.parse(request.body);
      const existing = await teachingRepo.listInstitutions(app.db);
      const institution = await teachingRepo.createInstitution(app.db, {
        ...body,
        sortOrder: body.sortOrder ?? existing.length * 10,
      });
      return { institution };
    });

    app.patch('/v1/institutions/order', { preHandler: app.requireAdmin }, async (request) => {
      const body = institutionOrderSchema.parse(request.body);
      const institutions = await teachingRepo.reorderInstitutions(app.db, body.ids);
      return { institutions };
    });

    app.patch(
      '/v1/institutions/:institutionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { institutionId } = request.params as { institutionId: string };
        const body = institutionUpdateSchema.parse(request.body);
        const institution = await teachingRepo.updateInstitution(app.db, institutionId, body);
        if (!institution) throw notFound('Institution not found');
        return { institution };
      },
    );

    app.delete(
      '/v1/institutions/:institutionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { institutionId } = request.params as { institutionId: string };
        const institution = await teachingRepo.deleteInstitution(app.db, institutionId);
        if (!institution) throw notFound('Institution not found');
        return { institution };
      },
    );

    app.get('/v1/classrooms', { preHandler: app.requireAdmin }, async () => {
      return { classrooms: await teachingRepo.listClassrooms(app.db) };
    });

    app.post('/v1/classrooms', { preHandler: app.requireAdmin }, async (request) => {
      const body = classroomSchema.parse(request.body);
      const classroom = await teachingRepo.createClassroom(app.db, body);
      return { classroom };
    });

    app.patch('/v1/classrooms/:classroomId', { preHandler: app.requireAdmin }, async (request) => {
      const { classroomId } = request.params as { classroomId: string };
      const body = classroomUpdateSchema.parse(request.body);
      const classroom = await teachingRepo.updateClassroom(app.db, classroomId, body);
      if (!classroom) throw notFound('Classroom not found');
      return { classroom };
    });

    app.delete('/v1/classrooms/:classroomId', { preHandler: app.requireAdmin }, async (request) => {
      const { classroomId } = request.params as { classroomId: string };
      const classroom = await teachingRepo.deleteClassroom(app.db, classroomId);
      if (!classroom) throw notFound('Classroom not found');
      return { classroom };
    });
  },
};
