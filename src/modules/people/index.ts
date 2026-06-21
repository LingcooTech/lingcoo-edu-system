import { z } from 'zod';

import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import type { AppModule } from '../types.js';

const studentStatusSchema = z.enum(['active', 'inactive', 'archived']);
const studentListQuerySchema = z.object({
  scope: z.enum(['current', 'archived', 'all']).default('current'),
});

const studentSchema = z.object({
  guardianId: z.string().uuid().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  name: z.string().min(1),
  grade: z.string().min(1),
  school: z.string().optional(),
  status: studentStatusSchema.default('active'),
});

const studentUpdateSchema = studentSchema
  .omit({ guardianName: true, guardianPhone: true })
  .partial();

const guardianSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(40),
});

const guardianUpdateSchema = guardianSchema.partial();

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export const peopleModule: AppModule = {
  name: 'people',
  async register(app) {
    app.get('/v1/guardians', { preHandler: app.requireAdmin }, async () => {
      return { guardians: await peopleRepo.listGuardians(app.db) };
    });

    app.post('/v1/guardians', { preHandler: app.requireAdmin }, async (request) => {
      const body = guardianSchema.parse(request.body);
      const existing = await peopleRepo.findGuardianByPhone(app.db, body.phone.trim());
      if (existing) {
        throw Object.assign(new Error('该手机号已有家长档案'), { statusCode: 409 });
      }
      const guardian = await peopleRepo.createGuardian(app.db, {
        name: body.name.trim(),
        phone: body.phone.trim(),
      });
      return { guardian };
    });

    app.patch('/v1/guardians/:guardianId', { preHandler: app.requireAdmin }, async (request) => {
      const { guardianId } = request.params as { guardianId: string };
      const body = guardianUpdateSchema.parse(request.body);
      const phone = body.phone?.trim();
      if (phone) {
        const existing = await peopleRepo.findGuardianByPhone(app.db, phone);
        if (existing && existing.id !== guardianId) {
          throw Object.assign(new Error('该手机号已有家长档案'), { statusCode: 409 });
        }
      }
      const guardian = await peopleRepo.updateGuardian(app.db, guardianId, {
        name: body.name?.trim(),
        phone,
      });
      if (!guardian) throw notFound('Guardian not found');
      return { guardian };
    });

    app.get('/v1/students', { preHandler: app.requireAdmin }, async (request) => {
      const query = studentListQuerySchema.parse(request.query);
      const [students, guardians, accounts] = await Promise.all([
        peopleRepo.listStudents(app.db, { scope: query.scope }),
        peopleRepo.listGuardians(app.db),
        lessonRepo.listLessonAccounts(app.db),
      ]);
      const guardianById = new Map(guardians.map((guardian) => [guardian.id, guardian]));

      return {
        students: students.map((student) => ({
          ...student,
          guardian: student.guardianId ? guardianById.get(student.guardianId) : undefined,
          lessonAccounts: accounts.filter((account) => account.studentId === student.id),
        })),
      };
    });

    app.post('/v1/students', { preHandler: app.requireAdmin }, async (request) => {
      const body = studentSchema.parse(request.body);

      let guardianId = body.guardianId ?? null;
      if (!guardianId && body.guardianPhone && body.guardianName) {
        const existing = await peopleRepo.findGuardianByPhone(app.db, body.guardianPhone);
        const guardian =
          existing ??
          (await peopleRepo.createGuardian(app.db, {
            name: body.guardianName,
            phone: body.guardianPhone,
          }));
        guardianId = guardian.id;
      }

      const student = await peopleRepo.createStudent(app.db, {
        guardianId,
        name: body.name,
        grade: body.grade,
        school: body.school,
        status: body.status,
      });
      return { student };
    });

    app.patch('/v1/students/:studentId', { preHandler: app.requireAdmin }, async (request) => {
      const { studentId } = request.params as { studentId: string };
      const body = studentUpdateSchema.parse(request.body);
      const student = await peopleRepo.updateStudent(app.db, studentId, body);
      if (!student) throw notFound('Student not found');
      return { student };
    });

    app.delete('/v1/students/:studentId', { preHandler: app.requireAdmin }, async (request) => {
      const { studentId } = request.params as { studentId: string };
      const student = await peopleRepo.archiveStudent(app.db, studentId);
      if (!student) throw notFound('Student not found');
      return { student };
    });
  },
};
