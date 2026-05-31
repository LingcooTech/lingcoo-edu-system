import * as crmRepo from '../../db/repositories/crm.js';
import type { Lead } from '../../db/repositories/crm.js';
import * as marketingRepo from '../../db/repositories/marketing.js';
import type { AppModule } from '../types.js';

// Stage counts + new→paid conversion rate for an arbitrary slice of leads.
function funnelOf(leads: Lead[]) {
  const count = (status: Lead['status']) => leads.filter((lead) => lead.status === status).length;
  const total = leads.length;
  const paid = count('paid');
  const trialStarted = count('trial_booked') + count('trial_attended') + paid;
  return {
    total,
    new: count('new'),
    contacted: count('contacted'),
    trialBooked: count('trial_booked'),
    trialAttended: count('trial_attended'),
    paid,
    conversionRate: total > 0 ? Math.round((paid / total) * 1000) / 1000 : 0,
    trialConversionRate:
      trialStarted > 0 ? Math.round((paid / trialStarted) * 1000) / 1000 : 0,
  };
}

export const reportModule: AppModule = {
  name: 'report',
  async register(app) {
    app.get('/v1/reports/funnel', { preHandler: app.requireAdmin }, async () => {
        const [leads, channels, campaigns] = await Promise.all([
          crmRepo.listLeads(app.db),
          marketingRepo.listChannels(app.db),
          marketingRepo.listCampaigns(app.db),
        ]);

        return {
          funnel: {
            new: leads.filter((lead) => lead.status === 'new').length,
            contacted: leads.filter((lead) => lead.status === 'contacted').length,
            trialBooked: leads.filter((lead) => lead.status === 'trial_booked').length,
            trialAttended: leads.filter((lead) => lead.status === 'trial_attended').length,
            paid: leads.filter((lead) => lead.status === 'paid').length,
          },
          // Legacy free-text source breakdown (kept for backward compatibility).
          bySource: channels.map((channel) => {
            const sourceLeads = leads.filter((lead) => lead.source === channel.code);
            return {
              source: channel.code,
              name: channel.name,
              leads: sourceLeads.length,
              paid: sourceLeads.filter((lead) => lead.status === 'paid').length,
            };
          }),
          // Attribution-FK breakdowns (new).
          byChannel: channels.map((channel) => ({
            channelId: channel.id,
            code: channel.code,
            name: channel.name,
            ...funnelOf(
              leads.filter(
                (lead) => lead.channelId === channel.id || (!lead.channelId && lead.source === channel.code),
              ),
            ),
          })),
          byCampaign: campaigns.map((campaign) => {
            const channel = channels.find((item) => item.id === campaign.channelId);
            return {
              campaignId: campaign.id,
              code: campaign.code,
              name: campaign.name,
              channelCode: channel?.code ?? null,
              channelName: channel?.name ?? null,
              courseSlug: campaign.courseSlug,
              medium: campaign.medium,
              status: campaign.status,
              ...funnelOf(
                leads.filter(
                  (lead) =>
                    lead.campaignId === campaign.id ||
                    (!lead.campaignId && lead.source === campaign.code),
                ),
              ),
            };
          }),
        };
    });
  },
};
