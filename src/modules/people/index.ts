import { requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

export const peopleModule: AppModule = {
  name: 'people',
  async register(app) {
    app.get(
      '/v1/tenants/:tenantId/guardians',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        return { guardians: store.guardians.filter((guardian) => guardian.tenantId === tenantId) };
      },
    );

    app.get('/v1/tenants/:tenantId/students', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      return {
        students: store.students
          .filter((student) => student.tenantId === tenantId)
          .map((student) => ({
            ...student,
            guardian: store.guardians.find((guardian) => guardian.id === student.guardianId),
            lessonAccounts: store.lessonAccounts.filter(
              (account) => account.studentId === student.id,
            ),
          })),
      };
    });
  },
};
