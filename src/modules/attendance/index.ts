import { z } from 'zod';

import { createId, store } from '../../lib/store.js';
import type { AttendanceStatus } from '../../lib/domain.js';
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

function lessonDeltaForStatus(status: AttendanceStatus): number {
  if (['present', 'absent', 'makeup'].includes(status)) return -1;
  return 0;
}

export const attendanceModule: AppModule = {
  name: 'attendance',
  async register(app) {
    app.post(
      '/v1/tenants/:tenantId/class-sessions/:sessionId/attendance',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, sessionId } = request.params as { tenantId: string; sessionId: string };
        const session = store.classSessions.find(
          (item) => item.tenantId === tenantId && item.id === sessionId,
        );
        if (!session)
          throw Object.assign(new Error('Class session not found'), { statusCode: 404 });

        const classGroup = store.classes.find((item) => item.id === session.classId);
        if (!classGroup) throw Object.assign(new Error('Class not found'), { statusCode: 404 });

        const body = attendanceSchema.parse(request.body);
        const records = body.records.map((record) => {
          const existing = store.attendanceRecords.find(
            (item) => item.classSessionId === sessionId && item.studentId === record.studentId,
          );
          if (existing) {
            throw Object.assign(new Error('Attendance already recorded'), { statusCode: 409 });
          }

          const lessonDelta = lessonDeltaForStatus(record.status);
          const attendanceRecord = {
            id: createId('attendance'),
            tenantId,
            classSessionId: sessionId,
            studentId: record.studentId,
            status: record.status,
            lessonDelta,
            note: record.note,
            createdAt: new Date().toISOString(),
          };
          store.attendanceRecords.unshift(attendanceRecord);

          if (lessonDelta !== 0) {
            let account = store.lessonAccounts.find(
              (item) =>
                item.studentId === record.studentId && item.courseId === classGroup.courseId,
            );
            if (!account) {
              account = {
                id: createId('lesson_account'),
                tenantId,
                studentId: record.studentId,
                courseId: classGroup.courseId,
                balance: 0,
              };
              store.lessonAccounts.unshift(account);
            }

            account.balance += lessonDelta;
            store.lessonTransactions.unshift({
              id: createId('lesson_tx'),
              tenantId,
              lessonAccountId: account.id,
              studentId: record.studentId,
              type: 'consume',
              amount: lessonDelta,
              balanceAfter: account.balance,
              relatedEntityType: 'class_session',
              relatedEntityId: sessionId,
              createdAt: new Date().toISOString(),
            });
          }

          return attendanceRecord;
        });

        session.status = 'completed';
        return { attendanceRecords: records };
      },
    );
  },
};
