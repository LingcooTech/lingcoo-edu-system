import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
import type { AppModule } from '../types.js';
import { eq, lte, and } from 'drizzle-orm';

const attendanceSchema = z.object({
  records: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(['present', 'leave', 'absent', 'makeup', 'trial']),
      note: z.string().optional(),
    }),
  ),
});

const publicCheckInSchema = z.object({
  studentId: z.string().uuid(),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function unprocessable(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

export const attendanceModule: AppModule = {
  name: 'attendance',
  async register(app) {
    const lessonNotifications = new LessonNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });

    async function loadPublicCheckInContext(sessionId: string) {
      const session = await schedulingRepo.findSession(app.db, sessionId);
      if (!session) {
        throw notFound('Class session not found');
      }

      const classGroup = await schedulingRepo.findClass(app.db, session.classId);
      if (!classGroup) {
        throw notFound('Class not found');
      }

      const [course, classrooms, enrollments, students, attendanceRecords] = await Promise.all([
        catalogRepo.requireCourse(app.db, classGroup.courseId),
        teachingRepo.listClassrooms(app.db),
        schedulingRepo.listEnrollments(app.db, classGroup.id),
        peopleRepo.listStudents(app.db),
        attendanceRepo.listAttendanceForSession(app.db, sessionId),
      ]);

      const classroom = classrooms.find((item) => item.id === session.classroomId) ?? null;
      const studentById = new Map(students.map((student) => [student.id, student]));
      const attendanceByStudentId = new Map(
        attendanceRecords.map((record) => [record.studentId, record]),
      );
      const roster = enrollments
        .map((enrollment) => {
          const student = studentById.get(enrollment.studentId);
          if (!student) return null;
          const attendanceRecord = attendanceByStudentId.get(student.id);
          return {
            id: student.id,
            name: student.name,
            grade: student.grade,
            checkedIn: Boolean(attendanceRecord),
            attendanceStatus: attendanceRecord?.status ?? null,
          };
        })
        .filter((student): student is NonNullable<typeof student> => Boolean(student));

      return {
        session,
        classGroup,
        course,
        classroom,
        enrollments,
        attendanceRecords,
        roster,
      };
    }

    app.get('/public/class-sessions/:sessionId/check-in', async (request) => {
      const { sessionId } = request.params as { sessionId: string };
      const context = await loadPublicCheckInContext(sessionId);
      if (context.session.status === 'cancelled') {
        throw notFound('Class session not found');
      }

      return {
        session: context.session,
        class: {
          id: context.classGroup.id,
          name: context.classGroup.name,
        },
        course: {
          id: context.course.id,
          name: context.course.name,
        },
        classroom: context.classroom
          ? {
              id: context.classroom.id,
              name: context.classroom.name,
            }
          : null,
        roster: context.roster,
      };
    });

    app.post('/public/class-sessions/:sessionId/check-in', async (request) => {
      const { sessionId } = request.params as { sessionId: string };
      const body = publicCheckInSchema.parse(request.body);
      const context = await loadPublicCheckInContext(sessionId);

      if (context.session.status === 'cancelled') {
        throw unprocessable('Class session is cancelled');
      }

      const enrolled = context.enrollments.some(
        (enrollment) => enrollment.studentId === body.studentId,
      );
      if (!enrolled) {
        throw unprocessable('Student is not enrolled in this class session');
      }

      const alreadyCheckedIn = context.attendanceRecords.some(
        (record) => record.studentId === body.studentId,
      );
      const existingStudentIds = new Set(
        context.attendanceRecords.map((record) => record.studentId),
      );
      const attendanceRecords = await attendanceRepo.recordAttendance(app.db, {
        sessionId,
        courseId: context.classGroup.courseId,
        records: [{ studentId: body.studentId, status: 'present', note: '家长扫码签到' }],
        completeSession: false,
      });
      await lessonNotifications.notifyLessonConsumedForAttendance({
        sessionId,
        records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
      });

      const latestAttendanceRecords = alreadyCheckedIn
        ? context.attendanceRecords
        : await attendanceRepo.listAttendanceForSession(app.db, sessionId);
      const checkedInStudentIds = new Set(
        latestAttendanceRecords.map((record) => record.studentId),
      );

      // Only mark as completed if all students with active course contracts
      // with startDate on or before this session have checked in
      const activeContracts = await app.db
        .select({ studentId: schema.courseContracts.studentId })
        .from(schema.courseContracts)
        .where(
          and(
            eq(schema.courseContracts.courseId, context.classGroup.courseId),
            eq(schema.courseContracts.status, 'active'),
            lte(schema.courseContracts.startsAt, context.session.startsAt),
          ),
        )
        .distinct();

      const contractStudentIds = new Set(activeContracts.map((c) => c.studentId));

      // Mark complete if all students with valid contracts have checked in
      if (
        contractStudentIds.size > 0 &&
        Array.from(contractStudentIds).every((studentId) => checkedInStudentIds.has(studentId))
      ) {
        await schedulingRepo.markSessionCompleted(app.db, sessionId);
      }

      return {
        attendanceRecord:
          attendanceRecords.find((record) => record.studentId === body.studentId) ?? null,
        message: alreadyCheckedIn ? '已签到，无需重复操作。' : '签到成功，课时已自动扣减。',
      };
    });

    app.get(
      '/v1/class-sessions/:sessionId/attendance',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) {
          throw Object.assign(new Error('Class session not found'), { statusCode: 404 });
        }
        return {
          attendanceRecords: await attendanceRepo.listAttendanceForSession(app.db, sessionId),
        };
      },
    );

    app.get(
      '/v1/courses/:courseId/attendance-summary',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseId } = request.params as { courseId: string };
        const course = await catalogRepo.requireCourse(app.db, courseId);

        // Get ALL sessions for this course (not filtering by status yet)
        const sessions = await schedulingRepo.listSessionsForCourse(app.db, courseId);

        // Get attendance records for all sessions
        const sessionAttendance = await Promise.all(
          sessions.map(async (session) => ({
            session,
            records: await attendanceRepo.listAttendanceForSession(app.db, session.id),
          })),
        );

        const students = await peopleRepo.listStudents(app.db);
        const studentById = new Map(students.map((s) => [s.id, s]));

        // Only count sessions that have attendance records (regardless of session status)
        const studentStats = new Map<
          string,
          {
            studentId: string;
            name: string;
            total: number;
            present: number;
            absent: number;
            leave: number;
            makeup: number;
            trial: number;
          }
        >();

        const sessionsWithAttendance = sessionAttendance.filter((sa) => sa.records.length > 0);

        sessionsWithAttendance.forEach(({ session, records }) => {
          records.forEach((record) => {
            if (!studentStats.has(record.studentId)) {
              const student = studentById.get(record.studentId);
              studentStats.set(record.studentId, {
                studentId: record.studentId,
                name: student?.name ?? '未知学员',
                total: 0,
                present: 0,
                absent: 0,
                leave: 0,
                makeup: 0,
                trial: 0,
              });
            }
            const stat = studentStats.get(record.studentId)!;
            stat.total++;
            stat[record.status]++;
          });
        });

        const sessionRecords = sessionsWithAttendance.map(({ session, records }) => {
          const statuses: Record<string, number> = {
            present: 0,
            absent: 0,
            leave: 0,
            makeup: 0,
            trial: 0,
            total: records.length,
          };
          records.forEach((record) => {
            statuses[record.status]++;
          });
          return {
            session,
            ...statuses,
          };
        });

        return {
          course,
          sessionCount: sessionsWithAttendance.length,
          studentStats: Array.from(studentStats.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          ),
          sessionRecords: sessionRecords.sort((a, b) =>
            new Date(a.session.startsAt).getTime() - new Date(b.session.startsAt).getTime()
          ),
          summary: {
            totalSessions: sessionsWithAttendance.length,
            totalRecords: sessionsWithAttendance.reduce((sum, item) => sum + item.records.length, 0),
            uniqueStudents: studentStats.size,
          },
        };
      },
    );

    app.post(
      '/v1/class-sessions/:sessionId/attendance',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };

        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) {
          throw Object.assign(new Error('Class session not found'), { statusCode: 404 });
        }

        const classGroup = await schedulingRepo.findClass(app.db, session.classId);
        if (!classGroup) {
          throw Object.assign(new Error('Class not found'), { statusCode: 404 });
        }

        const body = attendanceSchema.parse(request.body);
        const existingRecords = await attendanceRepo.listAttendanceForSession(app.db, sessionId);
        const existingStudentIds = new Set(existingRecords.map((record) => record.studentId));
        const attendanceRecords = await attendanceRepo.recordAttendance(app.db, {
          sessionId,
          courseId: classGroup.courseId,
          records: body.records,
          completeSession: false,
        });
        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
        });

        const [latestAttendanceRecords, activeContracts] = await Promise.all([
          attendanceRepo.listAttendanceForSession(app.db, sessionId),
          app.db
            .select({ studentId: schema.courseContracts.studentId })
            .from(schema.courseContracts)
            .where(
              and(
                eq(schema.courseContracts.courseId, classGroup.courseId),
                eq(schema.courseContracts.status, 'active'),
                lte(schema.courseContracts.startsAt, session.startsAt),
              ),
            )
            .distinct(),
        ]);

        const checkedInStudentIds = new Set(
          latestAttendanceRecords.map((record) => record.studentId),
        );
        const contractStudentIds = new Set(activeContracts.map((c) => c.studentId));

        // Mark complete if all students with valid contracts have checked in
        if (
          contractStudentIds.size > 0 &&
          Array.from(contractStudentIds).every((studentId) => checkedInStudentIds.has(studentId))
        ) {
          await schedulingRepo.markSessionCompleted(app.db, sessionId);
        }

        return { attendanceRecords };
      },
    );
  },
};
