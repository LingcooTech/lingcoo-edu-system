import * as organizationRepo from '../../db/repositories/organization.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import {
  mergePublicProfile,
  normalizePublicProfile,
  readPublicProfile,
} from '../../lib/public-profile.js';
import { z } from 'zod';
import type { AppModule } from '../types.js';

const publicProfileSchema = z.object({
  headline: z.string().max(120).optional(),
  introduction: z.string().max(1000).optional(),
  highlights: z.array(z.string().min(1).max(120)).max(6).optional(),
  promises: z.array(z.string().min(1).max(120)).max(6).optional(),
});

const brandingSchema = z
  .object({
    fullLogoUrl: z.string().max(500).optional(),
    squareLogoUrl: z.string().max(500).optional(),
    logoUrl: z.string().max(500).optional(),
    darkLogoUrl: z.string().max(500).optional(),
    faviconUrl: z.string().max(500).optional(),
    primaryColor: z.string().max(40).optional(),
    secondaryColor: z.string().max(40).optional(),
    backgroundColor: z.string().max(40).optional(),
    cardColor: z.string().max(40).optional(),
    textColor: z.string().max(40).optional(),
    headingFont: z.string().max(120).optional(),
    bodyFont: z.string().max(120).optional(),
    radius: z.string().max(40).optional(),
  })
  .optional();

const organizationSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  brandName: z.string().min(1).max(160).optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  publicProfile: publicProfileSchema.optional(),
  branding: brandingSchema,
});

const campusSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(255).optional().nullable(),
});

const campusUpdateSchema = campusSchema.partial();

function readSettings(settings: unknown) {
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

export const organizationModule: AppModule = {
  name: 'organization',
  async register(app) {
    app.get('/v1/organization', { preHandler: app.requireAdmin }, async () => {
      const organization = await organizationRepo.requireOrganization(app.db);
      const settings = readSettings(organization.settings);

      return {
        organization: {
          ...organization,
          publicProfile: readPublicProfile(settings),
          branding: settings.branding ?? {},
        },
      };
    });

    app.put('/v1/organization', { preHandler: app.requireAdmin }, async (request) => {
      const organization = await organizationRepo.requireOrganization(app.db);
      const body = organizationSchema.parse(request.body);
      let settings = readSettings(organization.settings);

      if (body.publicProfile) {
        const publicProfile = normalizePublicProfile(body.publicProfile);
        settings = mergePublicProfile(settings, publicProfile);
      }
      if (body.branding !== undefined) {
        settings = { ...settings, branding: body.branding ?? {} };
      }

      const updated = await organizationRepo.updateOrganization(app.db, {
        name: body.name,
        brandName: body.brandName,
        phone: body.phone,
        address: body.address,
        settings,
      });

      return {
        organization: {
          ...updated,
          publicProfile: readPublicProfile(updated.settings),
          branding: readSettings(updated.settings).branding ?? {},
        },
      };
    });

    app.get('/v1/campuses', { preHandler: app.requireAdmin }, async () => {
      return { campuses: await organizationRepo.listCampuses(app.db) };
    });

    app.post('/v1/campuses', { preHandler: app.requireAdmin }, async (request) => {
      const body = campusSchema.parse(request.body);
      const campus = await organizationRepo.createCampus(app.db, {
        name: body.name.trim(),
        address: body.address?.trim() || null,
      });
      return { campus };
    });

    app.patch('/v1/campuses/:campusId', { preHandler: app.requireAdmin }, async (request) => {
      const { campusId } = request.params as { campusId: string };
      const body = campusUpdateSchema.parse(request.body);
      const campus = await organizationRepo.updateCampus(app.db, campusId, {
        name: body.name?.trim(),
        address: body.address === undefined ? undefined : body.address?.trim() || null,
      });
      if (!campus) {
        throw Object.assign(new Error('Campus not found'), { statusCode: 404 });
      }
      return { campus };
    });

    app.get('/v1/dashboard', { preHandler: app.requireAdmin }, async () => {
      const [leads, students, accounts, sessions, classes, campaigns, monthlyRevenue] =
        await Promise.all([
          crmRepo.listLeads(app.db),
          peopleRepo.listStudents(app.db),
          lessonRepo.listLessonAccounts(app.db),
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          crmRepo.listCampaigns(app.db),
          financeRepo.sumPaidRevenue(app.db),
        ]);
      const classById = new Map(classes.map((item) => [item.id, item]));

      return {
        metrics: {
          totalLeads: leads.length,
          pendingFollowUps: leads.filter((item) => ['new', 'follow_up'].includes(item.status))
            .length,
          bookedTrials: leads.filter((item) => item.status === 'trial_booked').length,
          paidStudents: students.length,
          monthlyRevenue,
          lowLessonAccounts: accounts.filter((item) => item.balance <= 3).length,
          attributedLeads: leads.filter((item) => item.channelId || item.campaignId).length,
          activeCampaigns: campaigns.filter((item) => item.status === 'active').length,
        },
        todaySessions: sessions.slice(0, 5).map((session) => ({
          ...session,
          class: classById.get(session.classId),
        })),
      };
    });
  },
};
