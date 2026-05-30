import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as peopleRepo from '../../db/repositories/people.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

const classSchema = z.object({
  campusId: z.string(),
  courseId: z.string(),
  teacherId: z.string(),
  classroomId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z
    .enum(['recruiting', 'active', 'completed', 'paused', 'archived'])
    .default('recruiting'),
});

const classUpdateSchema = classSchema.partial();

const sessionSchema = z.object({
  classId: z.string(),
  teacherId: z.string(),
  classroomId: z.string(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  topic: z.string().min(1),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
});

const sessionCreateSchema = sessionSchema.omit({ status: true });
const sessionUpdateSchema = sessionSchema.partial();

const enrollmentSchema = z.object({
  studentId: z.string(),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function conflict(message = 'Classroom or teacher time conflict'): Error {
  return Object.assign(new Error(message), { statusCode: 409 });
}

export const schedulingModule: AppModule = {
  name: 'scheduling',
  async register(app) {
    app.get('/v1/tenants/:tenantId/classes', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);

      const [classes, courses, teachers, classrooms] = await Promise.all([
        schedulingRepo.listClasses(app.db, tenantId),
        catalogRepo.listCourses(app.db, tenantId),
        teachingRepo.listTeachers(app.db, tenantId),
        teachingRepo.listClassrooms(app.db, tenantId),
      ]);
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const teacherById = new Map(teachers.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));

      const enriched = await Promise.all(
        classes.map(async (item) => ({
          ...item,
          course: courseById.get(item.courseId),
          teacher: teacherById.get(item.teacherId),
          classroom: classroomById.get(item.classroomId),
          enrolledCount: await schedulingRepo.countActiveEnrollments(app.db, item.id),
        })),
      );

      return { classes: enriched };
    });

    app.post('/v1/tenants/:tenantId/classes', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      const body = classSchema.parse(request.body);
      const classGroup = await schedulingRepo.createClass(app.db, { tenantId, ...body });
      return { class: classGroup };
    });

    app.patch(
      '/v1/tenants/:tenantId/classes/:classId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classId } = request.params as { tenantId: string; classId: string };
        await requireTenant(app.db, tenantId);
        const body = classUpdateSchema.parse(request.body);
        const classGroup = await schedulingRepo.updateClass(app.db, tenantId, classId, body);
        if (!classGroup) throw notFound('Class not found');
        return { class: classGroup };
      },
    );

    app.delete(
      '/v1/tenants/:tenantId/classes/:classId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classId } = request.params as { tenantId: string; classId: string };
        await requireTenant(app.db, tenantId);
        const classGroup = await schedulingRepo.archiveClass(app.db, tenantId, classId);
        if (!classGroup) throw notFound('Class not found');
        return { class: classGroup };
      },
    );

    app.get(
      '/v1/tenants/:tenantId/class-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);

        const [sessions, classes, teachers, classrooms] = await Promise.all([
          schedulingRepo.listClassSessions(app.db, tenantId),
          schedulingRepo.listClasses(app.db, tenantId),
          teachingRepo.listTeachers(app.db, tenantId),
          teachingRepo.listClassrooms(app.db, tenantId),
        ]);
        const classById = new Map(classes.map((item) => [item.id, item]));
        const teacherById = new Map(teachers.map((item) => [item.id, item]));
        const classroomById = new Map(classrooms.map((item) => [item.id, item]));

        return {
          classSessions: sessions.map((session) => ({
            ...session,
            class: classById.get(session.classId),
            teacher: teacherById.get(session.teacherId),
            classroom: classroomById.get(session.classroomId),
          })),
        };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/class-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = sessionCreateSchema.parse(request.body);

        const startsAt = new Date(body.startsAt);
        const endsAt = new Date(body.endsAt);

        const conflict = await schedulingRepo.findScheduleConflict(app.db, {
          tenantId,
          startsAt,
          endsAt,
          classroomId: body.classroomId,
          teacherId: body.teacherId,
        });
        if (conflict) {
          throw Object.assign(new Error('Classroom or teacher time conflict'), { statusCode: 409 });
        }

        const classSession = await schedulingRepo.createClassSession(app.db, {
          tenantId,
          classId: body.classId,
          teacherId: body.teacherId,
          classroomId: body.classroomId,
          topic: body.topic,
          startsAt,
          endsAt,
          status: 'scheduled',
        });
        return { classSession };
      },
    );

    app.patch(
      '/v1/tenants/:tenantId/class-sessions/:sessionId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, sessionId } = request.params as {
          tenantId: string;
          sessionId: string;
        };
        await requireTenant(app.db, tenantId);
        const current = await schedulingRepo.findSession(app.db, tenantId, sessionId);
        if (!current) throw notFound('Class session not found');
        const body = sessionUpdateSchema.parse(request.body);

        const startsAt = body.startsAt ? new Date(body.startsAt) : current.startsAt;
        const endsAt = body.endsAt ? new Date(body.endsAt) : current.endsAt;
        const classroomId = body.classroomId ?? current.classroomId;
        const teacherId = body.teacherId ?? current.teacherId;
        const nextStatus = body.status ?? current.status;

        if (nextStatus !== 'cancelled') {
          const overlap = await schedulingRepo.findScheduleConflict(app.db, {
            tenantId,
            startsAt,
            endsAt,
            classroomId,
            teacherId,
            ignoreSessionId: sessionId,
          });
          if (overlap) throw conflict();
        }

        const classSession = await schedulingRepo.updateClassSession(app.db, tenantId, sessionId, {
          ...body,
          startsAt,
          endsAt,
          classroomId,
          teacherId,
          status: nextStatus,
        });
        if (!classSession) throw notFound('Class session not found');
        return { classSession };
      },
    );

    app.delete(
      '/v1/tenants/:tenantId/class-sessions/:sessionId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, sessionId } = request.params as {
          tenantId: string;
          sessionId: string;
        };
        await requireTenant(app.db, tenantId);
        const classSession = await schedulingRepo.cancelClassSession(app.db, tenantId, sessionId);
        if (!classSession) throw notFound('Class session not found');
        return { classSession };
      },
    );

    app.get(
      '/v1/tenants/:tenantId/classes/:classId/enrollments',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classId } = request.params as { tenantId: string; classId: string };
        await requireTenant(app.db, tenantId);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup || classGroup.tenantId !== tenantId) throw notFound('Class not found');
        const [enrollments, students] = await Promise.all([
          schedulingRepo.listEnrollments(app.db, tenantId, classId),
          peopleRepo.listStudents(app.db, tenantId),
        ]);
        const studentById = new Map(students.map((student) => [student.id, student]));
        return {
          enrollments: enrollments.map((enrollment) => ({
            ...enrollment,
            student: studentById.get(enrollment.studentId),
          })),
        };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/classes/:classId/enrollments',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classId } = request.params as { tenantId: string; classId: string };
        await requireTenant(app.db, tenantId);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup || classGroup.tenantId !== tenantId) throw notFound('Class not found');
        const body = enrollmentSchema.parse(request.body);
        await peopleRepo.requireStudent(app.db, tenantId, body.studentId);

        const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classId);
        if (enrolledCount >= classGroup.capacity) {
          throw conflict('Class capacity reached');
        }

        const enrollment = await schedulingRepo.createEnrollment(app.db, {
          tenantId,
          classId,
          studentId: body.studentId,
          active: true,
        });
        return { enrollment };
      },
    );

    app.delete(
      '/v1/tenants/:tenantId/classes/:classId/enrollments/:enrollmentId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classId, enrollmentId } = request.params as {
          tenantId: string;
          classId: string;
          enrollmentId: string;
        };
        await requireTenant(app.db, tenantId);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup || classGroup.tenantId !== tenantId) throw notFound('Class not found');
        const enrollment = await schedulingRepo.removeEnrollment(
          app.db,
          tenantId,
          classId,
          enrollmentId,
        );
        if (!enrollment) throw notFound('Enrollment not found');
        return { enrollment };
      },
    );
  },
};
