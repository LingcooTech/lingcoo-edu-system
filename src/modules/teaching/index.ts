import { z } from 'zod';

import * as teachingRepo from '../../db/repositories/teaching.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

const teacherSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(''),
  specialties: z.array(z.string()).default([]),
});

const classroomSchema = z.object({
  campusId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
});

export const teachingModule: AppModule = {
  name: 'teaching',
  async register(app) {
    app.get('/v1/tenants/:tenantId/teachers', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      return { teachers: await teachingRepo.listTeachers(app.db, tenantId) };
    });

    app.post(
      '/v1/tenants/:tenantId/teachers',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = teacherSchema.parse(request.body);
        const teacher = await teachingRepo.createTeacher(app.db, { tenantId, ...body });
        return { teacher };
      },
    );

    app.get(
      '/v1/tenants/:tenantId/classrooms',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return { classrooms: await teachingRepo.listClassrooms(app.db, tenantId) };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/classrooms',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = classroomSchema.parse(request.body);
        const classroom = await teachingRepo.createClassroom(app.db, { tenantId, ...body });
        return { classroom };
      },
    );
  },
};
