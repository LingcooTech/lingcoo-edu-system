import { z } from 'zod';
import QRCode from 'qrcode';
import type { FastifyRequest } from 'fastify';

import * as trialRepo from '../../db/repositories/trial.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as seatReservationRepo from '../../db/repositories/seat-reservations.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as schema from '../../db/schema.js';
import { readBusinessModel, requiresSeatReservationFee } from '../../lib/business-model.js';
import { resolvePublicWebBaseUrl } from '../../lib/public-url.js';
import { readPublicProfile } from '../../lib/public-profile.js';
import { readPublicSite } from '../../lib/public-site.js';
import { sendTrialRegistrationSubscribe } from '../../lib/wechat-mini-subscribe-events.js';
import type { AppModule } from '../types.js';

const trialSessionSchema = z.object({
  campusId: z.string(),
  courseId: z.string(),
  title: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive(),
  reservationFeeAmount: z.number().int().nonnegative().default(0),
  reservationNotice: z.string().default(''),
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

const seatReservationSchema = z.object({
  trialSessionId: z.string(),
  guardianName: z.string().min(1),
  phone: z.string().min(6),
  studentName: z.string().min(1),
  grade: z.string().min(1),
  source: z.string().default('unknown'),
  campaign: z.string().optional(),
  course: z.string().optional(),
  medium: z.string().optional(),
});

const seatReservationRescheduleSchema = z.object({
  trialSessionId: z.string(),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function unprocessable(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function readSettings(settings: unknown) {
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

function normalizeTrialSessionPatch(body: z.infer<typeof trialSessionUpdateSchema>) {
  return {
    ...body,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
  };
}

async function readOptionalParentAccountId(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    return null;
  }
  const payload = request.user as { sub?: unknown; role?: unknown };
  return payload.role === 'parent' && typeof payload.sub === 'string' ? payload.sub : null;
}

async function attachPackageSummary(
  app: Parameters<AppModule['register']>[0],
  courses: Awaited<ReturnType<typeof catalogRepo.listPublishedCourses>>,
  options: { showPackagePrice?: boolean } = {},
) {
  const packages = await packagesRepo.listActivePackages(app.db);
  const showPackagePrice = options.showPackagePrice ?? true;
  return courses.map((course) => {
    const coursePackages = packages.filter((item) => item.courseId === course.id);
    const prices = coursePackages.map((item) => item.priceAmount);
    return {
      ...course,
      packageCount: coursePackages.length,
      startingPriceAmount: showPackagePrice && prices.length > 0 ? Math.min(...prices) : null,
    };
  });
}

export const trialModule: AppModule = {
  name: 'trial',
  async register(app) {
    app.get('/public/home', async () => {
      const organization = await organizationRepo.requireOrganization(app.db);

      const [courses, trialSessions, campuses, teachers, classrooms] = await Promise.all([
        catalogRepo.listPublishedCourses(app.db),
        trialRepo.listOpenTrialSessions(app.db),
        organizationRepo.listCampuses(app.db),
        teachingRepo.listTeachers(app.db),
        teachingRepo.listClassrooms(app.db),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      const featuredCourses = await attachPackageSummary(app, courses, {
        showPackagePrice: businessModel.packagePriceDisplayEnabled,
      });
      return {
        organization: {
          id: organization.id,
          name: organization.name,
          brandName: organization.brandName,
          phone: organization.phone,
          address: organization.address,
          publicProfile: readPublicProfile(organization.settings),
          publicSite: readPublicSite(organization.settings),
          businessModel,
          branding: readSettings(organization.settings).branding ?? {},
        },
        featuredCourses,
        trialSessions,
        campuses,
        teachers: teachers.filter((teacher) => teacher.status !== 'archived'),
        classrooms: classrooms.filter((classroom) => classroom.status !== 'archived'),
      };
    });

    app.get('/public/courses', async () => {
      const [courses, organization] = await Promise.all([
        catalogRepo.listPublishedCourses(app.db),
        organizationRepo.requireOrganization(app.db),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      return {
        courses: await attachPackageSummary(app, courses, {
          showPackagePrice: businessModel.packagePriceDisplayEnabled,
        }),
        businessModel,
      };
    });

    app.get('/public/trial-sessions', async () => {
      return { trialSessions: await trialRepo.listOpenTrialSessions(app.db) };
    });

    app.get('/public/trial-sessions/:trialSessionId', async (request) => {
      const { trialSessionId } = request.params as { trialSessionId: string };
      const trialSession = await trialRepo.requireTrialSession(app.db, trialSessionId);
      if (trialSession.status !== 'open') {
        throw notFound('Trial session not found');
      }
      const [course, campuses, organization] = await Promise.all([
        catalogRepo.requireCourse(app.db, trialSession.courseId),
        organizationRepo.listCampuses(app.db),
        organizationRepo.requireOrganization(app.db),
      ]);
      return {
        trialSession,
        course,
        campus: campuses.find((item) => item.id === trialSession.campusId) ?? null,
        organization: {
          id: organization.id,
          name: organization.name,
          brandName: organization.brandName,
          phone: organization.phone,
          address: organization.address,
          publicProfile: readPublicProfile(organization.settings),
          publicSite: readPublicSite(organization.settings),
          businessModel: readBusinessModel(organization.settings),
          branding: readSettings(organization.settings).branding ?? {},
        },
      };
    });

    app.get('/public/teachers', async () => {
      const teachers = await teachingRepo.listTeachers(app.db);
      return { teachers: teachers.filter((teacher) => teacher.status !== 'archived') };
    });

    app.get('/public/institutions', async () => {
      const institutions = await teachingRepo.listInstitutions(app.db);
      return {
        institutions: institutions
          .filter((institution) => institution.status !== 'archived')
          .map((institution) => ({
            id: institution.id,
            name: institution.name,
            logoUrl: institution.logoUrl,
            intro: institution.intro,
            contact: institution.contact,
            sortOrder: institution.sortOrder,
          })),
      };
    });

    app.get('/public/teachers/:teacherId', async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const teacher = await teachingRepo.findTeacher(app.db, teacherId);
      if (!teacher || teacher.status === 'archived') {
        throw notFound('Teacher not found');
      }
      const institution = await teachingRepo.findInstitution(app.db, teacher.institutionId);
      const [classes, courses] = await Promise.all([
        schedulingRepo.listClasses(app.db),
        catalogRepo.listPublishedCourses(app.db),
      ]);
      const taughtCourseIds = new Set(
        classes
          .filter(
            (classGroup) => classGroup.teacherId === teacher.id && classGroup.status !== 'archived',
          )
          .map((classGroup) => classGroup.courseId),
      );
      const teacherCourses = await attachPackageSummary(
        app,
        courses.filter((course) => taughtCourseIds.has(course.id)),
      );
      return {
        teacher,
        institution: institution
          ? { id: institution.id, name: institution.name, logoUrl: institution.logoUrl }
          : null,
        courses: teacherCourses,
      };
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

      if (body.trialSessionId) {
        const trialSession = await trialRepo.requireTrialSession(app.db, body.trialSessionId);
        if (trialSession.status !== 'open') {
          throw unprocessable('Trial session is not open');
        }
        if (trialSession.bookedCount >= trialSession.capacity) {
          throw unprocessable('Trial session is full');
        }
        const organization = await organizationRepo.requireOrganization(app.db);
        if (
          requiresSeatReservationFee(
            readBusinessModel(organization.settings),
            trialSession.reservationFeeAmount,
          )
        ) {
          throw unprocessable('本场试听需先支付试听席位保留费，请通过试听场次详情预约。');
        }
        courseId = trialSession.courseId;
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

      const course = lead.courseId
        ? await catalogRepo.requireCourse(app.db, lead.courseId).catch(() => null)
        : null;
      await sendTrialRegistrationSubscribe({
        app,
        phone: body.phone,
        studentName: body.studentName,
        courseName: course?.name ?? null,
      });

      return { lead, message: '预约成功，我们会尽快联系您确认上课时间。' };
    });

    app.post('/public/seat-reservations', async (request) => {
      const body = seatReservationSchema.parse(request.body);
      const [organization, trialSession] = await Promise.all([
        organizationRepo.requireOrganization(app.db),
        trialRepo.requireTrialSession(app.db, body.trialSessionId),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      if (!businessModel.seatReservationFeeEnabled) {
        throw unprocessable('Seat reservation fee is not enabled');
      }
      if (trialSession.status !== 'open') {
        throw unprocessable('Trial session is not open');
      }
      if (trialSession.bookedCount >= trialSession.capacity) {
        throw unprocessable('Trial session is full');
      }
      if (!requiresSeatReservationFee(businessModel, trialSession.reservationFeeAmount)) {
        throw unprocessable('This trial session has no reservation fee');
      }

      const course = await catalogRepo.requireCourse(app.db, trialSession.courseId);
      const { channelId, campaignId } = await crmRepo.resolveAttribution(app.db, {
        source: body.source,
        campaignCode: body.campaign,
      });
      const cancelBefore = new Date(trialSession.startsAt.getTime() - 12 * 60 * 60 * 1000);
      const accountId = await readOptionalParentAccountId(request);

      const result = await app.db.transaction(async (tx) => {
        const [lead] = await tx
          .insert(schema.leads)
          .values({
            campusId: trialSession.campusId,
            courseId: trialSession.courseId,
            trialSessionId: trialSession.id,
            guardianName: body.guardianName,
            phone: body.phone,
            studentName: body.studentName,
            grade: body.grade,
            source: body.source,
            channelId,
            campaignId,
            medium: body.medium ?? null,
            status: 'new',
          })
          .returning();
        const order = await financeRepo.createSeatReservationOrder(tx, {
          accountId,
          courseId: course.id,
          amount: trialSession.reservationFeeAmount,
          source: body.source,
          channelId,
          campaignId,
          medium: body.medium ?? null,
          paymentReceiverType: course.paymentReceiverType,
          paymentReceiverInstitutionId: course.paymentReceiverInstitutionId,
          paymentReceiverName:
            course.paymentReceiverName || organization.brandName || organization.name,
        });
        const seatReservation = await seatReservationRepo.createSeatReservation(tx, {
          orderId: order.id,
          orderNo: order.orderNo,
          leadId: lead.id,
          campusId: trialSession.campusId,
          courseId: trialSession.courseId,
          trialSessionId: trialSession.id,
          guardianName: body.guardianName,
          phone: body.phone,
          studentName: body.studentName,
          grade: body.grade,
          reservationFeeAmount: trialSession.reservationFeeAmount,
          reservationStatus: 'pending_payment',
          paymentStatus: 'unpaid',
          checkInStatus: 'pending',
          cancelBefore,
          source: body.source,
          channelId,
          campaignId,
          medium: body.medium ?? null,
        });
        return { lead, order, seatReservation };
      });

      return {
        ...result,
        message: '已创建试听席位保留订单，请完成支付以保留名额。',
      };
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
        reservationFeeAmount: body.reservationFeeAmount,
        reservationNotice: body.reservationNotice,
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

    app.get(
      '/v1/trial-sessions/:trialSessionId/registrations',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { trialSessionId } = request.params as { trialSessionId: string };
        await trialRepo.requireTrialSession(app.db, trialSessionId);
        return { leads: await crmRepo.listLeadsByTrialSession(app.db, trialSessionId) };
      },
    );

    app.get(
      '/v1/trial-sessions/:trialSessionId/seat-reservations',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { trialSessionId } = request.params as { trialSessionId: string };
        await trialRepo.requireTrialSession(app.db, trialSessionId);
        return {
          seatReservations: await seatReservationRepo.listSeatReservationsByTrialSession(
            app.db,
            trialSessionId,
          ),
        };
      },
    );

    app.post(
      '/v1/seat-reservations/:seatReservationId/check-in',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        return seatReservationRepo.checkInSeatReservation(app.db, seatReservationId);
      },
    );

    app.post(
      '/v1/seat-reservations/:seatReservationId/no-show',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        return seatReservationRepo.markSeatReservationNoShow(app.db, seatReservationId);
      },
    );

    app.post(
      '/v1/seat-reservations/:seatReservationId/cancel',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        return seatReservationRepo.cancelSeatReservation(app.db, seatReservationId);
      },
    );

    app.post(
      '/v1/seat-reservations/:seatReservationId/reschedule',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        const body = seatReservationRescheduleSchema.parse(request.body);
        return seatReservationRepo.rescheduleSeatReservation(app.db, {
          reservationId: seatReservationId,
          trialSessionId: body.trialSessionId,
        });
      },
    );

    app.get(
      '/v1/trial-sessions/:trialSessionId/qrcode',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { trialSessionId } = request.params as { trialSessionId: string };
        await trialRepo.requireTrialSession(app.db, trialSessionId);
        const landingUrl = `${resolvePublicWebBaseUrl(app.appEnv, request)}/trials/${trialSessionId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(landingUrl, { margin: 1, width: 320 });
        return { landingUrl, qrCodeDataUrl };
      },
    );
  },
};
