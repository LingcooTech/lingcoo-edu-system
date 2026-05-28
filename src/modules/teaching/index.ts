import { z } from 'zod';

import { createId, requireTenant, store } from '../../lib/store.js';
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
      requireTenant(tenantId);
      return { teachers: store.teachers.filter((teacher) => teacher.tenantId === tenantId) };
    });

    app.post(
      '/v1/tenants/:tenantId/teachers',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        const body = teacherSchema.parse(request.body);
        const teacher = { id: createId('teacher'), tenantId, ...body };
        store.teachers.unshift(teacher);
        return { teacher };
      },
    );

    app.get(
      '/v1/tenants/:tenantId/classrooms',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        return {
          classrooms: store.classrooms.filter((classroom) => classroom.tenantId === tenantId),
        };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/classrooms',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        const body = classroomSchema.parse(request.body);
        const classroom = { id: createId('classroom'), tenantId, ...body };
        store.classrooms.unshift(classroom);
        return { classroom };
      },
    );
  },
};
