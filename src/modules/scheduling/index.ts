import { z } from 'zod';
import QRCode from 'qrcode';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as peopleRepo from '../../db/repositories/people.js';
import { resolvePublicWebBaseUrl } from '../../lib/public-url.js';
import type { AppModule } from '../types.js';

const classSchema = z.object({
  campusId: z.string(),
  courseId: z.string(),
  teacherId: z.string(),
  classroomId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z.enum(['recruiting', 'active', 'completed', 'paused', 'archived']).default('recruiting'),
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
const batchSessionSchema = z.object({
  classId: z.string(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['daily', 'weekly']).default('weekly'),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  topic: z.string().min(1),
  teacherId: z.string().optional(),
  classroomId: z.string().optional(),
  skipConflicts: z.boolean().default(true),
  timezoneOffsetMinutes: z.number().int().default(-480),
});
const calendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  classId: z.string().optional(),
  courseId: z.string().optional(),
  teacherId: z.string().optional(),
  classroomId: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

const enrollmentSchema = z.object({
  studentId: z.string(),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function conflict(message = 'Classroom or teacher time conflict'): Error {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function unprocessable(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const { year, month, day } = parseDateParts(dateKey);
  return formatDateKey(new Date(Date.UTC(year, month - 1, day + days)));
}

function dateKeyToUtcMs(dateKey: string) {
  const { year, month, day } = parseDateParts(dateKey);
  return Date.UTC(year, month - 1, day);
}

function localDateTimeToDate(dateKey: string, time: string, timezoneOffsetMinutes: number) {
  const { year, month, day } = parseDateParts(dateKey);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + timezoneOffsetMinutes * 60_000);
}

function dayOfWeek(dateKey: string) {
  const { year, month, day } = parseDateParts(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function datesForBatch(input: z.infer<typeof batchSessionSchema>) {
  if (dateKeyToUtcMs(input.endsOn) < dateKeyToUtcMs(input.startsOn)) {
    throw unprocessable('结束日期不能早于开始日期');
  }

  const selectedWeekdays =
    input.mode === 'daily'
      ? new Set([0, 1, 2, 3, 4, 5, 6])
      : new Set(input.weekdays.length > 0 ? input.weekdays : [dayOfWeek(input.startsOn)]);
  const dates: string[] = [];

  for (let dateKey = input.startsOn; dateKeyToUtcMs(dateKey) <= dateKeyToUtcMs(input.endsOn); ) {
    if (selectedWeekdays.has(dayOfWeek(dateKey))) {
      dates.push(dateKey);
    }
    dateKey = addDays(dateKey, 1);
  }

  if (dates.length > 120) {
    throw unprocessable('单次最多生成 120 节课次');
  }
  return dates;
}

function overlapsRange(session: { startsAt: Date; endsAt: Date }, from?: Date, to?: Date) {
  if (from && session.endsAt < from) return false;
  if (to && session.startsAt > to) return false;
  return true;
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

    app.patch('/v1/classes/:classId', { preHandler: app.requireAdmin }, async (request) => {
      const { classId } = request.params as { classId: string };
      const body = classUpdateSchema.parse(request.body);
      const classGroup = await schedulingRepo.updateClass(app.db, classId, body);
      if (!classGroup) throw notFound('Class not found');
      return { class: classGroup };
    });

    app.delete('/v1/classes/:classId', { preHandler: app.requireAdmin }, async (request) => {
      const { classId } = request.params as { classId: string };
      const classGroup = await schedulingRepo.deleteClass(app.db, classId);
      if (!classGroup) throw notFound('Class not found');
      return { class: classGroup };
    });

    app.get('/v1/class-sessions', { preHandler: app.requireAdmin }, async () => {
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
    });

    app.get('/v1/calendar', { preHandler: app.requireAdmin }, async (request) => {
      const query = calendarQuerySchema.parse(request.query);
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      const [sessions, classes, courses, teachers, classrooms] = await Promise.all([
        schedulingRepo.listClassSessions(app.db),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listTeachers(app.db),
        teachingRepo.listClassrooms(app.db),
      ]);
      const classById = new Map(classes.map((item) => [item.id, item]));
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const teacherById = new Map(teachers.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));

      return {
        events: sessions
          .filter((session) => {
            const classGroup = classById.get(session.classId);
            if (!classGroup) return false;
            if (!overlapsRange(session, from, to)) return false;
            if (query.classId && session.classId !== query.classId) return false;
            if (query.courseId && classGroup.courseId !== query.courseId) return false;
            if (query.teacherId && session.teacherId !== query.teacherId) return false;
            if (query.classroomId && session.classroomId !== query.classroomId) return false;
            if (query.status && session.status !== query.status) return false;
            return true;
          })
          .map((session) => {
            const classGroup = classById.get(session.classId);
            const course = classGroup ? courseById.get(classGroup.courseId) : undefined;
            const teacher = teacherById.get(session.teacherId);
            const classroom = classroomById.get(session.classroomId);
            return {
              id: session.id,
              type: 'class_session',
              title: session.topic,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              status: session.status,
              class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
              course: course ? { id: course.id, name: course.name } : null,
              teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
              classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
            };
          }),
      };
    });

    app.post('/v1/class-sessions', { preHandler: app.requireAdmin }, async (request) => {
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
    });

    app.post('/v1/class-sessions/batch', { preHandler: app.requireAdmin }, async (request) => {
      const body = batchSessionSchema.parse(request.body);
      const classGroup = await schedulingRepo.findClass(app.db, body.classId);
      if (!classGroup) throw notFound('Class not found');

      const teacherId = body.teacherId || classGroup.teacherId;
      const classroomId = body.classroomId || classGroup.classroomId;
      const dates = datesForBatch(body);
      const createdSessions: Awaited<ReturnType<typeof schedulingRepo.createClassSession>>[] = [];
      const skipped: Array<{ date: string; reason: string }> = [];

      for (const dateKey of dates) {
        const startsAt = localDateTimeToDate(
          dateKey,
          body.startTime,
          body.timezoneOffsetMinutes,
        );
        const endsAt = localDateTimeToDate(dateKey, body.endTime, body.timezoneOffsetMinutes);
        if (endsAt <= startsAt) {
          throw unprocessable('下课时间必须晚于上课时间');
        }

        const overlap = await schedulingRepo.findScheduleConflict(app.db, {
          startsAt,
          endsAt,
          classroomId,
          teacherId,
        });
        if (overlap) {
          if (body.skipConflicts) {
            skipped.push({ date: dateKey, reason: '老师或教室时间冲突' });
            continue;
          }
          throw conflict(`老师或教室时间冲突：${dateKey}`);
        }

        const classSession = await schedulingRepo.createClassSession(app.db, {
          classId: classGroup.id,
          teacherId,
          classroomId,
          topic: body.topic.trim(),
          startsAt,
          endsAt,
          status: 'scheduled',
        });
        createdSessions.push(classSession);
      }

      return { classSessions: createdSessions, skipped };
    });

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

    app.get(
      '/v1/class-sessions/:sessionId/checkin-qrcode',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) throw notFound('Class session not found');
        const landingUrl = `${resolvePublicWebBaseUrl(app.appEnv, request)}/check-in/${sessionId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(landingUrl, { margin: 1, width: 320 });
        return { landingUrl, qrCodeDataUrl };
      },
    );

    app.delete(
      '/v1/class-sessions/:sessionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { mode } = request.query as { mode?: string };
        const classSession =
          mode === 'hard'
            ? await schedulingRepo.deleteClassSession(app.db, sessionId)
            : await schedulingRepo.cancelClassSession(app.db, sessionId);
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
        const enrollment = await schedulingRepo.removeEnrollment(app.db, classId, enrollmentId);
        if (!enrollment) throw notFound('Enrollment not found');
        return { enrollment };
      },
    );
  },
};
