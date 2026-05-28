import { requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

export const reportModule: AppModule = {
  name: 'report',
  async register(app) {
    app.get(
      '/v1/tenants/:tenantId/reports/funnel',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        const leads = store.leads.filter((lead) => lead.tenantId === tenantId);

        return {
          funnel: {
            new: leads.filter((lead) => lead.status === 'new').length,
            contacted: leads.filter((lead) => lead.status === 'contacted').length,
            trialBooked: leads.filter((lead) => lead.status === 'trial_booked').length,
            trialAttended: leads.filter((lead) => lead.status === 'trial_attended').length,
            paid: leads.filter((lead) => lead.status === 'paid').length,
          },
          bySource: store.channels.map((channel) => {
            const sourceLeads = leads.filter((lead) => lead.source === channel.code);
            return {
              source: channel.code,
              name: channel.name,
              leads: sourceLeads.length,
              paid: sourceLeads.filter((lead) => lead.status === 'paid').length,
            };
          }),
        };
      },
    );
  },
};
