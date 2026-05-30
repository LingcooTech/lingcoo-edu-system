import { z } from 'zod';
import QRCode from 'qrcode';

import * as marketingRepo from '../../db/repositories/marketing.js';
import type { Campaign } from '../../db/repositories/marketing.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

const channelSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/, 'code 只能包含小写字母、数字、下划线和连字符'),
  name: z.string().min(1).max(120),
});

const channelUpdateSchema = channelSchema.partial();

const campaignSchema = z.object({
  channelId: z.string().uuid(),
  code: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9_-]+$/, 'code 只能包含小写字母、数字、下划线和连字符'),
  name: z.string().min(1).max(160),
  courseSlug: z.string().max(120).optional(),
  medium: z.string().max(40).default('qr_code'),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
});

const campaignUpdateSchema = campaignSchema.partial();

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

// Builds the public landing URL a campaign's QR code resolves to. Parents who
// scan it arrive on the course (or home) page carrying the attribution params
// that the registration form forwards back to the lead.
function buildLandingUrl(baseUrl: string, channelCode: string | null, campaign: Campaign): string {
  const path = campaign.courseSlug ? `/courses/${campaign.courseSlug}` : '/';
  const params = new URLSearchParams();
  if (channelCode) params.set('source', channelCode);
  params.set('campaign', campaign.code);
  params.set('medium', campaign.medium);
  if (campaign.courseSlug) params.set('course', campaign.courseSlug);
  return `${baseUrl.replace(/\/$/, '')}${path}?${params.toString()}`;
}

export const marketingModule: AppModule = {
  name: 'marketing',
  async register(app) {
    // --- Channels (渠道) ---

    app.get('/v1/tenants/:tenantId/channels', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      return { channels: await marketingRepo.listChannels(app.db, tenantId) };
    });

    app.post(
      '/v1/tenants/:tenantId/channels',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = channelSchema.parse(request.body);
        const channel = await marketingRepo.createChannel(app.db, { tenantId, ...body });
        return { channel };
      },
    );

    app.patch(
      '/v1/tenants/:tenantId/channels/:channelId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, channelId } = request.params as { tenantId: string; channelId: string };
        await requireTenant(app.db, tenantId);
        const body = channelUpdateSchema.parse(request.body);
        const channel = await marketingRepo.updateChannel(app.db, tenantId, channelId, body);
        if (!channel) throw notFound('Channel not found');
        return { channel };
      },
    );

    // --- Campaigns (活动) ---

    app.get(
      '/v1/tenants/:tenantId/campaigns',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return { campaigns: await marketingRepo.listCampaigns(app.db, tenantId) };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/campaigns',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = campaignSchema.parse(request.body);
        const channel = await marketingRepo.findChannel(app.db, tenantId, body.channelId);
        if (!channel) throw notFound('Channel not found');
        const campaign = await marketingRepo.createCampaign(app.db, { tenantId, ...body });
        return { campaign };
      },
    );

    app.patch(
      '/v1/tenants/:tenantId/campaigns/:campaignId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, campaignId } = request.params as {
          tenantId: string;
          campaignId: string;
        };
        await requireTenant(app.db, tenantId);
        const body = campaignUpdateSchema.parse(request.body);
        if (body.channelId) {
          const channel = await marketingRepo.findChannel(app.db, tenantId, body.channelId);
          if (!channel) throw notFound('Channel not found');
        }
        const campaign = await marketingRepo.updateCampaign(app.db, tenantId, campaignId, body);
        if (!campaign) throw notFound('Campaign not found');
        return { campaign };
      },
    );

    // Generates the QR code (PNG data URL) + the landing URL for a campaign.
    app.get(
      '/v1/tenants/:tenantId/campaigns/:campaignId/qrcode',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, campaignId } = request.params as {
          tenantId: string;
          campaignId: string;
        };
        await requireTenant(app.db, tenantId);
        const campaign = await marketingRepo.requireCampaign(app.db, tenantId, campaignId);
        const channel = await marketingRepo.findChannel(app.db, tenantId, campaign.channelId);
        const landingUrl = buildLandingUrl(
          app.appEnv.PUBLIC_WEB_BASE_URL,
          channel?.code ?? null,
          campaign,
        );
        const qrCodeDataUrl = await QRCode.toDataURL(landingUrl, { margin: 1, width: 320 });
        return { landingUrl, qrCodeDataUrl };
      },
    );
  },
};
