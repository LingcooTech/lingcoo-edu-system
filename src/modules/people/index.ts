import { z } from 'zod';

import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

const studentSchema = z.object({
  guardianId: z.string().uuid().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  name: z.string().min(1),
  grade: z.string().min(1),
  school: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const studentUpdateSchema = studentSchema
  .omit({ guardianName: true, guardianPhone: true })
  .partial();

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export const peopleModule: AppModule = {
  name: 'people',
  async register(app) {
    app.get(
      '/v1/tenants/:tenantId/guardians',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return { guardians: await peopleRepo.listGuardians(app.db, tenantId) };
      },
    );

    app.get('/v1/tenants/:tenantId/students', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);

      const [students, guardians, accounts] = await Promise.all([
        peopleRepo.listStudents(app.db, tenantId),
        peopleRepo.listGuardians(app.db, tenantId),
        lessonRepo.listLessonAccounts(app.db, tenantId),
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

    app.post(
      '/v1/tenants/:tenantId/students',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = studentSchema.parse(request.body);

        let guardianId = body.guardianId ?? null;
        if (!guardianId && body.guardianPhone && body.guardianName) {
          const existing = await peopleRepo.findGuardianByPhone(app.db, tenantId, body.guardianPhone);
          const guardian =
            existing ??
            (await peopleRepo.createGuardian(app.db, {
              tenantId,
              name: body.guardianName,
              phone: body.guardianPhone,
            }));
          guardianId = guardian.id;
        }

        const student = await peopleRepo.createStudent(app.db, {
          tenantId,
          guardianId,
          name: body.name,
          grade: body.grade,
          school: body.school,
          status: body.status,
        });
        return { student };
      },
    );

    app.patch(
      '/v1/tenants/:tenantId/students/:studentId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, studentId } = request.params as {
          tenantId: string;
          studentId: string;
        };
        await requireTenant(app.db, tenantId);
        const body = studentUpdateSchema.parse(request.body);
        const student = await peopleRepo.updateStudent(app.db, tenantId, studentId, body);
        if (!student) throw notFound('Student not found');
        return { student };
      },
    );
  },
};
