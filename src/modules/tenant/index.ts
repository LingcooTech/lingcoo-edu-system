import * as tenantRepo from '../../db/repositories/tenant.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import type { AppModule } from '../types.js';

export const tenantModule: AppModule = {
  name: 'tenant',
  async register(app) {
    app.get('/v1/tenants', { preHandler: app.authenticate }, async (request) => {
      const subject = (request.user as { sub: string }).sub;
      return { tenants: await tenantRepo.listTenantsForUser(app.db, subject) };
    });

    app.get(
      '/v1/tenants/:tenantId/dashboard',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };

        const [leads, students, accounts, sessions, monthlyRevenue] = await Promise.all([
          crmRepo.listLeads(app.db, tenantId),
          peopleRepo.listStudents(app.db, tenantId),
          lessonRepo.listLessonAccounts(app.db, tenantId),
          schedulingRepo.listClassSessions(app.db, tenantId),
          financeRepo.sumPaidRevenue(app.db, tenantId),
        ]);

        return {
          metrics: {
            totalLeads: leads.length,
            pendingFollowUps: leads.filter((item) => ['new', 'follow_up'].includes(item.status))
              .length,
            bookedTrials: leads.filter((item) => item.status === 'trial_booked').length,
            paidStudents: students.length,
            monthlyRevenue,
            lowLessonAccounts: accounts.filter((item) => item.balance <= 3).length,
          },
          todaySessions: sessions.slice(0, 5),
        };
      },
    );
  },
};
