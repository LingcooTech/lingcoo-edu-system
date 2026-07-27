import { z } from 'zod';
import QRCode from 'qrcode';
import type { FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';

import * as trialRepo from '../../db/repositories/trial.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as contentRepo from '../../db/repositories/content.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as seatReservationRepo from '../../db/repositories/seat-reservations.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as schema from '../../db/schema.js';
import { readBusinessModel, requiresSeatReservationFee } from '../../lib/business-model.js';
import { resolvePaymentReceiverName } from '../../lib/payment-receiver.js';
import { resolvePublicWebBaseUrl } from '../../lib/public-url.js';
import { readPublicProfile } from '../../lib/public-profile.js';
import { readPublicSite } from '../../lib/public-site.js';
import { exchangeWechatMiniCode, getWechatMiniPhoneNumber } from '../../lib/wechat-mini.js';
import { sendTrialRegistrationSubscribe } from '../../lib/wechat-mini-subscribe-events.js';
import { httpError } from '../../lib/http-error.js';
import { hashPassword } from '../../lib/password.js';
import { validateLeadPreferences } from '../lead-preferences.js';
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
  coverImageUrl: z.string().max(500).nullable().optional(),
  coverThumbUrl: z.string().max(500).nullable().optional(),
  status: z.enum(['open', 'closed', 'cancelled']).default('open'),
});

const trialSessionUpdateSchema = trialSessionSchema.partial();
const trialSessionBatchSchema = trialSessionSchema.omit({ startsAt: true, endsAt: true }).extend({
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezoneOffsetMinutes: z.number().int().default(-480),
});

const registrationSchema = z.object({
  campusId: z.string().uuid().optional(),
  courseId: z.string().optional(),
  trialSessionId: z.string().optional(),
  preferredTeacherId: z.string().uuid().optional(),
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

const seatReservationSchema = z
  .object({
    trialSessionId: z.string(),
    guardianName: z.string().min(1),
    phone: z.string().min(6).optional(),
    phoneCode: z.string().min(1).optional(),
    wechatMiniCode: z.string().min(1).optional(),
    studentName: z.string().min(1),
    grade: z.string().min(1),
    source: z.string().default('unknown'),
    campaign: z.string().optional(),
    course: z.string().optional(),
    medium: z.string().optional(),
  })
  .refine((value) => Boolean(value.phone || value.phoneCode), {
    message: 'phone 或 phoneCode 至少提供一个',
  });

const seatReservationRescheduleSchema = z.object({
  trialSessionId: z.string(),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function normalizeImageCaptionItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const imageUrl = typeof record.imageUrl === 'string' ? record.imageUrl.trim() : '';
      const caption = typeof record.caption === 'string' ? record.caption.trim() : '';
      return imageUrl ? { imageUrl, caption } : null;
    })
    .filter((item): item is { imageUrl: string; caption: string } => item !== null)
    .slice(0, 20);
}

function toPublicInstitution(institution: typeof schema.institutions.$inferSelect) {
  return {
    id: institution.id,
    name: institution.name,
    logoUrl: institution.logoUrl,
    intro: institution.intro,
    qualificationItems: normalizeImageCaptionItems(institution.qualificationItems),
    outcomeItems: normalizeImageCaptionItems(institution.outcomeItems),
    contact: institution.contact,
    sortOrder: institution.sortOrder,
  };
}

function toPublicTeacher<T extends typeof schema.teachers.$inferSelect>(teacher: T) {
  return {
    ...teacher,
    practiceDuration: teacher.retentionRate,
  };
}

function unprocessable(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function normalizePhone(phone: string) {
  return phone.trim();
}

function defaultPasswordForPhone(phone: string) {
  return phone.slice(-6);
}

function endOfCurrentWeek(now = new Date()) {
  const end = new Date(now);
  const daysUntilSunday = end.getDay() === 0 ? 0 : 7 - end.getDay();
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function ensureTrialSessionOpenAndFuture(
  trialSession: typeof schema.trialSessions.$inferSelect,
  now = new Date(),
) {
  if (trialSession.status !== 'open') {
    throw unprocessable('Trial session is not open');
  }
  if (trialSession.startsAt <= now) {
    throw unprocessable('Trial session has already started');
  }
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function formatDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const { year, month, day } = parseDateParts(dateKey);
  return formatDateKey(new Date(Date.UTC(year, month - 1, day + days)));
}

function dateKeyToUtcMs(dateKey: string) {
  const { year, month, day } = parseDateParts(dateKey);
  return Date.UTC(year, month - 1, day);
}

function localDateTimeToDate(dateKey: string, time: string, timezoneOffsetMinutes: number) {
  const { year, month, day } = parseDateParts(dateKey);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + timezoneOffsetMinutes * 60_000);
}

function dayOfWeek(dateKey: string) {
  const { year, month, day } = parseDateParts(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function datesForTrialBatch(input: z.infer<typeof trialSessionBatchSchema>) {
  if (dateKeyToUtcMs(input.endsOn) < dateKeyToUtcMs(input.startsOn)) {
    throw unprocessable('结束日期不能早于开始日期');
  }

  const weekdays = new Set(input.weekdays);
  const dates: string[] = [];

  for (let dateKey = input.startsOn; dateKeyToUtcMs(dateKey) <= dateKeyToUtcMs(input.endsOn); ) {
    if (weekdays.has(dayOfWeek(dateKey))) {
      dates.push(dateKey);
    }
    dateKey = addDays(dateKey, 1);
  }

  if (dates.length === 0) {
    throw unprocessable('日期范围内没有匹配的试听日期');
  }
  if (dates.length > 120) {
    throw unprocessable('单次最多生成 120 节试听课');
  }
  return dates;
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
    const coursePackages = packages.filter(
      (item) =>
        item.courseId === course.id ||
        (course.courseSeriesId && item.courseSeriesId === course.courseSeriesId),
    );
    const prices = coursePackages.map((item) => packagesRepo.effectivePackagePrice(item));
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
      const now = new Date();

      const [courses, trialSessions, campuses, teachers, contentItems] = await Promise.all([
        catalogRepo.listPublishedCourses(app.db),
        trialRepo.listOpenFutureTrialSessions(app.db, {
          from: now,
          to: endOfCurrentWeek(now),
          limit: 6,
        }),
        organizationRepo.listCampuses(app.db),
        teachingRepo.listTeachers(app.db),
        contentRepo.listPublishedContent(app.db, { limit: 5, offset: 0 }),
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
        contentItems: contentItems.items,
        campuses,
        teachers: teachers
          .filter((teacher) => teacher.status !== 'archived')
          .slice(0, 5)
          .map(toPublicTeacher),
      };
    });

    app.get('/public/mini-share-settings', async () => {
      const organization = await organizationRepo.requireOrganization(app.db);
      return {
        miniShare: readPublicSite(organization.settings).miniShare,
        organizationName: organization.brandName || organization.name,
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
      return {
        trialSessions: await trialRepo.listOpenFutureTrialSessions(app.db, { from: new Date() }),
      };
    });

    app.get('/public/trial-sessions/:trialSessionId', async (request) => {
      const { trialSessionId } = request.params as { trialSessionId: string };
      const trialSession = await trialRepo.requireTrialSession(app.db, trialSessionId);
      if (trialSession.status !== 'open' || trialSession.startsAt <= new Date()) {
        throw notFound('Trial session not found');
      }
      const [course, campuses, organization] = await Promise.all([
        catalogRepo.requireCourse(app.db, trialSession.courseId),
        organizationRepo.listCampuses(app.db),
        organizationRepo.requireOrganization(app.db),
      ]);
      const providerInstitution = await teachingRepo.findInstitution(
        app.db,
        course.providerInstitutionId,
      );
      return {
        trialSession,
        course,
        providerInstitution: providerInstitution ? toPublicInstitution(providerInstitution) : null,
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
      return {
        teachers: teachers.filter((teacher) => teacher.status !== 'archived').map(toPublicTeacher),
      };
    });

    app.get('/public/institutions', async () => {
      const institutions = await teachingRepo.listInstitutions(app.db);
      return {
        institutions: institutions
          .filter((institution) => institution.status !== 'archived')
          .map(toPublicInstitution),
      };
    });

    app.get('/public/institutions/:institutionId', async (request) => {
      const { institutionId } = request.params as { institutionId: string };
      const institution = await teachingRepo.findInstitution(app.db, institutionId);
      if (!institution || institution.status === 'archived') {
        throw notFound('Institution not found');
      }

      const [teachers, courses, organization] = await Promise.all([
        teachingRepo.listTeachers(app.db),
        catalogRepo.listPublishedCourses(app.db),
        organizationRepo.requireOrganization(app.db),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      const institutionCourses = await attachPackageSummary(
        app,
        courses.filter((course) => course.providerInstitutionId === institution.id),
        { showPackagePrice: businessModel.packagePriceDisplayEnabled },
      );

      return {
        institution: toPublicInstitution(institution),
        teachers: teachers
          .filter(
            (teacher) => teacher.institutionId === institution.id && teacher.status !== 'archived',
          )
          .map(toPublicTeacher),
        courses: institutionCourses,
        businessModel,
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
        teacher: toPublicTeacher(teacher),
        institution: institution
          ? { id: institution.id, name: institution.name, logoUrl: institution.logoUrl }
          : null,
        courses: teacherCourses,
      };
    });

    app.post('/public/trial-registrations', async (request) => {
      const body = registrationSchema.parse(request.body);
      let campusId = body.campusId ?? (await trialRepo.firstCampusId(app.db));

      // Prefer the explicit form selection; fall back to the course slug carried
      // in the QR attribution when the form had no course picker.
      let courseId = body.courseId ?? null;
      let assignedTeacherId = body.preferredTeacherId ?? null;
      if (!courseId && body.course) {
        const course = await catalogRepo.findPublishedCourseBySlug(app.db, body.course);
        courseId = course?.id ?? null;
      }

      if (body.trialSessionId) {
        const trialSession = await trialRepo.requireTrialSession(app.db, body.trialSessionId);
        ensureTrialSessionOpenAndFuture(trialSession);
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
        campusId = trialSession.campusId;
        assignedTeacherId = assignedTeacherId ?? trialSession.teacherId;
      }

      await validateLeadPreferences(app.db, {
        campusId,
        courseId,
        preferredTeacherId: assignedTeacherId ?? undefined,
      });

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
        preferredTeacherId: assignedTeacherId,
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

      return {
        lead,
        message: body.trialSessionId
          ? '资料已提交，试听时间已确认。'
          : '试听意向已提交，老师会尽快联系您确认时间。',
      };
    });

    app.post('/public/seat-reservations', async (request, reply) => {
      const body = seatReservationSchema.parse(request.body);
      const wechatIdentity = body.wechatMiniCode
        ? await exchangeWechatMiniCode(app.appEnv, body.wechatMiniCode)
        : null;
      const rawPhone = body.phoneCode
        ? await getWechatMiniPhoneNumber(app.appEnv, body.phoneCode)
        : body.phone;
      if (!body.phoneCode && app.appEnv.NODE_ENV === 'production' && body.wechatMiniCode) {
        throw httpError(422, '小程序占位必须使用微信手机号授权');
      }
      if (!rawPhone) {
        throw unprocessable('手机号不能为空');
      }
      const phone = normalizePhone(rawPhone);
      const [organization, trialSession] = await Promise.all([
        organizationRepo.requireOrganization(app.db),
        trialRepo.requireTrialSession(app.db, body.trialSessionId),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      if (!businessModel.seatReservationFeeEnabled) {
        throw unprocessable('Seat reservation fee is not enabled');
      }
      ensureTrialSessionOpenAndFuture(trialSession);
      if (trialSession.bookedCount >= trialSession.capacity) {
        throw unprocessable('Trial session is full');
      }
      if (!requiresSeatReservationFee(businessModel, trialSession.reservationFeeAmount)) {
        throw unprocessable('This trial session has no reservation fee');
      }

      const course = await catalogRepo.requireCourse(app.db, trialSession.courseId);
      const [paymentReceiverInstitution, providerInstitution] = await Promise.all([
        teachingRepo.findInstitution(app.db, course.paymentReceiverInstitutionId),
        teachingRepo.findInstitution(app.db, course.providerInstitutionId),
      ]);
      const paymentReceiverName = resolvePaymentReceiverName({
        paymentReceiverType: course.paymentReceiverType,
        receiverInstitutionName: paymentReceiverInstitution?.name,
        providerInstitutionName: providerInstitution?.name,
        legacyDisplayName: course.paymentReceiverName,
        organizationBrandName: organization.brandName,
        organizationName: organization.name,
      });
      const { channelId, campaignId } = await crmRepo.resolveAttribution(app.db, {
        source: body.source,
        campaignCode: body.campaign,
      });
      const cancelBefore = new Date(trialSession.startsAt.getTime() - 12 * 60 * 60 * 1000);
      const tokenAccountId = await readOptionalParentAccountId(request);

      const result = await app.db.transaction(async (tx) => {
        let accountId = tokenAccountId;
        let accountCreated = false;
        let defaultPassword: string | null = null;

        if (wechatIdentity) {
          const [existingGuardian] = await tx
            .select()
            .from(schema.guardians)
            .where(eq(schema.guardians.phone, phone))
            .limit(1);
          const guardian =
            existingGuardian ??
            (
              await tx
                .insert(schema.guardians)
                .values({
                  name: body.guardianName.trim() || `${phone} 家长`,
                  phone,
                })
                .returning()
            )[0];

          const [existingAccount] = await tx
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.phone, phone))
            .limit(1);
          if (existingAccount && existingAccount.role !== 'parent') {
            throw httpError(409, '该手机号已绑定非家长账号');
          }
          if (existingAccount && existingAccount.status !== 'active') {
            throw httpError(403, '账号已停用');
          }

          const newDefaultPassword = defaultPasswordForPhone(phone);
          defaultPassword = existingAccount ? null : newDefaultPassword;
          const account =
            existingAccount ??
            (
              await tx
                .insert(schema.accounts)
                .values({
                  role: 'parent',
                  phone,
                  passwordHash: hashPassword(newDefaultPassword),
                  displayName: guardian.name,
                  guardianId: guardian.id,
                  mustChangePassword: true,
                })
                .returning()
            )[0];
          accountCreated = !existingAccount;
          accountId = account.id;

          if (!account.guardianId) {
            await tx
              .update(schema.accounts)
              .set({ guardianId: guardian.id, updatedAt: new Date() })
              .where(eq(schema.accounts.id, account.id));
          }

          const [existingIdentity] = await tx
            .select()
            .from(schema.accountWechatIdentities)
            .where(
              and(
                eq(schema.accountWechatIdentities.appId, wechatIdentity.appId),
                eq(schema.accountWechatIdentities.openid, wechatIdentity.openid),
              ),
            )
            .limit(1);
          if (existingIdentity && existingIdentity.accountId !== account.id) {
            throw httpError(409, '当前微信已绑定其他手机号，请使用已绑定手机号预约');
          }
          if (existingIdentity) {
            await tx
              .update(schema.accountWechatIdentities)
              .set({ unionid: wechatIdentity.unionid ?? null, updatedAt: new Date() })
              .where(eq(schema.accountWechatIdentities.id, existingIdentity.id));
          } else {
            await tx.insert(schema.accountWechatIdentities).values({
              accountId: account.id,
              appId: wechatIdentity.appId,
              openid: wechatIdentity.openid,
              unionid: wechatIdentity.unionid ?? null,
            });
          }
        }

        const [lead] = await tx
          .insert(schema.leads)
          .values({
            campusId: trialSession.campusId,
            courseId: trialSession.courseId,
            trialSessionId: trialSession.id,
            guardianName: body.guardianName,
            phone,
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
          paymentReceiverName,
        });
        const seatReservation = await seatReservationRepo.createSeatReservation(tx, {
          orderId: order.id,
          orderNo: order.orderNo,
          leadId: lead.id,
          campusId: trialSession.campusId,
          courseId: trialSession.courseId,
          trialSessionId: trialSession.id,
          guardianName: body.guardianName,
          phone,
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
        return { lead, order, seatReservation, accountId, accountCreated, defaultPassword };
      });

      const authToken =
        wechatIdentity && result.accountId
          ? await reply.jwtSign({ sub: result.accountId, role: 'parent' }, { expiresIn: '14d' })
          : null;

      return {
        lead: result.lead,
        order: result.order,
        seatReservation: result.seatReservation,
        checkout: {
          loginIdentifier: phone,
          defaultPassword: result.defaultPassword,
          accountCreated: result.accountCreated,
          authToken,
        },
        message: '已创建试听席位保留订单，请完成支付以保留名额。',
      };
    });

    app.get('/v1/trial-sessions', { preHandler: app.requireAdmin }, async () => {
      return { trialSessions: await trialRepo.listTrialSessions(app.db) };
    });

    app.post('/v1/trial-sessions', { preHandler: app.requireAdmin }, async (request) => {
      const body = trialSessionSchema.parse(request.body);
      await catalogRepo.requireCourse(app.db, body.courseId);
      if (new Date(body.endsAt) <= new Date(body.startsAt)) {
        throw unprocessable('结束时间必须晚于开始时间');
      }

      const trialSession = await trialRepo.createTrialSession(app.db, {
        campusId: body.campusId,
        courseId: body.courseId,
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        capacity: body.capacity,
        reservationFeeAmount: body.reservationFeeAmount,
        reservationNotice: body.reservationNotice,
        coverImageUrl: body.coverImageUrl ?? null,
        coverThumbUrl: body.coverThumbUrl ?? null,
        status: body.status,
        bookedCount: 0,
      });
      return { trialSession };
    });

    app.post('/v1/trial-sessions/batch', { preHandler: app.requireAdmin }, async (request) => {
      const body = trialSessionBatchSchema.parse(request.body);
      await catalogRepo.requireCourse(app.db, body.courseId);
      const dates = datesForTrialBatch(body);
      const trialSessions: Awaited<ReturnType<typeof trialRepo.createTrialSession>>[] = [];

      for (const dateKey of dates) {
        const startsAt = localDateTimeToDate(dateKey, body.startTime, body.timezoneOffsetMinutes);
        const endsAt = localDateTimeToDate(dateKey, body.endTime, body.timezoneOffsetMinutes);
        if (endsAt <= startsAt) {
          throw unprocessable('结束时间必须晚于开始时间');
        }

        const trialSession = await trialRepo.createTrialSession(app.db, {
          campusId: body.campusId,
          courseId: body.courseId,
          title: body.title,
          startsAt,
          endsAt,
          capacity: body.capacity,
          reservationFeeAmount: body.reservationFeeAmount,
          reservationNotice: body.reservationNotice,
          coverImageUrl: body.coverImageUrl ?? null,
          coverThumbUrl: body.coverThumbUrl ?? null,
          status: body.status,
          bookedCount: 0,
        });
        trialSessions.push(trialSession);
      }

      return { trialSessions };
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
        if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
          throw unprocessable('结束时间必须晚于开始时间');
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
        const { mode } = request.query as { mode?: string };
        const trialSession =
          mode === 'hard'
            ? await trialRepo.deleteTrialSession(app.db, trialSessionId)
            : await trialRepo.cancelTrialSession(app.db, trialSessionId);
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
