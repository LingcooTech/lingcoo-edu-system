import { z } from 'zod';

import * as teachingRepo from '../../db/repositories/teaching.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

const teacherSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(''),
  specialties: z.array(z.string()).default([]),
  status: z.enum(['active', 'archived']).default('active'),
});

const teacherUpdateSchema = teacherSchema.partial();

const classroomSchema = z.object({
  campusId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z.enum(['active', 'archived']).default('active'),
});

const classroomUpdateSchema = classroomSchema.partial();

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

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

    app.patch(
      '/v1/tenants/:tenantId/teachers/:teacherId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, teacherId } = request.params as {
          tenantId: string;
          teacherId: string;
        };
        await requireTenant(app.db, tenantId);
        const body = teacherUpdateSchema.parse(request.body);
        const teacher = await teachingRepo.updateTeacher(app.db, tenantId, teacherId, body);
        if (!teacher) throw notFound('Teacher not found');
        return { teacher };
      },
    );

    app.delete(
      '/v1/tenants/:tenantId/teachers/:teacherId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, teacherId } = request.params as {
          tenantId: string;
          teacherId: string;
        };
        await requireTenant(app.db, tenantId);
        const teacher = await teachingRepo.archiveTeacher(app.db, tenantId, teacherId);
        if (!teacher) throw notFound('Teacher not found');
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

    app.patch(
      '/v1/tenants/:tenantId/classrooms/:classroomId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classroomId } = request.params as {
          tenantId: string;
          classroomId: string;
        };
        await requireTenant(app.db, tenantId);
        const body = classroomUpdateSchema.parse(request.body);
        const classroom = await teachingRepo.updateClassroom(app.db, tenantId, classroomId, body);
        if (!classroom) throw notFound('Classroom not found');
        return { classroom };
      },
    );

    app.delete(
      '/v1/tenants/:tenantId/classrooms/:classroomId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, classroomId } = request.params as {
          tenantId: string;
          classroomId: string;
        };
        await requireTenant(app.db, tenantId);
        const classroom = await teachingRepo.archiveClassroom(app.db, tenantId, classroomId);
        if (!classroom) throw notFound('Classroom not found');
        return { classroom };
      },
    );
  },
};
