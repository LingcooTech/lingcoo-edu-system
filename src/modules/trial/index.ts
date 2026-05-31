import { z } from 'zod';

import * as trialRepo from '../../db/repositories/trial.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import { readPublicProfile } from '../../lib/public-profile.js';
import type { AppModule } from '../types.js';

const trialSessionSchema = z.object({
  campusId: z.string(),
  courseId: z.string(),
  title: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive(),
  status: z.enum(['open', 'closed', 'cancelled']).default('open'),
});

const trialSessionUpdateSchema = trialSessionSchema.partial();

const registrationSchema = z.object({
  courseId: z.string().optional(),
  trialSessionId: z.string().optional(),
  guardianName: z.string().min(1),
  phone: z.string().min(6),
  studentName: z.string().min(1),
  grade: z.string().min(1),
  source: z.string().default('unknown'),
  // Attribution forwarded from the scanned QR landing URL.
  campaign: z.string().optional(),
  course: z.string().optional(),
  medium: z.string().optional(),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function normalizeTrialSessionPatch(body: z.infer<typeof trialSessionUpdateSchema>) {
  return {
    ...body,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
  };
}

async function attachPackageSummary(
  app: Parameters<AppModule['register']>[0],
  courses: Awaited<ReturnType<typeof catalogRepo.listPublishedCourses>>,
) {
  const packages = await packagesRepo.listActivePackages(app.db);
  return courses.map((course) => {
    const coursePackages = packages.filter((item) => item.courseId === course.id);
    const prices = coursePackages.map((item) => item.priceAmount);
    return {
      ...course,
      packageCount: coursePackages.length,
      startingPriceAmount: prices.length > 0 ? Math.min(...prices) : null,
    };
  });
}

export const trialModule: AppModule = {
  name: 'trial',
  async register(app) {
    app.get('/public/home', async () => {
      const organization = await organizationRepo.requireOrganization(app.db);

      const [courses, trialSessions, campuses] = await Promise.all([
        catalogRepo.listPublishedCourses(app.db),
        trialRepo.listOpenTrialSessions(app.db),
        organizationRepo.listCampuses(app.db),
      ]);
      const featuredCourses = await attachPackageSummary(app, courses);
      return {
        organization: {
          id: organization.id,
          name: organization.name,
          brandName: organization.brandName,
          phone: organization.phone,
          address: organization.address,
          publicProfile: readPublicProfile(organization.settings),
        },
        featuredCourses,
        trialSessions,
        campuses,
      };
    });

    app.get('/public/courses', async () => {
      const courses = await catalogRepo.listPublishedCourses(app.db);
      return { courses: await attachPackageSummary(app, courses) };
    });

    app.get('/public/trial-sessions', async () => {
      return { trialSessions: await trialRepo.listOpenTrialSessions(app.db) };
    });

    app.post('/public/trial-registrations', async (request) => {
      const body = registrationSchema.parse(request.body);
      const campusId = await trialRepo.firstCampusId(app.db);

      // Prefer the explicit form selection; fall back to the course slug carried
      // in the QR attribution when the form had no course picker.
      let courseId = body.courseId ?? null;
      if (!courseId && body.course) {
        const course = await catalogRepo.findPublishedCourseBySlug(app.db, body.course);
        courseId = course?.id ?? null;
      }

      const { channelId, campaignId } = await crmRepo.resolveAttribution(app.db, {
        source: body.source,
        campaignCode: body.campaign,
      });

      const lead = await crmRepo.createLead(app.db, {
        campusId,
        courseId: courseId ?? undefined,
        trialSessionId: body.trialSessionId,
        guardianName: body.guardianName,
        phone: body.phone,
        studentName: body.studentName,
        grade: body.grade,
        source: body.source,
        channelId,
        campaignId,
        medium: body.medium ?? null,
        status: body.trialSessionId ? 'trial_booked' : 'new',
      });

      if (body.trialSessionId) {
        await trialRepo.incrementBookedCount(app.db, body.trialSessionId);
      }

      return { lead, message: '预约成功，我们会尽快联系您确认上课时间。' };
    });

    app.get('/v1/trial-sessions', { preHandler: app.requireAdmin }, async () => {
      return { trialSessions: await trialRepo.listTrialSessions(app.db) };
    });

    app.post('/v1/trial-sessions', { preHandler: app.requireAdmin }, async (request) => {
      const body = trialSessionSchema.parse(request.body);
      await catalogRepo.requireCourse(app.db, body.courseId);

      const trialSession = await trialRepo.createTrialSession(app.db, {
        campusId: body.campusId,
        courseId: body.courseId,
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        capacity: body.capacity,
        status: body.status,
        bookedCount: 0,
      });
      return { trialSession };
    });

    app.patch(
      '/v1/trial-sessions/:trialSessionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { trialSessionId } = request.params as {
          trialSessionId: string;
        };
        const body = trialSessionUpdateSchema.parse(request.body);
        if (body.courseId) {
          await catalogRepo.requireCourse(app.db, body.courseId);
        }
        const trialSession = await trialRepo.updateTrialSession(
          app.db,
          trialSessionId,
          normalizeTrialSessionPatch(body),
        );
        if (!trialSession) throw notFound('Trial session not found');
        return { trialSession };
      },
    );

    app.delete(
      '/v1/trial-sessions/:trialSessionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { trialSessionId } = request.params as {
          trialSessionId: string;
        };
        const trialSession = await trialRepo.cancelTrialSession(app.db, trialSessionId);
        if (!trialSession) throw notFound('Trial session not found');
        return { trialSession };
      },
    );
  },
};
