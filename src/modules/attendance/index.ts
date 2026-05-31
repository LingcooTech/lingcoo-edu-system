import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
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

export const attendanceModule: AppModule = {
  name: 'attendance',
  async register(app) {
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
        const attendanceRecords = await attendanceRepo.recordAttendance(app.db, {
          sessionId,
          courseId: classGroup.courseId,
          records: body.records,
        });

        return { attendanceRecords };
      },
    );
  },
};
