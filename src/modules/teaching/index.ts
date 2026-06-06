import { z } from 'zod';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import { hashPassword, defaultPasswordFromPhone } from '../../lib/password.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
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
  teachingPhilosophy: z.string().default(''),
  classPhotoUrls: z.array(z.string().min(1).max(500)).max(24).default([]),
  studentWorkUrls: z.array(z.string().min(1).max(500)).max(24).default([]),
  parentTestimonials: z.array(z.string().min(1).max(240)).max(12).default([]),
  bio: z.string().default(''),
  specialties: z.array(z.string()).default([]),
  status: z.enum(['active', 'archived']).default('active'),
});

const teacherUpdateSchema = teacherSchema.partial();

const institutionSchema = z.object({
  name: z.string().min(1).max(160),
  logoUrl: z.string().max(500).optional(),
  intro: z.string().default(''),
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
      status: z.enum(['present', 'leave', 'absent', 'makeup', 'trial']),
      note: z.string().optional(),
    }),
  ),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export const teachingModule: AppModule = {
  name: 'teaching',
  async register(app) {
    const lessonNotifications = new LessonNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });

    app.get(
      '/public/teacher/dashboard',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const account = await accountsRepo.findById(app.db, request.account!.id);
        if (!account?.teacherId) {
          throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
        }

        const [sessions, classes, courses, classrooms, students] = await Promise.all([
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          catalogRepo.listCourses(app.db),
          teachingRepo.listClassrooms(app.db),
          peopleRepo.listStudents(app.db),
        ]);
        const classById = new Map(classes.map((item) => [item.id, item]));
        const courseById = new Map(courses.map((item) => [item.id, item]));
        const classroomById = new Map(classrooms.map((item) => [item.id, item]));
        const studentById = new Map(students.map((item) => [item.id, item]));
        const myClasses = classes.filter((item) => item.teacherId === account.teacherId);

        const classCards = await Promise.all(
          myClasses.map(async (classGroup) => {
            const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
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
                })),
            };
          }),
        );

        return {
          sessions: sessions
            .filter((session) => session.teacherId === account.teacherId)
            .map((session) => {
              const classGroup = classById.get(session.classId);
              return {
                ...session,
                class: classGroup ? { name: classGroup.name } : undefined,
                course: classGroup ? courseById.get(classGroup.courseId) : undefined,
                classroom: classroomById.get(session.classroomId),
              };
            }),
          classes: classCards,
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

    app.get(
      '/public/teacher/sessions/:sessionId/attendance',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { session } = await requireOwnedSession(request.account!.id, sessionId);
        const [classGroup, attendanceRecords, allStudents, enrollments] = await Promise.all([
          schedulingRepo.findClass(app.db, session.classId),
          attendanceRepo.listAttendanceForSession(app.db, sessionId),
          peopleRepo.listStudents(app.db),
          schedulingRepo.listEnrollments(app.db, session.classId),
        ]);
        const studentById = new Map(allStudents.map((s) => [s.id, s]));
        const roster = enrollments
          .map((enrollment) => studentById.get(enrollment.studentId))
          .filter(Boolean)
          .map((student) => ({ id: student!.id, name: student!.name, grade: student!.grade }));
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
        const enrollments = await schedulingRepo.listEnrollments(app.db, session.classId);
        const rosterStudentIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
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
          records: body.records,
        });
        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
        });
        return { attendanceRecords };
      },
    );

    app.get('/v1/teachers', { preHandler: app.requireAdmin }, async () => {
      return { teachers: await teachingRepo.listTeachers(app.db) };
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
      const teacher = await teachingRepo.createTeacher(app.db, body);
      const account = await ensureTeacherAccount(teacher);
      return { teacher, ...account };
    });

    app.patch('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const body = teacherUpdateSchema.parse(request.body);
      const teacher = await teachingRepo.updateTeacher(app.db, teacherId, body);
      if (!teacher) throw notFound('Teacher not found');
      const account = await ensureTeacherAccount(teacher);
      return { teacher, ...account };
    });

    app.delete('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const teacher = await teachingRepo.deleteTeacher(app.db, teacherId);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher };
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
