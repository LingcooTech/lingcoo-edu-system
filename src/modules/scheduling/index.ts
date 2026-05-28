import { z } from 'zod';

import { createId, requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

const classSchema = z.object({
  campusId: z.string(),
  courseId: z.string(),
  teacherId: z.string(),
  classroomId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z.enum(['recruiting', 'active', 'completed', 'paused']).default('recruiting'),
});

const sessionSchema = z.object({
  classId: z.string(),
  teacherId: z.string(),
  classroomId: z.string(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  topic: z.string().min(1),
});

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

export const schedulingModule: AppModule = {
  name: 'scheduling',
  async register(app) {
    app.get('/v1/tenants/:tenantId/classes', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      return {
        classes: store.classes
          .filter((item) => item.tenantId === tenantId)
          .map((item) => ({
            ...item,
            course: store.courses.find((course) => course.id === item.courseId),
            teacher: store.teachers.find((teacher) => teacher.id === item.teacherId),
            classroom: store.classrooms.find((classroom) => classroom.id === item.classroomId),
            enrolledCount: store.enrollments.filter(
              (enrollment) => enrollment.classId === item.id && enrollment.status === 'active',
            ).length,
          })),
      };
    });

    app.post('/v1/tenants/:tenantId/classes', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      const body = classSchema.parse(request.body);
      const classGroup = { id: createId('class'), tenantId, ...body };
      store.classes.unshift(classGroup);
      return { class: classGroup };
    });

    app.get(
      '/v1/tenants/:tenantId/class-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        return {
          classSessions: store.classSessions
            .filter((session) => session.tenantId === tenantId)
            .map((session) => ({
              ...session,
              class: store.classes.find((item) => item.id === session.classId),
              teacher: store.teachers.find((item) => item.id === session.teacherId),
              classroom: store.classrooms.find((item) => item.id === session.classroomId),
            })),
        };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/class-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        const body = sessionSchema.parse(request.body);

        const conflict = store.classSessions.find(
          (session) =>
            session.tenantId === tenantId &&
            session.status !== 'cancelled' &&
            overlaps(body.startsAt, body.endsAt, session.startsAt, session.endsAt) &&
            (session.classroomId === body.classroomId || session.teacherId === body.teacherId),
        );

        if (conflict) {
          throw Object.assign(new Error('Classroom or teacher time conflict'), { statusCode: 409 });
        }

        const classSession = {
          id: createId('session'),
          tenantId,
          status: 'scheduled' as const,
          ...body,
        };
        store.classSessions.unshift(classSession);
        return { classSession };
      },
    );
  },
};
