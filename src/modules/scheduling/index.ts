import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as peopleRepo from '../../db/repositories/people.js';
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
    app.get('/v1/classes', { preHandler: app.requireAdmin }, async () => {
      const [classes, courses, teachers, classrooms] = await Promise.all([
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listTeachers(app.db),
        teachingRepo.listClassrooms(app.db),
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

    app.post('/v1/classes', { preHandler: app.requireAdmin }, async (request) => {
      const body = classSchema.parse(request.body);
      const classGroup = await schedulingRepo.createClass(app.db, body);
      return { class: classGroup };
    });

    app.patch(
      '/v1/classes/:classId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const body = classUpdateSchema.parse(request.body);
        const classGroup = await schedulingRepo.updateClass(app.db, classId, body);
        if (!classGroup) throw notFound('Class not found');
        return { class: classGroup };
      },
    );

    app.delete(
      '/v1/classes/:classId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const classGroup = await schedulingRepo.deleteClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        return { class: classGroup };
      },
    );

    app.get(
      '/v1/class-sessions',
      { preHandler: app.requireAdmin },
      async () => {
        const [sessions, classes, teachers, classrooms] = await Promise.all([
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          teachingRepo.listTeachers(app.db),
          teachingRepo.listClassrooms(app.db),
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
      '/v1/class-sessions',
      { preHandler: app.requireAdmin },
      async (request) => {
        const body = sessionCreateSchema.parse(request.body);

        const startsAt = new Date(body.startsAt);
        const endsAt = new Date(body.endsAt);

        const conflict = await schedulingRepo.findScheduleConflict(app.db, {
          startsAt,
          endsAt,
          classroomId: body.classroomId,
          teacherId: body.teacherId,
        });
        if (conflict) {
          throw Object.assign(new Error('Classroom or teacher time conflict'), { statusCode: 409 });
        }

        const classSession = await schedulingRepo.createClassSession(app.db, {
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
      '/v1/class-sessions/:sessionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const current = await schedulingRepo.findSession(app.db, sessionId);
        if (!current) throw notFound('Class session not found');
        const body = sessionUpdateSchema.parse(request.body);

        const startsAt = body.startsAt ? new Date(body.startsAt) : current.startsAt;
        const endsAt = body.endsAt ? new Date(body.endsAt) : current.endsAt;
        const classroomId = body.classroomId ?? current.classroomId;
        const teacherId = body.teacherId ?? current.teacherId;
        const nextStatus = body.status ?? current.status;

        if (nextStatus !== 'cancelled') {
          const overlap = await schedulingRepo.findScheduleConflict(app.db, {
            startsAt,
            endsAt,
            classroomId,
            teacherId,
            ignoreSessionId: sessionId,
          });
          if (overlap) throw conflict();
        }

        const classSession = await schedulingRepo.updateClassSession(app.db, sessionId, {
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
      '/v1/class-sessions/:sessionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const classSession = await schedulingRepo.cancelClassSession(app.db, sessionId);
        if (!classSession) throw notFound('Class session not found');
        return { classSession };
      },
    );

    app.get(
      '/v1/classes/:classId/enrollments',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        const [enrollments, students] = await Promise.all([
          schedulingRepo.listEnrollments(app.db, classId),
          peopleRepo.listStudents(app.db),
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
      '/v1/classes/:classId/enrollments',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        const body = enrollmentSchema.parse(request.body);
        await peopleRepo.requireStudent(app.db, body.studentId);

        const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classId);
        if (enrolledCount >= classGroup.capacity) {
          throw conflict('Class capacity reached');
        }

        const enrollment = await schedulingRepo.createEnrollment(app.db, {
          classId,
          studentId: body.studentId,
          active: true,
        });
        return { enrollment };
      },
    );

    app.delete(
      '/v1/classes/:classId/enrollments/:enrollmentId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classId, enrollmentId } = request.params as {
          classId: string;
          enrollmentId: string;
        };
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        const enrollment = await schedulingRepo.removeEnrollment(
          app.db,
          classId,
          enrollmentId,
        );
        if (!enrollment) throw notFound('Enrollment not found');
        return { enrollment };
      },
    );
  },
};
