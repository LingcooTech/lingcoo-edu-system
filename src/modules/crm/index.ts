import QRCode from 'qrcode';
import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as crmRepo from '../../db/repositories/crm.js';
import type { Campaign } from '../../db/repositories/crm.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as trialRepo from '../../db/repositories/trial.js';
import type { AppModule } from '../types.js';

const leadStatuses = [
  'new',
  'contacted',
  'trial_booked',
  'trial_attended',
  'paid',
  'follow_up',
  'invalid',
] as const;

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

const leadRegistrationSchema = z.object({
  courseId: z.string().uuid().optional(),
  trialSessionId: z.string().uuid().optional(),
  guardianName: z.string().min(1).max(120),
  phone: z.string().min(6).max(40),
  studentName: z.string().min(1).max(120),
  grade: z.string().min(1).max(80),
  source: z.string().max(80).optional(),
  campaign: z.string().max(80).optional(),
  course: z.string().max(120).optional(),
  medium: z.string().max(40).optional(),
});

const statusSchema = z.object({
  status: z.enum(leadStatuses),
});

const followUpSchema = z.object({
  content: z.string().min(1),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional(),
});

const trialBookingSchema = z.object({
  trialSessionId: z.string().uuid(),
});

const trialCheckInSchema = z.object({
  feedback: z.string().min(1).max(2000).optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional(),
});

const convertSchema = z.object({
  school: z.string().optional(),
});

const referralSchema = leadRegistrationSchema.omit({ campaign: true, course: true }).extend({
  campaignId: z.string().uuid().optional(),
  campaign: z.string().max(80).optional(),
  source: z.string().max(80).default('referral'),
  medium: z.string().max(40).default('referral'),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function unprocessable(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function buildLandingUrl(baseUrl: string, channelCode: string | null, campaign: Campaign): string {
  const path = campaign.courseSlug ? `/courses/${campaign.courseSlug}` : '/';
  const params = new URLSearchParams();
  if (channelCode) params.set('source', channelCode);
  params.set('campaign', campaign.code);
  params.set('medium', campaign.medium);
  if (campaign.courseSlug) params.set('course', campaign.courseSlug);
  return `${baseUrl.replace(/\/$/, '')}${path}?${params.toString()}`;
}

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

async function resolveCourseId(
  app: Parameters<AppModule['register']>[0],
  input: {
    courseId?: string;
    course?: string;
    campaign?: Campaign | null;
    trialSessionId?: string;
  },
) {
  if (input.trialSessionId) {
    const trialSession = await trialRepo.requireTrialSession(app.db, input.trialSessionId);
    return {
      campusId: trialSession.campusId,
      courseId: trialSession.courseId,
      trialSession,
    };
  }

  if (input.courseId) {
    await catalogRepo.requireCourse(app.db, input.courseId);
    return { campusId: await trialRepo.firstCampusId(app.db), courseId: input.courseId };
  }

  const courseSlug = input.course ?? input.campaign?.courseSlug ?? null;
  if (courseSlug) {
    const course = await catalogRepo.findPublishedCourseBySlug(app.db, courseSlug);
    if (course) {
      return {
        campusId: course.campusId ?? (await trialRepo.firstCampusId(app.db)),
        courseId: course.id,
      };
    }
  }

  return { campusId: await trialRepo.firstCampusId(app.db), courseId: null };
}

async function createLeadFromRegistration(
  app: Parameters<AppModule['register']>[0],
  input: z.infer<typeof leadRegistrationSchema>,
  requiredCampaign?: Campaign,
) {
  const campaign =
    requiredCampaign ??
    (input.campaign ? await crmRepo.requireActiveCampaignByCode(app.db, input.campaign) : null);
  const channel = campaign ? await crmRepo.findChannel(app.db, campaign.channelId) : null;
  const attribution = campaign
    ? { channelId: campaign.channelId, campaignId: campaign.id }
    : await crmRepo.resolveAttribution(app.db, {
        source: input.source,
        campaignCode: input.campaign,
      });
  const courseResolution = await resolveCourseId(app, {
    courseId: input.courseId,
    course: input.course,
    campaign,
    trialSessionId: input.trialSessionId,
  });

  if (courseResolution.trialSession && courseResolution.trialSession.status !== 'open') {
    throw unprocessable('Trial session is not open');
  }

  const lead = await crmRepo.createLead(app.db, {
    campusId: courseResolution.campusId,
    courseId: courseResolution.courseId ?? undefined,
    trialSessionId: input.trialSessionId,
    guardianName: input.guardianName,
    phone: input.phone,
    studentName: input.studentName,
    grade: input.grade,
    source: input.source ?? channel?.code ?? 'unknown',
    channelId: attribution.channelId,
    campaignId: attribution.campaignId,
    medium: input.medium ?? campaign?.medium ?? null,
    status: input.trialSessionId ? 'trial_booked' : 'new',
  });

  if (input.trialSessionId) {
    await trialRepo.incrementBookedCount(app.db, input.trialSessionId);
  }

  return lead;
}

async function convertLeadToStudent(
  app: Parameters<AppModule['register']>[0],
  leadId: string,
  input: z.infer<typeof convertSchema>,
) {
  const lead = await crmRepo.requireLead(app.db, leadId);

  let guardian = await peopleRepo.findGuardianByPhone(app.db, lead.phone);
  if (!guardian) {
    guardian = await peopleRepo.createGuardian(app.db, {
      name: lead.guardianName,
      phone: lead.phone,
    });
  }

  let student = await peopleRepo.findStudentForGuardian(app.db, {
    guardianId: guardian.id,
    name: lead.studentName,
  });
  if (!student) {
    student = await peopleRepo.createStudent(app.db, {
      guardianId: guardian.id,
      name: lead.studentName,
      grade: lead.grade,
      school: input.school,
      status: 'active',
    });
  }

  const updatedLead = await crmRepo.updateLead(app.db, leadId, {
    convertedStudentId: student.id,
    status: 'paid',
  });

  return { guardian, student, lead: updatedLead };
}

export const crmModule: AppModule = {
  name: 'crm',
  async register(app) {
    function registerChannelRoutes(prefix: string) {
      app.get(`${prefix}/channels`, { preHandler: app.requireAdmin }, async () => {
        return { channels: await crmRepo.listChannels(app.db) };
      });

      app.post(`${prefix}/channels`, { preHandler: app.requireAdmin }, async (request) => {
        const body = channelSchema.parse(request.body);
        const channel = await crmRepo.createChannel(app.db, body);
        return { channel };
      });

      app.patch(
        `${prefix}/channels/:channelId`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { channelId } = request.params as { channelId: string };
          const body = channelUpdateSchema.parse(request.body);
          const channel = await crmRepo.updateChannel(app.db, channelId, body);
          if (!channel) throw notFound('Channel not found');
          return { channel };
        },
      );
    }

    function registerCampaignRoutes(prefix: string) {
      app.get(`${prefix}/campaigns`, { preHandler: app.requireAdmin }, async () => {
        return { campaigns: await crmRepo.listCampaigns(app.db) };
      });

      app.post(`${prefix}/campaigns`, { preHandler: app.requireAdmin }, async (request) => {
        const body = campaignSchema.parse(request.body);
        const channel = await crmRepo.findChannel(app.db, body.channelId);
        if (!channel) throw notFound('Channel not found');
        const campaign = await crmRepo.createCampaign(app.db, body);
        return { campaign };
      });

      app.patch(
        `${prefix}/campaigns/:campaignId`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { campaignId } = request.params as { campaignId: string };
          const body = campaignUpdateSchema.parse(request.body);
          if (body.channelId) {
            const channel = await crmRepo.findChannel(app.db, body.channelId);
            if (!channel) throw notFound('Channel not found');
          }
          const campaign = await crmRepo.updateCampaign(app.db, campaignId, body);
          if (!campaign) throw notFound('Campaign not found');
          return { campaign };
        },
      );

      app.get(
        `${prefix}/campaigns/:campaignId/qrcode`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { campaignId } = request.params as { campaignId: string };
          const campaign = await crmRepo.requireCampaign(app.db, campaignId);
          const channel = await crmRepo.findChannel(app.db, campaign.channelId);
          const landingUrl = buildLandingUrl(
            app.appEnv.PUBLIC_WEB_BASE_URL,
            channel?.code ?? null,
            campaign,
          );
          const qrCodeDataUrl = await QRCode.toDataURL(landingUrl, { margin: 1, width: 320 });
          return { landingUrl, qrCodeDataUrl };
        },
      );
    }

    function registerLeadRoutes(prefix: string) {
      app.get(`${prefix}/leads`, { preHandler: app.requireAdmin }, async () => {
        return { leads: await crmRepo.listLeads(app.db) };
      });

      app.patch(
        `${prefix}/leads/:leadId/status`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const body = statusSchema.parse(request.body);
          await crmRepo.requireLead(app.db, leadId);
          const lead = await crmRepo.updateLead(app.db, leadId, { status: body.status });
          return { lead };
        },
      );

      app.post(
        `${prefix}/leads/:leadId/follow-ups`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          await crmRepo.requireLead(app.db, leadId);
          const body = followUpSchema.parse(request.body);
          const nextFollowUpAt = toDate(body.nextFollowUpAt);
          const followUp = await crmRepo.addFollowUp(app.db, {
            leadId,
            content: body.content,
            nextFollowUpAt,
          });
          const lead = await crmRepo.updateLead(app.db, leadId, {
            nextFollowUpAt,
            status: 'follow_up',
          });

          return { followUp, lead };
        },
      );

      app.get(
        `${prefix}/leads/:leadId/follow-ups`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          await crmRepo.requireLead(app.db, leadId);
          return { followUps: await crmRepo.listFollowUps(app.db, leadId) };
        },
      );

      app.post(
        `${prefix}/leads/:leadId/trial-booking`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const body = trialBookingSchema.parse(request.body);
          const [lead, trialSession] = await Promise.all([
            crmRepo.requireLead(app.db, leadId),
            trialRepo.requireTrialSession(app.db, body.trialSessionId),
          ]);
          if (trialSession.status !== 'open') {
            throw unprocessable('Trial session is not open');
          }
          if (lead.trialSessionId !== trialSession.id) {
            await trialRepo.incrementBookedCount(app.db, trialSession.id);
          }
          const updatedLead = await crmRepo.updateLead(app.db, leadId, {
            campusId: trialSession.campusId,
            courseId: trialSession.courseId,
            trialSessionId: trialSession.id,
            status: 'trial_booked',
          });
          return { lead: updatedLead, trialSession };
        },
      );

      app.post(
        `${prefix}/leads/:leadId/trial-check-in`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const body = trialCheckInSchema.parse(request.body);
          const lead = await crmRepo.requireLead(app.db, leadId);
          if (!lead.trialSessionId) {
            throw unprocessable('Lead has no trial booking');
          }
          const nextFollowUpAt = toDate(body.nextFollowUpAt);
          const followUp = await crmRepo.addFollowUp(app.db, {
            leadId,
            content: body.feedback ? `试听到店核销：${body.feedback}` : '试听到店核销',
            nextFollowUpAt,
          });
          const updatedLead = await crmRepo.updateLead(app.db, leadId, {
            nextFollowUpAt,
            status: 'trial_attended',
          });
          return { followUp, lead: updatedLead };
        },
      );

      app.post(
        `${prefix}/leads/:leadId/convert`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const body = convertSchema.parse(request.body);
          return convertLeadToStudent(app, leadId, body);
        },
      );

      app.post(
        `${prefix}/leads/:leadId/contract`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const body = convertSchema.parse(request.body);
          return convertLeadToStudent(app, leadId, body);
        },
      );

      app.post(
        `${prefix}/leads/:leadId/referrals`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const referrer = await crmRepo.requireLead(app.db, leadId);
          const body = referralSchema.parse(request.body);
          const campaign = body.campaignId
            ? await crmRepo.requireCampaign(app.db, body.campaignId)
            : body.campaign
              ? await crmRepo.requireActiveCampaignByCode(app.db, body.campaign)
              : null;
          const lead = await createLeadFromRegistration(
            app,
            {
              ...body,
              source: body.source,
              campaign: campaign?.code,
              courseId: body.courseId ?? referrer.courseId ?? undefined,
              trialSessionId: body.trialSessionId,
            },
            campaign ?? undefined,
          );
          const followUp = await crmRepo.addFollowUp(app.db, {
            leadId: referrer.id,
            content: `推荐新线索：${lead.studentName} / ${lead.guardianName} / ${lead.phone}`,
            nextFollowUpAt: null,
          });
          return { lead, referrer, followUp };
        },
      );

      app.get(
        `${prefix}/leads/:leadId/lifecycle`,
        { preHandler: app.requireAdmin },
        async (request) => {
          const { leadId } = request.params as { leadId: string };
          const lead = await crmRepo.requireLead(app.db, leadId);
          const followUps = await crmRepo.listFollowUps(app.db, leadId);
          const student = lead.convertedStudentId
            ? await peopleRepo.requireStudent(app.db, lead.convertedStudentId)
            : null;
          return { lead, followUps, student };
        },
      );
    }

    registerChannelRoutes('/v1');
    registerChannelRoutes('/v1/crm');
    registerCampaignRoutes('/v1');
    registerCampaignRoutes('/v1/crm');
    registerLeadRoutes('/v1');
    registerLeadRoutes('/v1/crm');

    app.post('/public/crm/campaigns/:campaignCode/participations', async (request) => {
      const { campaignCode } = request.params as { campaignCode: string };
      const body = leadRegistrationSchema.omit({ campaign: true }).parse(request.body);
      const campaign = await crmRepo.requireActiveCampaignByCode(app.db, campaignCode);
      const lead = await createLeadFromRegistration(app, body, campaign);
      return { lead, message: '预约成功，我们会尽快联系您确认上课时间。' };
    });
  },
};
