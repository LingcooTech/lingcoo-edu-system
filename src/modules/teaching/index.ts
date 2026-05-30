import { z } from 'zod';

import * as teachingRepo from '../../db/repositories/teaching.js';
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
    app.get('/v1/teachers', { preHandler: app.authenticate }, async () => {
      return { teachers: await teachingRepo.listTeachers(app.db) };
    });

    app.post('/v1/teachers', { preHandler: app.authenticate }, async (request) => {
      const body = teacherSchema.parse(request.body);
      const teacher = await teachingRepo.createTeacher(app.db, body);
      return { teacher };
    });

    app.patch('/v1/teachers/:teacherId', { preHandler: app.authenticate }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const body = teacherUpdateSchema.parse(request.body);
      const teacher = await teachingRepo.updateTeacher(app.db, teacherId, body);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher };
    });

    app.delete('/v1/teachers/:teacherId', { preHandler: app.authenticate }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const teacher = await teachingRepo.archiveTeacher(app.db, teacherId);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher };
    });

    app.get('/v1/classrooms', { preHandler: app.authenticate }, async () => {
      return { classrooms: await teachingRepo.listClassrooms(app.db) };
    });

    app.post('/v1/classrooms', { preHandler: app.authenticate }, async (request) => {
      const body = classroomSchema.parse(request.body);
      const classroom = await teachingRepo.createClassroom(app.db, body);
      return { classroom };
    });

    app.patch(
      '/v1/classrooms/:classroomId',
      { preHandler: app.authenticate },
      async (request) => {
        const { classroomId } = request.params as { classroomId: string };
        const body = classroomUpdateSchema.parse(request.body);
        const classroom = await teachingRepo.updateClassroom(app.db, classroomId, body);
        if (!classroom) throw notFound('Classroom not found');
        return { classroom };
      },
    );

    app.delete(
      '/v1/classrooms/:classroomId',
      { preHandler: app.authenticate },
      async (request) => {
        const { classroomId } = request.params as { classroomId: string };
        const classroom = await teachingRepo.archiveClassroom(app.db, classroomId);
        if (!classroom) throw notFound('Classroom not found');
        return { classroom };
      },
    );
  },
};
