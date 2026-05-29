import { z } from 'zod';

import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import { requireTenant } from '../../db/repositories/tenant.js';
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
        const body = sessionSchema.parse(request.body);

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
  },
};
