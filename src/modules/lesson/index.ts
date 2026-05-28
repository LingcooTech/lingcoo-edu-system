import { requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

export const lessonModule: AppModule = {
  name: 'lesson',
  async register(app) {
    app.get(
      '/v1/tenants/:tenantId/lesson-accounts',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        return {
          lessonAccounts: store.lessonAccounts
            .filter((account) => account.tenantId === tenantId)
            .map((account) => ({
              ...account,
              student: store.students.find((student) => student.id === account.studentId),
              course: store.courses.find((course) => course.id === account.courseId),
            })),
        };
      },
    );

    app.get(
      '/v1/tenants/:tenantId/lesson-transactions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        return {
          lessonTransactions: store.lessonTransactions.filter(
            (transaction) => transaction.tenantId === tenantId,
          ),
        };
      },
    );
  },
};
