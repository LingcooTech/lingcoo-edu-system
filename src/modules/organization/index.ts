import * as organizationRepo from '../../db/repositories/organization.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import {
  mergeBusinessModel,
  normalizeBusinessModel,
  readBusinessModel,
} from '../../lib/business-model.js';
import {
  mergePublicProfile,
  normalizePublicProfile,
  readPublicProfile,
} from '../../lib/public-profile.js';
import { mergePublicSite, normalizePublicSite, readPublicSite } from '../../lib/public-site.js';
import { z } from 'zod';
import type { AppModule } from '../types.js';

const publicProfileSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  highlightsTitle: z.string().max(80).optional(),
  highlights: z
    .array(
      z.union([
        z.string().min(1).max(120),
        z.object({
          icon: z.string().max(40).optional(),
          title: z.string().max(40).optional(),
          text: z.string().min(1).max(160),
          imageUrl: z.string().max(500).optional(),
        }),
      ]),
    )
    .max(6)
    .optional(),
  bannerImages: z.array(z.string().min(1).max(500)).max(12).optional(),
  miniBannerImages: z.array(z.string().min(1).max(500)).max(12).optional(),
  bannerImageUrl: z.string().max(500).optional(),
  bannerTitle: z.string().max(120).optional(),
  bannerSubtitle: z.string().max(240).optional(),
  ctaText: z.string().max(40).optional(),
  ctaLink: z.string().max(160).optional(),
  secondaryCtaText: z.string().max(40).optional(),
  secondaryCtaLink: z.string().max(160).optional(),
  stats: z.array(z.string().min(1).max(80)).max(6).optional(),
  testimonials: z
    .array(
      z.union([
        z.string().min(1).max(240),
        z.object({
          name: z.string().max(80).optional(),
          avatarUrl: z.string().max(500).optional(),
          content: z.string().min(1).max(240),
        }),
      ]),
    )
    .max(8)
    .optional(),
  studentStories: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        studentName: z.string().max(80).optional(),
        summary: z.string().max(240).optional(),
        coverImageUrl: z.string().max(500).optional(),
        content: z.string().max(4000).optional(),
      }),
    )
    .max(8)
    .optional(),
  contentMarketingTitle: z.string().max(80).optional(),
  growthLoop: z
    .object({
      eyebrow: z.string().max(60).optional(),
      title: z.string().max(120).optional(),
      summary: z.string().max(240).optional(),
      primaryCtaText: z.string().max(40).optional(),
      primaryCtaLink: z.string().max(160).optional(),
      secondaryCtaText: z.string().max(40).optional(),
      secondaryCtaLink: z.string().max(160).optional(),
      backgroundColor: z.string().max(40).optional(),
      backgroundImageUrl: z.string().max(500).optional(),
      steps: z
        .array(
          z.object({
            icon: z.string().max(40).optional(),
            title: z.string().min(1).max(60),
          }),
        )
        .max(8)
        .optional(),
    })
    .optional(),
  businessHours: z.string().max(120).optional(),
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

const publicSiteSchema = z
  .object({
    navigation: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          path: z.string().min(1).max(160),
          visible: z.boolean().optional(),
        }),
      )
      .max(12)
      .optional(),
    pages: z
      .object({
        courses: z
          .object({
            eyebrow: z.string().max(80).optional(),
            title: z.string().max(120).optional(),
            subtitle: z.string().max(240).optional(),
            seoTitle: z.string().max(120).optional(),
          })
          .optional(),
        trials: z
          .object({
            eyebrow: z.string().max(80).optional(),
            title: z.string().max(120).optional(),
            subtitle: z.string().max(240).optional(),
            seoTitle: z.string().max(120).optional(),
          })
          .optional(),
        teachers: z
          .object({
            eyebrow: z.string().max(80).optional(),
            title: z.string().max(120).optional(),
            subtitle: z.string().max(240).optional(),
            seoTitle: z.string().max(120).optional(),
          })
          .optional(),
        stories: z
          .object({
            eyebrow: z.string().max(80).optional(),
            title: z.string().max(120).optional(),
            subtitle: z.string().max(240).optional(),
            seoTitle: z.string().max(120).optional(),
          })
          .optional(),
      })
      .optional(),
    aboutPage: z
      .object({
        eyebrow: z.string().max(80).optional(),
        title: z.string().max(120).optional(),
        subtitle: z.string().max(240).optional(),
        seoTitle: z.string().max(120).optional(),
        heroImageUrl: z.string().max(500).optional(),
        operatorIntroTitle: z.string().max(80).optional(),
        operatorIntro: z.string().max(5000).optional(),
        brandCooperationTitle: z.string().max(80).optional(),
        brandCooperation: z.string().max(5000).optional(),
        bodyBlocks: z.array(z.unknown()).max(200).optional(),
      })
      .optional(),
    icpNumber: z.string().max(80).optional(),
    icpUrl: z.string().max(160).optional(),
  })
  .optional();

const businessModelSchema = z
  .object({
    onlinePackageSalesEnabled: z.boolean().optional(),
    manualPackageGrantEnabled: z.boolean().optional(),
    packagePriceDisplayEnabled: z.boolean().optional(),
    seatReservationFeeEnabled: z.boolean().optional(),
    courseContractEditEnabled: z.boolean().optional(),
  })
  .optional();

const organizationSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  brandName: z.string().min(1).max(160).optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  publicProfile: publicProfileSchema.optional(),
  branding: brandingSchema,
  publicSite: publicSiteSchema,
  businessModel: businessModelSchema,
});

const campusSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(255).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  environmentImageUrls: z.array(z.string().trim().url().max(500)).max(30).optional(),
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
          publicSite: readPublicSite(settings),
          businessModel: readBusinessModel(settings),
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
      if (body.publicSite !== undefined) {
        settings = mergePublicSite(settings, normalizePublicSite(body.publicSite));
      }
      if (body.businessModel !== undefined) {
        settings = mergeBusinessModel(settings, normalizeBusinessModel(body.businessModel));
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
          publicSite: readPublicSite(updated.settings),
          businessModel: readBusinessModel(updated.settings),
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
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        environmentImageUrls: body.environmentImageUrls ?? [],
      });
      return { campus };
    });

    app.patch('/v1/campuses/:campusId', { preHandler: app.requireAdmin }, async (request) => {
      const { campusId } = request.params as { campusId: string };
      const body = campusUpdateSchema.parse(request.body);
      const campus = await organizationRepo.updateCampus(app.db, campusId, {
        name: body.name?.trim(),
        address: body.address === undefined ? undefined : body.address?.trim() || null,
        latitude: body.latitude,
        longitude: body.longitude,
        environmentImageUrls: body.environmentImageUrls,
      });
      if (!campus) {
        throw Object.assign(new Error('Campus not found'), { statusCode: 404 });
      }
      return { campus };
    });

    app.delete('/v1/campuses/:campusId', { preHandler: app.requireAdmin }, async (request) => {
      const { campusId } = request.params as { campusId: string };
      const campus = await organizationRepo.deleteCampus(app.db, campusId);
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
