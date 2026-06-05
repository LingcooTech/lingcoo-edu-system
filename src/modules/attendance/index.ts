import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
import type { AppModule } from '../types.js';

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

      if (
        context.enrollments.length > 0 &&
        context.enrollments.every((enrollment) => checkedInStudentIds.has(enrollment.studentId))
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
        });
        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: attendanceRecords.filter((record) => !existingStudentIds.has(record.studentId)),
        });

        return { attendanceRecords };
      },
    );
  },
};
