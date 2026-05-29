import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

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
  },
};
