import { and, desc, eq, ne, or } from 'drizzle-orm';
import { z } from 'zod';

import * as crmRepo from '../../db/repositories/crm.js';
import * as courseContractsRepo from '../../db/repositories/course-contracts.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import { canUseOnlinePackageSales, readBusinessModel } from '../../lib/business-model.js';
import { httpError } from '../../lib/http-error.js';
import { resolvePaymentReceiverName } from '../../lib/payment-receiver.js';
import { hashPassword } from '../../lib/password.js';
import { resolvePackageCourse } from '../package-course.js';
import { exchangeWechatMiniCode, getWechatMiniPhoneNumber } from '../../lib/wechat-mini.js';
import type { AppModule } from '../types.js';
import { notifyTeachersFormalStudentEnrolled } from '../teacher-notification-events.js';
import { getPaymentProvider } from './providers/index.js';
import { PaymentService } from './service.js';
import {
  PaymentSettingsService,
  type AlipayPaymentSettingsInput,
  type WechatPaymentSettingsInput,
} from './settings-service.js';

const createOrderSchema = z
  .object({
    packageId: z.string().uuid(),
    courseId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
    guardianName: z.string().min(1).max(120).optional(),
    guardianPhone: z.string().min(6).max(40).optional(),
    phoneCode: z.string().min(1).optional(),
    studentName: z.string().min(1).max(120).optional(),
    grade: z.string().max(80).optional().default(''),
    source: z.string().max(80).optional(),
    campaign: z.string().max(80).optional(),
    medium: z.string().max(40).optional(),
    wechatMiniCode: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.guardianPhone || value.phoneCode), {
    message: 'guardianPhone 或 phoneCode 至少提供一个',
  });

const completePackageOrderStudentSchema = z.object({
  studentName: z.string().min(1).max(120),
  grade: z.string().max(80).optional().default(''),
});

const paymentIntentSchema = z.object({
  provider: z.enum(['wechat_pay', 'alipay', 'mock']).optional(),
});

const wechatSettingsSchema = z.object({
  appId: z.string().optional(),
  appSecret: z.string().optional(),
  mchId: z.string().optional(),
  apiKey: z.string().optional(),
  disableH5: z.boolean().optional(),
  notifyUrl: z.string().optional(),
}) satisfies z.ZodType<WechatPaymentSettingsInput>;

const alipaySettingsSchema = z.object({
  appId: z.string().optional(),
  gateway: z.string().optional(),
  notifyUrl: z.string().optional(),
  returnUrl: z.string().optional(),
  keyType: z.enum(['PKCS1', 'PKCS8']).optional(),
  f2fPay: z.boolean().optional(),
  privateKeyPem: z.string().optional(),
  publicKeyPem: z.string().optional(),
}) satisfies z.ZodType<AlipayPaymentSettingsInput>;

const providerParamSchema = z.object({
  provider: z.enum(['wechat_pay', 'alipay']),
});

function getRawBody(body: unknown) {
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }
  return '';
}

function normalizePhone(phone: string) {
  return phone.trim();
}

function defaultPasswordForPhone(phone: string) {
  return phone.slice(-6);
}

export const paymentModule: AppModule = {
  name: 'payment',
  async register(app) {
    // --- Parent checkout (course-package purchase) ---

    app.post('/public/orders', async (request, reply) => {
      const body = createOrderSchema.parse(request.body);
      const wechatIdentity = body.wechatMiniCode
        ? await exchangeWechatMiniCode(app.appEnv, body.wechatMiniCode)
        : null;
      const rawPhone = body.phoneCode
        ? await getWechatMiniPhoneNumber(app.appEnv, body.phoneCode)
        : body.guardianPhone;
      if (!body.phoneCode && app.appEnv.NODE_ENV === 'production' && body.wechatMiniCode) {
        throw httpError(422, '小程序购买必须使用微信手机号授权');
      }
      const pkg = await packagesRepo.requirePackage(app.db, body.packageId);
      if (pkg.status !== 'active') {
        throw httpError(422, '该课时包已下架');
      }
      if (packagesRepo.isPeriodPackage(pkg)) {
        throw httpError(422, '周期卡请联系老师办理并确认生效日期');
      }
      const [course, organization] = await Promise.all([
        resolvePackageCourse(app.db, pkg, body.courseId),
        organizationRepo.requireOrganization(app.db),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      if (!canUseOnlinePackageSales(businessModel, course.onlineSalesEnabled)) {
        throw httpError(403, '当前机构不支持线上购买课时包，请预约试听或到店确认');
      }
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
      const amount = packagesRepo.effectivePackagePrice(pkg);
      const lessonCount = packagesRepo.effectivePackageLessonCount(pkg);
      if (!rawPhone) {
        throw httpError(422, '手机号不能为空');
      }
      const phone = normalizePhone(rawPhone);
      const defaultPassword = defaultPasswordForPhone(phone);
      const attribution = await crmRepo.resolveAttribution(app.db, {
        source: body.source,
        campaignCode: body.campaign,
      });

      const result = await app.db.transaction(async (tx) => {
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
                name: body.guardianName?.trim() || `${phone} 家长`,
                phone,
              })
              .returning()
          )[0];

        let student: typeof schema.students.$inferSelect | null = null;
        if (body.studentId) {
          const [existingStudentRow] = await tx
            .select({ student: schema.students })
            .from(schema.students)
            .leftJoin(
              schema.studentGuardians,
              and(
                eq(schema.studentGuardians.studentId, schema.students.id),
                eq(schema.studentGuardians.guardianId, guardian.id),
              ),
            )
            .where(
              and(
                eq(schema.students.id, body.studentId),
                ne(schema.students.status, 'archived'),
                or(
                  eq(schema.students.guardianId, guardian.id),
                  eq(schema.studentGuardians.guardianId, guardian.id),
                ),
              ),
            )
            .limit(1);
          const existingStudent = existingStudentRow?.student;
          if (!existingStudent) {
            throw httpError(403, '无权为该学员续费');
          }
          const [existingCourseContract] = await tx
            .select()
            .from(schema.courseContracts)
            .where(
              and(
                eq(schema.courseContracts.studentId, existingStudent.id),
                eq(schema.courseContracts.courseId, course.id),
                ne(schema.courseContracts.status, 'cancelled'),
              ),
            )
            .limit(1);
          if (!existingCourseContract) {
            throw httpError(422, '该学员暂无此课程档案，不能直接续费');
          }
          student = existingStudent;
        } else {
          const studentName = body.studentName?.trim();
          student = studentName
            ? ((
                await tx
                  .select()
                  .from(schema.students)
                  .where(
                    and(
                      eq(schema.students.guardianId, guardian.id),
                      eq(schema.students.name, studentName),
                      ne(schema.students.status, 'archived'),
                    ),
                  )
                  .limit(1)
              )[0] ??
              (
                await tx
                  .insert(schema.students)
                  .values({
                    guardianId: guardian.id,
                    name: studentName,
                    grade: body.grade?.trim() || '未填写',
                    status: 'active',
                  })
                  .returning()
              )[0])
            : null;
        }

        if (student) {
          await tx
            .insert(schema.studentGuardians)
            .values({ studentId: student.id, guardianId: guardian.id, relation: 'guardian' })
            .onConflictDoNothing();
        }

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

        const account =
          existingAccount ??
          (
            await tx
              .insert(schema.accounts)
              .values({
                role: 'parent',
                phone,
                passwordHash: hashPassword(defaultPassword),
                displayName: guardian.name,
                guardianId: guardian.id,
                mustChangePassword: true,
              })
              .returning()
          )[0];

        if (!account.guardianId) {
          await tx
            .update(schema.accounts)
            .set({ guardianId: guardian.id, updatedAt: new Date() })
            .where(eq(schema.accounts.id, account.id));
        }

        if (wechatIdentity) {
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
            throw httpError(409, '当前微信已绑定其他手机号，请使用已绑定手机号购买');
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
          .select()
          .from(schema.leads)
          .where(eq(schema.leads.phone, phone))
          .orderBy(desc(schema.leads.createdAt))
          .limit(1);
        if (lead && student) {
          await tx
            .update(schema.leads)
            .set({
              status: 'paid',
              convertedStudentId: student.id,
              updatedAt: new Date(),
            })
            .where(eq(schema.leads.id, lead.id));
        }

        const order = await financeRepo.createPackageOrder(tx, {
          accountId: account.id,
          packageId: pkg.id,
          studentId: student?.id ?? null,
          courseId: course.id,
          courseSeriesId: pkg.courseSeriesId ?? course.courseSeriesId,
          amount,
          lessonCount,
          currency: 'CNY',
          paymentReceiverType: course.paymentReceiverType,
          paymentReceiverInstitutionId: course.paymentReceiverInstitutionId,
          paymentReceiverName,
          source: body.source ?? lead?.source ?? 'unknown',
          channelId: attribution.channelId ?? lead?.channelId ?? null,
          campaignId: attribution.campaignId ?? lead?.campaignId ?? null,
          medium: body.medium ?? lead?.medium ?? null,
        });

        return {
          order,
          account,
          guardian,
          student,
          accountCreated: !existingAccount,
        };
      });

      const authToken = wechatIdentity
        ? await reply.jwtSign(
            { sub: result.account.id, role: result.account.role },
            { expiresIn: '14d' },
          )
        : null;

      return {
        order: result.order,
        checkout: {
          loginIdentifier: phone,
          defaultPassword: result.accountCreated ? defaultPassword : null,
          accountCreated: result.accountCreated,
          mustChangePassword: result.account.mustChangePassword,
          authToken,
        },
      };
    });

    app.post(
      '/public/orders/:orderNo/student',
      { preHandler: app.requireParent },
      async (request) => {
        const { orderNo } = request.params as { orderNo: string };
        const body = completePackageOrderStudentSchema.parse(request.body);
        const account = await app.db.query.accounts.findFirst({
          where: eq(schema.accounts.id, request.account!.id),
        });
        if (!account) {
          throw httpError(401, '请先登录');
        }
        const phone = account.phone ? normalizePhone(account.phone) : null;
        if (!phone) {
          throw httpError(422, '当前账号缺少手机号');
        }

        const result = await app.db.transaction(async (tx) => {
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
                .values({ name: account.displayName || `${phone} 家长`, phone })
                .returning()
            )[0];

          if (!account.guardianId) {
            await tx
              .update(schema.accounts)
              .set({ guardianId: guardian.id, updatedAt: new Date() })
              .where(eq(schema.accounts.id, account.id));
          }

          const studentName = body.studentName.trim();
          const [existingStudent] = await tx
            .select()
            .from(schema.students)
            .where(
              and(
                eq(schema.students.guardianId, guardian.id),
                eq(schema.students.name, studentName),
                ne(schema.students.status, 'archived'),
              ),
            )
            .limit(1);
          const student =
            existingStudent ??
            (
              await tx
                .insert(schema.students)
                .values({
                  guardianId: guardian.id,
                  name: studentName,
                  grade: body.grade?.trim() || '未填写',
                  status: 'active',
                })
                .returning()
            )[0];

          await tx
            .insert(schema.studentGuardians)
            .values({ studentId: student.id, guardianId: guardian.id, relation: 'guardian' })
            .onConflictDoNothing();

          const order = await financeRepo.attachStudentToPaidPackageOrderInTx(tx, {
            orderNo,
            accountId: request.account!.id,
            studentId: student.id,
          });
          const contract = await courseContractsRepo.createCourseContractFromPaidPackageOrderInTx(
            tx,
            {
              order,
              studentId: student.id,
              actorAccountId: request.account!.id,
              requestId: request.id,
            },
          );

          return { student, order, courseContract: contract.courseContract };
        });

        await notifyTeachersFormalStudentEnrolled(app.db, {
          orderNo: result.order.orderNo,
          studentId: result.student.id,
          studentName: result.student.name,
          courseId: result.order.courseId!,
          courseContractId: result.courseContract.id,
        });

        return {
          order: result.order,
          student: result.student,
          courseContract: result.courseContract,
          message: '孩子信息已完善，课时已到账，正式课程档案待老师确认。',
        };
      },
    );

    app.post('/public/orders/:orderNo/payment-intent', async (request) => {
      const { orderNo } = request.params as { orderNo: string };
      const payload = paymentIntentSchema.parse(request.body ?? {});
      return new PaymentService(app).createPaymentIntent({
        orderNo,
        provider: payload.provider,
        clientIp: request.ip,
      });
    });

    app.post(
      '/public/orders/:orderNo/wechat-mini-payment-intent',
      { preHandler: app.requireParent },
      async (request) => {
        const { orderNo } = request.params as { orderNo: string };
        return new PaymentService(app).createWechatMiniProgramPaymentIntent({
          orderNo,
          accountId: request.account!.id,
          clientIp: request.ip,
        });
      },
    );

    app.post('/public/orders/:orderNo/payment-sync', async (request) => {
      const { orderNo } = request.params as { orderNo: string };
      return new PaymentService(app).syncProviderPayment({
        orderNo,
      });
    });

    app.get('/public/orders/:orderNo/status', async (request) => {
      const { orderNo } = request.params as { orderNo: string };
      const order = await financeRepo.findOrderByOrderNo(app.db, orderNo);
      if (!order) {
        throw httpError(404, 'Order not found');
      }
      return { item: order };
    });

    // Development-only shortcut to drive the buy→credit loop without a provider.
    app.post('/public/orders/:orderNo/mock-pay', async (request) => {
      const { orderNo } = request.params as { orderNo: string };
      return new PaymentService(app).markMockPaid({
        orderNo,
      });
    });

    app.get('/public/payment-providers', async () => {
      const overview = await new PaymentSettingsService(app).getOverview({
        includeMock: app.appEnv.NODE_ENV !== 'production',
      });

      return {
        providers: overview.items.map((item) => ({
          code: item.code,
          label: item.label,
          configured: item.configured,
          supportedModes: item.supportedModes,
        })),
      };
    });

    // --- Provider async callbacks (public, unauthenticated, idempotent) ---
    // Rate limiting is disabled: providers re-deliver in bursts during retry
    // storms and the settlement path is idempotent (markOrderPaidAndCredit).

    app.post(
      '/public/payment/wechat/notify',
      { config: { rateLimit: false } },
      async (request, reply) => {
        try {
          const provider = getPaymentProvider('wechat_pay');
          const runtimeEnv = await new PaymentSettingsService(app).buildRuntimeEnv();
          const notification = await provider.parseNotification({
            env: runtimeEnv,
            headers: request.headers as Record<string, unknown>,
            rawBody: getRawBody(request.body),
            body: request.body,
          });

          if (notification.kind === 'paid') {
            await new PaymentService(app).handlePaymentNotification(notification);
          } else {
            request.log.info(
              { reason: notification.reason },
              'wechat payment notification ignored',
            );
          }

          return reply
            .status(200)
            .type('text/xml; charset=utf-8')
            .send(
              '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>',
            );
        } catch (error) {
          request.log.error({ err: error }, 'wechat payment notification failed');
          return reply
            .status(200)
            .type('text/xml; charset=utf-8')
            .send(
              '<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[FAIL]]></return_msg></xml>',
            );
        }
      },
    );

    app.post(
      '/public/payment/alipay/notify',
      { config: { rateLimit: false } },
      async (request, reply) => {
        try {
          const provider = getPaymentProvider('alipay');
          const runtimeEnv = await new PaymentSettingsService(app).buildRuntimeEnv();
          const notification = await provider.parseNotification({
            env: runtimeEnv,
            headers: request.headers as Record<string, unknown>,
            rawBody: getRawBody(request.body),
            body: request.body,
          });

          if (notification.kind === 'paid') {
            await new PaymentService(app).handlePaymentNotification(notification);
          } else {
            request.log.info({ reason: notification.reason }, 'alipay notification ignored');
          }

          return reply.type('text/plain; charset=utf-8').send('success');
        } catch (error) {
          request.log.error({ err: error }, 'alipay notification failed');
          return reply.status(500).type('text/plain; charset=utf-8').send('failure');
        }
      },
    );

    // --- Admin payment configuration ---

    app.get('/v1/payment-providers', { preHandler: app.requireAdmin }, async () => {
      return new PaymentSettingsService(app).getOverview({ includeMock: true });
    });

    app.post(
      '/v1/orders/:orderNo/payment-sync',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { orderNo } = request.params as { orderNo: string };
        return new PaymentService(app).syncProviderPayment({
          orderNo,
        });
      },
    );

    app.get('/v1/payment-settings', { preHandler: app.requireAdmin }, async () => {
      return new PaymentSettingsService(app).getOverview();
    });

    app.put('/v1/payment-settings/wechat', { preHandler: app.requireAdmin }, async (request) => {
      const payload = wechatSettingsSchema.parse(request.body);
      const updatedBy = request.account!.id;
      return new PaymentSettingsService(app).upsertWechatSettings(payload, updatedBy);
    });

    app.put('/v1/payment-settings/alipay', { preHandler: app.requireAdmin }, async (request) => {
      const payload = alipaySettingsSchema.parse(request.body);
      const updatedBy = request.account!.id;
      return new PaymentSettingsService(app).upsertAlipaySettings(payload, updatedBy);
    });

    app.delete(
      '/v1/payment-settings/:provider',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { provider } = providerParamSchema.parse(request.params);
        await new PaymentSettingsService(app).clearProviderSettings(provider);
        return { ok: true };
      },
    );
  },
};
