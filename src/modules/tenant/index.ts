import { store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

export const tenantModule: AppModule = {
  name: 'tenant',
  async register(app) {
    app.get('/v1/tenants', { preHandler: app.authenticate }, async (request) => {
      const subject = (request.user as { sub: string }).sub;
      const tenantIds = store.memberships
        .filter((membership) => membership.userId === subject)
        .map((membership) => membership.tenantId);

      return {
        tenants: store.tenants.filter((tenant) => tenantIds.includes(tenant.id)),
      };
    });

    app.get(
      '/v1/tenants/:tenantId/dashboard',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        const leads = store.leads.filter((item) => item.tenantId === tenantId);
        const paidOrders = store.orders.filter(
          (item) => item.tenantId === tenantId && item.status === 'paid',
        );

        return {
          metrics: {
            totalLeads: leads.length,
            pendingFollowUps: leads.filter((item) => ['new', 'follow_up'].includes(item.status))
              .length,
            bookedTrials: leads.filter((item) => item.status === 'trial_booked').length,
            paidStudents: store.students.filter((item) => item.tenantId === tenantId).length,
            monthlyRevenue: paidOrders.reduce((sum, order) => sum + order.paidAmount, 0),
            lowLessonAccounts: store.lessonAccounts.filter(
              (item) => item.tenantId === tenantId && item.balance <= 3,
            ).length,
          },
          todaySessions: store.classSessions
            .filter((item) => item.tenantId === tenantId)
            .slice(0, 5),
        };
      },
    );
  },
};
