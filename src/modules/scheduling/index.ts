import { z } from 'zod';
import QRCode from 'qrcode';
import { and, eq, inArray } from 'drizzle-orm';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as trialRepo from '../../db/repositories/trial.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as schema from '../../db/schema.js';
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
  teacherIds: z.array(z.string()).max(12).optional(),
  classroomId: z.string(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  topic: z.string().min(1),
  lessonUnits: z.number().int().min(0).max(10).default(1),
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
  lessonUnits: z.number().int().min(0).max(10).default(1),
  teacherId: z.string().optional(),
  teacherIds: z.array(z.string()).max(12).optional(),
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
const publicCalendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const enrollmentSchema = z.object({
  studentId: z.string(),
  billingCourseId: z.string().uuid().optional(),
  joinedAt: z.string().datetime({ offset: true }).optional(),
});

const enrollmentUpdateSchema = z
  .object({
    billingCourseId: z.string().uuid().optional(),
    joinedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied' });

const temporaryStudentSchema = z.object({
  studentId: z.string().uuid(),
  billingCourseId: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
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

function normalizeSessionTeacherIds(primaryTeacherId: string, teacherIds?: string[]) {
  return Array.from(new Set([primaryTeacherId, ...(teacherIds ?? [])].filter(Boolean)));
}

export const schedulingModule: AppModule = {
  name: 'scheduling',
  async register(app) {
    async function enrichClassSessions(
      sessions: Awaited<ReturnType<typeof schedulingRepo.listClassSessions>>,
    ) {
      if (sessions.length === 0) {
        return [];
      }
      const [classes, courses, teachers, classrooms, assignments] = await Promise.all([
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listTeachers(app.db),
        teachingRepo.listClassrooms(app.db),
        schedulingRepo.listClassSessionTeachers(
          app.db,
          sessions.map((session) => session.id),
        ),
      ]);
      const classById = new Map(classes.map((item) => [item.id, item]));
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const teacherById = new Map(teachers.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));
      const assignmentsBySessionId = new Map<string, typeof assignments>();
      for (const assignment of assignments) {
        const sessionAssignments = assignmentsBySessionId.get(assignment.classSessionId) ?? [];
        sessionAssignments.push(assignment);
        assignmentsBySessionId.set(assignment.classSessionId, sessionAssignments);
      }

      return sessions.map((session) => {
        const sessionAssignments = assignmentsBySessionId.get(session.id) ?? [];
        const teachersForSession =
          sessionAssignments.length > 0
            ? sessionAssignments
                .map((assignment) => {
                  const teacher = teacherById.get(assignment.teacherId);
                  return teacher ? { ...teacher, role: assignment.role } : null;
                })
                .filter((teacher): teacher is NonNullable<typeof teacher> => teacher !== null)
            : teacherById.has(session.teacherId)
              ? [{ ...teacherById.get(session.teacherId)!, role: 'primary' }]
              : [];
        return {
          ...session,
          teacherIds: teachersForSession.map((teacher) => teacher.id),
          teachers: teachersForSession,
          class: session.classId ? classById.get(session.classId) : undefined,
          course: courseById.get(session.courseId),
          teacher: teacherById.get(session.teacherId),
          classroom: classroomById.get(session.classroomId),
        };
      });
    }

    async function enrichSessionRoster(sessionId: string) {
      const roster = await schedulingRepo.listSessionRoster(app.db, sessionId);
      if (roster.length === 0) {
        return [];
      }

      const studentIds = Array.from(new Set(roster.map((entry) => entry.studentId)));
      const billingCourseIds = Array.from(new Set(roster.map((entry) => entry.billingCourseId)));
      const [students, courses, lessonAccounts] = await Promise.all([
        peopleRepo.listStudents(app.db, { scope: 'all' }),
        catalogRepo.listCourses(app.db),
        app.db
          .select()
          .from(schema.lessonAccounts)
          .where(inArray(schema.lessonAccounts.studentId, studentIds)),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(
        courses
          .filter((course) => billingCourseIds.includes(course.id))
          .map((course) => [course.id, course]),
      );
      const lessonAccountByStudentCourse = new Map(
        lessonAccounts.map((account) => [`${account.studentId}:${account.courseId}`, account]),
      );

      return roster.map((entry) => ({
        ...entry,
        student: studentById.get(entry.studentId) ?? null,
        billingCourse: courseById.get(entry.billingCourseId) ?? null,
        lessonAccount:
          lessonAccountByStudentCourse.get(`${entry.studentId}:${entry.billingCourseId}`) ?? null,
      }));
    }

    async function enrichTemporaryStudents(sessionId: string) {
      const [roster, temporaryStudents] = await Promise.all([
        enrichSessionRoster(sessionId),
        schedulingRepo.listTemporaryStudents(app.db, sessionId),
      ]);
      const temporaryStudentByStudentId = new Map(
        temporaryStudents.map((item) => [item.studentId, item]),
      );
      return roster
        .filter((entry) => entry.source === 'temporary' || entry.source === 'session_only')
        .map((entry) => {
          const temporaryStudent = temporaryStudentByStudentId.get(entry.studentId);
          return {
            id:
              temporaryStudent?.id ??
              ('temporaryStudentId' in entry ? entry.temporaryStudentId : null) ??
              entry.id,
            classSessionId: sessionId,
            studentId: entry.studentId,
            billingCourseId: entry.billingCourseId,
            note: temporaryStudent?.note ?? ('note' in entry ? entry.note : null) ?? null,
            student: entry.student,
            billingCourse: entry.billingCourse,
            lessonAccount: entry.lessonAccount,
          };
        });
    }

    async function requireStudentLessonAccount(input: { studentId: string; courseId: string }) {
      const [lessonAccount] = await app.db
        .select()
        .from(schema.lessonAccounts)
        .where(
          and(
            eq(schema.lessonAccounts.studentId, input.studentId),
            eq(schema.lessonAccounts.courseId, input.courseId),
          ),
        )
        .limit(1);

      if (!lessonAccount) {
        throw unprocessable('该学员暂无所选课程课时账户');
      }
      return lessonAccount;
    }

    async function requireLessonAccountForTemporaryStudent(input: {
      studentId: string;
      billingCourseId: string;
    }) {
      const [lessonAccount] = await app.db
        .select()
        .from(schema.lessonAccounts)
        .where(
          and(
            eq(schema.lessonAccounts.studentId, input.studentId),
            eq(schema.lessonAccounts.courseId, input.billingCourseId),
          ),
        )
        .limit(1);

      if (!lessonAccount) {
        throw unprocessable('该学员暂无所选课程课时账户');
      }
      if (lessonAccount.balance <= 0) {
        throw unprocessable('所选课时账户余额不足');
      }
      return lessonAccount;
    }

    app.get('/v1/classes', { preHandler: app.requireAdmin }, async () => {
      const [classes, courses, teachers, classrooms, classCourseAssociations] = await Promise.all([
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listTeachers(app.db),
        teachingRepo.listClassrooms(app.db),
        schedulingRepo.listClassCourseAssociations(app.db),
      ]);
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const teacherById = new Map(teachers.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));
      const courseIdsByClassId = new Map<string, string[]>();
      for (const association of classCourseAssociations) {
        courseIdsByClassId.set(association.classId, [
          ...(courseIdsByClassId.get(association.classId) ?? []),
          association.courseId,
        ]);
      }

      const enriched = await Promise.all(
        classes.map(async (item) => ({
          ...item,
          course: courseById.get(item.courseId),
          courseIds: courseIdsByClassId.get(item.id) ?? [item.courseId],
          courses: (courseIdsByClassId.get(item.id) ?? [item.courseId])
            .map((courseId) => courseById.get(courseId))
            .filter((course): course is NonNullable<typeof course> => Boolean(course)),
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
      const sessions = await schedulingRepo.listClassSessions(app.db);
      return { classSessions: await enrichClassSessions(sessions) };
    });

    app.get('/v1/calendar', { preHandler: app.requireAdmin }, async (request) => {
      const query = calendarQuerySchema.parse(request.query);
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      const [sessionRows, courses] = await Promise.all([
        schedulingRepo.listClassSessions(app.db),
        catalogRepo.listCourses(app.db),
      ]);
      const sessions = await enrichClassSessions(sessionRows);
      const courseById = new Map(courses.map((item) => [item.id, item]));

      return {
        events: sessions
          .filter((session) => {
            const classGroup = session.class;
            if (!classGroup) return false;
            if (!overlapsRange(session, from, to)) return false;
            if (query.classId && session.classId !== query.classId) return false;
            if (query.courseId && session.courseId !== query.courseId) return false;
            if (query.teacherId && !session.teacherIds.includes(query.teacherId)) return false;
            if (query.classroomId && session.classroomId !== query.classroomId) return false;
            if (query.status && session.status !== query.status) return false;
            return true;
          })
          .map((session) => {
            const classGroup = session.class;
            const course = courseById.get(session.courseId);
            return {
              id: session.id,
              type: 'class_session',
              title: session.topic,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              status: session.status,
              class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
              course: course ? { id: course.id, name: course.name } : null,
              teacher: session.teacher
                ? { id: session.teacher.id, name: session.teacher.name }
                : null,
              teachers: session.teachers.map((teacher) => ({
                id: teacher.id,
                name: teacher.name,
                role: teacher.role,
              })),
              classroom: session.classroom
                ? { id: session.classroom.id, name: session.classroom.name }
                : null,
            };
          }),
      };
    });

    app.get('/public/calendar', async (request) => {
      const query = publicCalendarQuerySchema.parse(request.query);
      const now = new Date();
      const from = query.from ? new Date(query.from) : now;
      const defaultTo = new Date(from);
      defaultTo.setDate(defaultTo.getDate() + 30);
      const to = query.to ? new Date(query.to) : defaultTo;
      const trialFrom = from > now ? from : now;

      const [sessionRows, classes, courses, classrooms, campuses, trialSessions] =
        await Promise.all([
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          catalogRepo.listPublishedCourses(app.db),
          teachingRepo.listClassrooms(app.db),
          organizationRepo.listCampuses(app.db),
          trialRepo.listOpenFutureTrialSessions(app.db, { from: trialFrom, to }),
        ]);
      const sessions = await enrichClassSessions(sessionRows);
      const classById = new Map(classes.map((item) => [item.id, item]));
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));
      const campusById = new Map(campuses.map((item) => [item.id, item]));

      const classEvents = sessions
        .filter((session) => {
          const classGroup = session.classId ? classById.get(session.classId) : undefined;
          if (!classGroup) return false;
          if (!['recruiting', 'active'].includes(classGroup.status)) return false;
          if (!courseById.has(session.courseId)) return false;
          if (session.status !== 'scheduled') return false;
          return overlapsRange(session, from, to);
        })
        .map((session) => {
          const classGroup = session.classId ? classById.get(session.classId) : undefined;
          const course = courseById.get(session.courseId);
          const classroom = classroomById.get(session.classroomId);
          return {
            id: session.id,
            sessionId: session.id,
            type: 'class_session',
            title: session.topic,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            status: session.status,
            class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
            course: course
              ? { id: course.id, name: course.name, slug: course.slug, category: course.category }
              : null,
            teacher: session.teacher
              ? { id: session.teacher.id, name: session.teacher.name }
              : null,
            teachers: session.teachers.map((teacher) => ({
              id: teacher.id,
              name: teacher.name,
              role: teacher.role,
            })),
            classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
          };
        });

      const trialEvents = trialSessions
        .map((trialSession) => {
          const course = courseById.get(trialSession.courseId);
          if (!course) return null;
          const campus = campusById.get(trialSession.campusId);
          return {
            id: trialSession.id,
            trialSessionId: trialSession.id,
            type: 'trial_session',
            title: trialSession.title,
            startsAt: trialSession.startsAt,
            endsAt: trialSession.endsAt,
            status: trialSession.status,
            capacity: trialSession.capacity,
            bookedCount: trialSession.bookedCount,
            reservationFeeAmount: trialSession.reservationFeeAmount,
            course: {
              id: course.id,
              name: course.name,
              slug: course.slug,
              category: course.category,
            },
            campus: campus ? { id: campus.id, name: campus.name, address: campus.address } : null,
          };
        })
        .filter((event): event is NonNullable<typeof event> => event !== null);

      return {
        events: [...classEvents, ...trialEvents].sort(
          (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
        ),
      };
    });

    app.post('/v1/class-sessions', { preHandler: app.requireAdmin }, async (request) => {
      const body = sessionCreateSchema.parse(request.body);
      const classGroup = await schedulingRepo.findClass(app.db, body.classId);
      if (!classGroup) throw notFound('Class not found');

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      const teacherIds = normalizeSessionTeacherIds(body.teacherId, body.teacherIds);

      const conflict = await schedulingRepo.findScheduleConflict(app.db, {
        startsAt,
        endsAt,
        classroomId: body.classroomId,
        teacherId: body.teacherId,
        teacherIds,
      });
      if (conflict) {
        throw Object.assign(new Error('Classroom or teacher time conflict'), { statusCode: 409 });
      }

      const classSession = await schedulingRepo.createClassSession(app.db, {
        classId: body.classId,
        courseId: classGroup.courseId,
        teacherId: body.teacherId,
        classroomId: body.classroomId,
        topic: body.topic,
        startsAt,
        endsAt,
        lessonUnits: body.lessonUnits,
        status: 'scheduled',
      });
      await schedulingRepo.replaceClassSessionTeachers(
        app.db,
        classSession.id,
        body.teacherId,
        teacherIds,
      );
      return { classSession: (await enrichClassSessions([classSession]))[0] };
    });

    app.post('/v1/class-sessions/batch', { preHandler: app.requireAdmin }, async (request) => {
      const body = batchSessionSchema.parse(request.body);
      const classGroup = await schedulingRepo.findClass(app.db, body.classId);
      if (!classGroup) throw notFound('Class not found');

      const teacherId = body.teacherId || classGroup.teacherId;
      const classroomId = body.classroomId || classGroup.classroomId;
      const teacherIds = normalizeSessionTeacherIds(teacherId, body.teacherIds);
      const dates = datesForBatch(body);
      const createdSessions: Awaited<ReturnType<typeof schedulingRepo.createClassSession>>[] = [];
      const skipped: Array<{ date: string; reason: string }> = [];

      for (const dateKey of dates) {
        const startsAt = localDateTimeToDate(dateKey, body.startTime, body.timezoneOffsetMinutes);
        const endsAt = localDateTimeToDate(dateKey, body.endTime, body.timezoneOffsetMinutes);
        if (endsAt <= startsAt) {
          throw unprocessable('下课时间必须晚于上课时间');
        }

        const overlap = await schedulingRepo.findScheduleConflict(app.db, {
          startsAt,
          endsAt,
          classroomId,
          teacherId,
          teacherIds,
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
          courseId: classGroup.courseId,
          teacherId,
          classroomId,
          topic: body.topic.trim(),
          startsAt,
          endsAt,
          lessonUnits: body.lessonUnits,
          status: 'scheduled',
        });
        await schedulingRepo.replaceClassSessionTeachers(
          app.db,
          classSession.id,
          teacherId,
          teacherIds,
        );
        createdSessions.push(classSession);
      }

      return { classSessions: await enrichClassSessions(createdSessions), skipped };
    });

    app.patch(
      '/v1/class-sessions/:sessionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const current = await schedulingRepo.findSession(app.db, sessionId);
        if (!current) throw notFound('Class session not found');
        const body = sessionUpdateSchema.parse(request.body);
        const { teacherIds: requestedTeacherIds, ...sessionPatch } = body;

        const startsAt = body.startsAt ? new Date(body.startsAt) : current.startsAt;
        const endsAt = body.endsAt ? new Date(body.endsAt) : current.endsAt;
        const classroomId = body.classroomId ?? current.classroomId;
        const teacherId = body.teacherId ?? current.teacherId;
        const currentAssignments = await schedulingRepo.listClassSessionTeachers(app.db, [
          sessionId,
        ]);
        const currentTeacherIds =
          currentAssignments.length > 0
            ? currentAssignments.map((assignment) => assignment.teacherId)
            : [current.teacherId];
        const teacherIds = normalizeSessionTeacherIds(
          teacherId,
          requestedTeacherIds ?? currentTeacherIds,
        );
        const nextStatus = body.status ?? current.status;

        if (nextStatus !== 'cancelled') {
          const overlap = await schedulingRepo.findScheduleConflict(app.db, {
            startsAt,
            endsAt,
            classroomId,
            teacherId,
            teacherIds,
            ignoreSessionId: sessionId,
          });
          if (overlap) throw conflict();
        }

        const classSession = await schedulingRepo.updateClassSession(app.db, sessionId, {
          ...sessionPatch,
          startsAt,
          endsAt,
          classroomId,
          teacherId,
          status: nextStatus,
        });
        if (!classSession) throw notFound('Class session not found');
        await schedulingRepo.replaceClassSessionTeachers(app.db, sessionId, teacherId, teacherIds);
        return { classSession: (await enrichClassSessions([classSession]))[0] };
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

    app.get(
      '/v1/class-sessions/:sessionId/roster',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) throw notFound('Class session not found');
        return { roster: await enrichSessionRoster(sessionId) };
      },
    );

    app.get(
      '/v1/class-sessions/:sessionId/temporary-students',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) throw notFound('Class session not found');
        return { temporaryStudents: await enrichTemporaryStudents(sessionId) };
      },
    );

    app.post(
      '/v1/class-sessions/:sessionId/temporary-students',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const body = temporaryStudentSchema.parse(request.body);
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) throw notFound('Class session not found');
        const classGroup = session.classId
          ? await schedulingRepo.findClass(app.db, session.classId)
          : null;
        if (!classGroup) throw notFound('Class not found');

        const [student, billingCourse, enrollments, existingTemporaryStudent] = await Promise.all([
          peopleRepo.requireStudent(app.db, body.studentId),
          catalogRepo.requireCourse(app.db, body.billingCourseId),
          schedulingRepo.listEnrollments(app.db, classGroup.id),
          schedulingRepo.findTemporaryStudent(app.db, {
            sessionId,
            studentId: body.studentId,
          }),
        ]);

        if (student.status === 'archived') {
          throw unprocessable('不能添加已归档学员');
        }
        if (enrollments.some((enrollment) => enrollment.studentId === body.studentId)) {
          throw conflict('该学员已是本课次正式学员，无需临时添加');
        }
        if (existingTemporaryStudent) {
          throw conflict('该学员已是本课次临时学员');
        }
        await requireLessonAccountForTemporaryStudent({
          studentId: student.id,
          billingCourseId: billingCourse.id,
        });

        const temporaryStudent = await schedulingRepo.createTemporaryStudent(app.db, {
          classSessionId: sessionId,
          studentId: student.id,
          billingCourseId: billingCourse.id,
          note: body.note?.trim() || null,
        });
        if ((await schedulingRepo.listSessionStudentRows(app.db, sessionId)).length > 0) {
          await schedulingRepo.upsertSessionStudent(app.db, {
            classSessionId: sessionId,
            studentId: student.id,
            billingCourseId: billingCourse.id,
            source: 'session_only',
            active: true,
          });
        }
        const [enriched] = (await enrichTemporaryStudents(sessionId)).filter(
          (item) => item.id === temporaryStudent.id,
        );
        return { temporaryStudent: enriched ?? temporaryStudent };
      },
    );

    app.delete(
      '/v1/class-sessions/:sessionId/temporary-students/:temporaryStudentId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId, temporaryStudentId } = request.params as {
          sessionId: string;
          temporaryStudentId: string;
        };
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) throw notFound('Class session not found');
        const temporaryStudent = (
          await schedulingRepo.listTemporaryStudents(app.db, sessionId)
        ).find((item) => item.id === temporaryStudentId);
        if (!temporaryStudent) throw notFound('Temporary student not found');

        const [attendanceRecord] = await app.db
          .select({ id: schema.attendanceRecords.id })
          .from(schema.attendanceRecords)
          .where(
            and(
              eq(schema.attendanceRecords.classSessionId, sessionId),
              eq(schema.attendanceRecords.studentId, temporaryStudent.studentId),
            ),
          )
          .limit(1);
        if (attendanceRecord) {
          throw unprocessable('该临时学员已点名，不能移除');
        }

        const removed = await schedulingRepo.removeTemporaryStudent(app.db, {
          sessionId,
          temporaryStudentId,
        });
        if (!removed) throw notFound('Temporary student not found');
        if ((await schedulingRepo.listSessionStudentRows(app.db, sessionId)).length > 0) {
          await schedulingRepo.removeSessionStudent(app.db, {
            sessionId,
            studentId: temporaryStudent.studentId,
          });
        }
        return { temporaryStudent: removed };
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
        const enrollments = await schedulingRepo.listEnrollments(app.db, classId);
        const studentIds = enrollments.map((item) => item.studentId);
        const [students, courses, lessonAccounts] = await Promise.all([
          peopleRepo.listStudents(app.db),
          catalogRepo.listCourses(app.db),
          studentIds.length > 0
            ? app.db
                .select()
                .from(schema.lessonAccounts)
                .where(inArray(schema.lessonAccounts.studentId, studentIds))
            : Promise.resolve([]),
        ]);
        const studentById = new Map(students.map((student) => [student.id, student]));
        const courseById = new Map(courses.map((course) => [course.id, course]));
        const lessonAccountByStudentCourse = new Map(
          lessonAccounts.map((account) => [`${account.studentId}:${account.courseId}`, account]),
        );
        return {
          enrollments: enrollments.map((enrollment) => ({
            ...enrollment,
            student: studentById.get(enrollment.studentId),
            billingCourse: courseById.get(enrollment.billingCourseId) ?? null,
            lessonAccount:
              lessonAccountByStudentCourse.get(
                `${enrollment.studentId}:${enrollment.billingCourseId}`,
              ) ?? null,
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
        const billingCourseId = body.billingCourseId ?? classGroup.courseId;
        await catalogRepo.requireCourse(app.db, billingCourseId);
        await requireStudentLessonAccount({ studentId: body.studentId, courseId: billingCourseId });

        const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classId);
        if (enrolledCount >= classGroup.capacity) {
          throw conflict('Class capacity reached');
        }

        const enrollment = await schedulingRepo.createEnrollment(app.db, {
          classId,
          studentId: body.studentId,
          billingCourseId,
          active: true,
          joinedAt: body.joinedAt ? new Date(body.joinedAt) : new Date(),
          leftAt: null,
        });
        return { enrollment };
      },
    );

    app.patch(
      '/v1/classes/:classId/enrollments/:enrollmentId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classId, enrollmentId } = request.params as {
          classId: string;
          enrollmentId: string;
        };
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        const body = enrollmentUpdateSchema.parse(request.body);
        const current = (await schedulingRepo.listEnrollments(app.db, classId)).find(
          (item) => item.id === enrollmentId,
        );
        if (!current) throw notFound('Enrollment not found');
        let enrollment = current;
        if (body.billingCourseId && body.billingCourseId !== current.billingCourseId) {
          await catalogRepo.requireCourse(app.db, body.billingCourseId);
          await requireStudentLessonAccount({
            studentId: current.studentId,
            courseId: body.billingCourseId,
          });
          enrollment =
            (await schedulingRepo.updateEnrollmentBillingCourse(app.db, {
              classId,
              enrollmentId,
              billingCourseId: body.billingCourseId,
            })) ?? enrollment;
        }
        if (body.joinedAt) {
          enrollment =
            (await schedulingRepo.updateEnrollmentJoinedAt(app.db, {
              classId,
              enrollmentId,
              joinedAt: new Date(body.joinedAt),
            })) ?? enrollment;
        }
        if (!enrollment) throw notFound('Enrollment not found');
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
