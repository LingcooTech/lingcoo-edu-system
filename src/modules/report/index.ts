import * as crmRepo from '../../db/repositories/crm.js';
import * as tenantRepo from '../../db/repositories/tenant.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

export const reportModule: AppModule = {
  name: 'report',
  async register(app) {
    app.get(
      '/v1/tenants/:tenantId/reports/funnel',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);

        const [leads, channels] = await Promise.all([
          crmRepo.listLeads(app.db, tenantId),
          tenantRepo.listChannels(app.db, tenantId),
        ]);

        return {
          funnel: {
            new: leads.filter((lead) => lead.status === 'new').length,
            contacted: leads.filter((lead) => lead.status === 'contacted').length,
            trialBooked: leads.filter((lead) => lead.status === 'trial_booked').length,
            trialAttended: leads.filter((lead) => lead.status === 'trial_attended').length,
            paid: leads.filter((lead) => lead.status === 'paid').length,
          },
          bySource: channels.map((channel) => {
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
