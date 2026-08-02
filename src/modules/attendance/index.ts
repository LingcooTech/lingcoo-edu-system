import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import * as schema from '../../db/schema.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
import type { AppModule } from '../types.js';
import { eq, and } from 'drizzle-orm';

const attendanceSchema = z.object({
  records: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(['present', 'late', 'leave', 'absent', 'makeup', 'trial']),
      note: z.string().optional(),
      deductLesson: z.boolean().optional(),
      courseContractId: z.string().uuid().nullable().optional(),
    }),
  ),
});

const attendanceCorrectionSchema = z.object({
  status: z.enum(['present', 'late', 'leave', 'absent', 'makeup', 'trial']),
  note: z.string().optional(),
  deductLesson: z.boolean().optional(),
  courseContractId: z.string().uuid().nullable().optional(),
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

    function billingCourseByStudentId(
      roster: Array<Pick<schedulingRepo.SessionRosterEntry, 'studentId' | 'billingCourseId'>>,
    ) {
      return new Map(roster.map((entry) => [entry.studentId, entry.billingCourseId]));
    }

    async function loadPublicCheckInContext(sessionId: string) {
      const session = await schedulingRepo.findSession(app.db, sessionId);
      if (!session) {
        throw notFound('Class session not found');
      }

      const classGroup = session.classId
        ? await schedulingRepo.findClass(app.db, session.classId)
        : null;

      const [course, classrooms, rosterEntries, students, attendanceRecords] = await Promise.all([
        catalogRepo.requireCourse(app.db, session.courseId),
        teachingRepo.listClassrooms(app.db),
        schedulingRepo.listSessionRoster(app.db, sessionId),
        peopleRepo.listStudents(app.db),
        attendanceRepo.listAttendanceForSession(app.db, sessionId),
      ]);

      const classroom = classrooms.find((item) => item.id === session.classroomId) ?? null;
      const studentById = new Map(students.map((student) => [student.id, student]));
      const attendanceByStudentId = new Map(
        attendanceRecords.map((record) => [record.studentId, record]),
      );
      const roster = rosterEntries
        .map((entry) => {
          const student = studentById.get(entry.studentId);
          if (!student) return null;
          const attendanceRecord = attendanceByStudentId.get(student.id);
          return {
            id: student.id,
            name: student.name,
            grade: student.grade,
            source: entry.source,
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
        rosterEntries,
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
        class: context.classGroup
          ? {
              id: context.classGroup.id,
              name: context.classGroup.name,
            }
          : null,
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

      const rosterEntry = context.rosterEntries.find((entry) => entry.studentId === body.studentId);
      if (!rosterEntry) {
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
        courseId: context.session.courseId,
        records: [
          {
            studentId: body.studentId,
            status: 'present',
            note: '家长扫码签到',
            courseId: rosterEntry.billingCourseId,
            lessonUnits: context.session.lessonUnits,
          },
        ],
        completeSession: false,
      });

      // Check and auto-complete course contract if all lessons are consumed
      const billingCourseMap = billingCourseByStudentId(context.rosterEntries);
      for (const record of attendanceRecords) {
        const billingCourseId = billingCourseMap.get(record.studentId) ?? context.session.courseId;
        const [contract] = await app.db
          .select()
          .from(schema.courseContracts)
          .where(
            and(
              eq(schema.courseContracts.studentId, record.studentId),
              eq(schema.courseContracts.courseId, billingCourseId),
              eq(schema.courseContracts.status, 'active'),
            ),
          )
          .limit(1);

        if (contract) {
          await lessonRepo.checkAndCompleteCourseContract(app.db, {
            studentId: record.studentId,
            courseId: billingCourseId,
            contractId: contract.id,
          });
        }
      }

      await lessonNotifications.notifyLessonConsumedForAttendance({
        sessionId,
        records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
        billingCourseIdByStudentId: billingCourseMap,
      });

      const latestAttendanceRecords = alreadyCheckedIn
        ? context.attendanceRecords
        : await attendanceRepo.listAttendanceForSession(app.db, sessionId);
      const checkedInStudentIds = new Set(
        latestAttendanceRecords.map((record) => record.studentId),
      );

      const rosterStudentIds = new Set(context.rosterEntries.map((entry) => entry.studentId));
      if (
        rosterStudentIds.size > 0 &&
        Array.from(rosterStudentIds).every((studentId) => checkedInStudentIds.has(studentId))
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
      '/v1/class-sessions/:sessionId/attendance-sources',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) throw notFound('Class session not found');
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const lessonSourcesByStudentId = Object.fromEntries(
          await Promise.all(
            rosterEntries.map(async (entry) => [
              entry.studentId,
              await attendanceRepo.listAttendanceLessonSources(app.db, {
                sessionId,
                studentId: entry.studentId,
                courseId: entry.billingCourseId,
              }),
            ]),
          ),
        );
        return { lessonSourcesByStudentId };
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
            late: number;
            absent: number;
            leave: number;
            makeup: number;
            trial: number;
          }
        >();

        const sessionsWithAttendance = sessionAttendance.filter((sa) => sa.records.length > 0);

        sessionsWithAttendance.forEach(({ records }) => {
          records.forEach((record) => {
            if (!studentStats.has(record.studentId)) {
              const student = studentById.get(record.studentId);
              studentStats.set(record.studentId, {
                studentId: record.studentId,
                name: student?.name ?? '未知学员',
                total: 0,
                present: 0,
                late: 0,
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
            late: 0,
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
            a.name.localeCompare(b.name),
          ),
          sessionRecords: sessionRecords.sort(
            (a, b) =>
              new Date(a.session.startsAt).getTime() - new Date(b.session.startsAt).getTime(),
          ),
          summary: {
            totalSessions: sessionsWithAttendance.length,
            totalRecords: sessionsWithAttendance.reduce(
              (sum, item) => sum + item.records.length,
              0,
            ),
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

        const body = attendanceSchema.parse(request.body);
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const billingCourseMap = billingCourseByStudentId(rosterEntries);
        const invalidRecord = body.records.find(
          (record) => !billingCourseMap.has(record.studentId),
        );
        if (invalidRecord) {
          throw Object.assign(new Error('只能为本课次学员点名'), { statusCode: 400 });
        }
        const existingRecords = await attendanceRepo.listAttendanceForSession(app.db, sessionId);
        const existingStudentIds = new Set(existingRecords.map((record) => record.studentId));
        const attendanceRecords = await attendanceRepo.recordAttendance(app.db, {
          sessionId,
          courseId: session.courseId,
          records: body.records.map((record) => ({
            ...record,
            courseId: billingCourseMap.get(record.studentId),
            lessonUnits: session.lessonUnits,
            courseContractId: record.courseContractId,
          })),
          completeSession: false,
        });

        // Check and auto-complete course contracts if all lessons are consumed
        for (const record of attendanceRecords) {
          const billingCourseId = billingCourseMap.get(record.studentId) ?? session.courseId;
          const [contract] = await app.db
            .select()
            .from(schema.courseContracts)
            .where(
              and(
                eq(schema.courseContracts.studentId, record.studentId),
                eq(schema.courseContracts.courseId, billingCourseId),
                eq(schema.courseContracts.status, 'active'),
              ),
            )
            .limit(1);

          if (contract) {
            await lessonRepo.checkAndCompleteCourseContract(app.db, {
              studentId: record.studentId,
              courseId: billingCourseId,
              contractId: contract.id,
            });
          }
        }

        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
          billingCourseIdByStudentId: billingCourseMap,
        });

        const latestAttendanceRecords = await attendanceRepo.listAttendanceForSession(
          app.db,
          sessionId,
        );

        const checkedInStudentIds = new Set(
          latestAttendanceRecords.map((record) => record.studentId),
        );
        const rosterStudentIds = new Set(rosterEntries.map((entry) => entry.studentId));

        if (
          rosterStudentIds.size > 0 &&
          Array.from(rosterStudentIds).every((studentId) => checkedInStudentIds.has(studentId))
        ) {
          await schedulingRepo.markSessionCompleted(app.db, sessionId);
        }

        return { attendanceRecords };
      },
    );

    app.patch(
      '/v1/class-sessions/:sessionId/attendance/:studentId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { sessionId, studentId } = request.params as {
          sessionId: string;
          studentId: string;
        };

        const session = await schedulingRepo.findSession(app.db, sessionId);
        if (!session) {
          throw Object.assign(new Error('Class session not found'), { statusCode: 404 });
        }

        const body = attendanceCorrectionSchema.parse(request.body);
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const billingCourseMap = billingCourseByStudentId(rosterEntries);
        const billingCourseId = billingCourseMap.get(studentId);
        if (!billingCourseId) {
          throw Object.assign(new Error('只能修改本课次学员的点名结果'), { statusCode: 400 });
        }

        const result = await attendanceRepo.updateAttendanceRecord(app.db, {
          sessionId,
          studentId,
          status: body.status,
          note: body.note?.trim() || null,
          deductLesson: body.deductLesson,
          lessonUnits: session.lessonUnits,
          courseId: billingCourseId,
          courseContractId: body.courseContractId,
        });
        if (!result) {
          throw Object.assign(new Error('Attendance record not found'), { statusCode: 404 });
        }

        if (result.lessonDeltaAdjustment < 0) {
          const [contract] = await app.db
            .select()
            .from(schema.courseContracts)
            .where(
              and(
                eq(schema.courseContracts.studentId, result.attendanceRecord.studentId),
                eq(schema.courseContracts.courseId, billingCourseId),
                eq(schema.courseContracts.status, 'active'),
              ),
            )
            .limit(1);

          if (contract) {
            await lessonRepo.checkAndCompleteCourseContract(app.db, {
              studentId: result.attendanceRecord.studentId,
              courseId: billingCourseId,
              contractId: contract.id,
            });
          }

          await lessonNotifications.notifyLessonConsumedForAttendance({
            sessionId,
            records: [result.attendanceRecord],
            billingCourseIdByStudentId: billingCourseMap,
          });
        }

        return { attendanceRecord: result.attendanceRecord };
      },
    );
  },
};
