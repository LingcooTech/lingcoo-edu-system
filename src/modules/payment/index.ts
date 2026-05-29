import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../../db/client.js';
import * as financeRepo from '../../db/repositories/finance.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import { findParentById } from '../../db/repositories/parents.js';
import { requireCourse } from '../../db/repositories/catalog.js';
import { findTenantBySlug, requireTenant } from '../../db/repositories/tenant.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import type { AppModule } from '../types.js';
import { getPaymentProvider } from './providers/index.js';
import { PaymentService } from './service.js';
import {
  PaymentSettingsService,
  type AlipayPaymentSettingsInput,
  type WechatPaymentSettingsInput,
} from './settings-service.js';

const createOrderSchema = z.object({
  packageId: z.string().uuid(),
  studentId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
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

async function resolveTenantForParent(db: Database, tenantSlug: string, parentTenantId: string) {
  const tenant = await findTenantBySlug(db, tenantSlug);
  if (!tenant || tenant.id !== parentTenantId) {
    throw httpError(404, 'Tenant not found');
  }
  return tenant;
}

export const paymentModule: AppModule = {
  name: 'payment',
  async register(app) {
    // --- Parent checkout (course-package purchase) ---

    app.post(
      '/public/:tenantSlug/orders',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { tenantSlug } = request.params as { tenantSlug: string };
        const parent = request.parent!;
        await resolveTenantForParent(app.db, tenantSlug, parent.tenantId);

        const body = createOrderSchema.parse(request.body);
        const pkg = await packagesRepo.requirePackage(app.db, parent.tenantId, body.packageId);
        if (pkg.status !== 'active') {
          throw httpError(422, '该课时包已下架');
        }

        const parentRow = await findParentById(app.db, parent.id);
        if (!parentRow?.guardianId) {
          throw httpError(422, '请先联系机构将账号关联到学员后再购买');
        }

        const [student] = await app.db
          .select()
          .from(schema.students)
          .where(
            and(
              eq(schema.students.id, body.studentId),
              eq(schema.students.tenantId, parent.tenantId),
              eq(schema.students.guardianId, parentRow.guardianId),
            ),
          )
          .limit(1);
        if (!student) {
          throw httpError(404, '学员不存在或不属于该家长');
        }

        const courseId = body.courseId ?? pkg.courseId;
        if (!courseId) {
          throw httpError(422, '该课时包未绑定课程，请选择要购买的课程');
        }
        // Validates the resolved course exists in this tenant (also guards a
        // parent-supplied courseId from pointing at another tenant's course).
        await requireCourse(app.db, parent.tenantId, courseId);

        const order = await financeRepo.createPackageOrder(app.db, {
          tenantId: parent.tenantId,
          parentId: parent.id,
          packageId: pkg.id,
          studentId: student.id,
          courseId,
          amount: pkg.priceAmount,
          lessonCount: pkg.lessonCount,
          currency: 'CNY',
        });

        return { order };
      },
    );

    app.post(
      '/public/:tenantSlug/orders/:orderNo/payment-intent',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { tenantSlug, orderNo } = request.params as { tenantSlug: string; orderNo: string };
        await resolveTenantForParent(app.db, tenantSlug, request.parent!.tenantId);
        const payload = paymentIntentSchema.parse(request.body ?? {});
        return new PaymentService(app).createPaymentIntent({
          orderNo,
          parentId: request.parent!.id,
          provider: payload.provider,
          clientIp: request.ip,
        });
      },
    );

    app.post(
      '/public/:tenantSlug/orders/:orderNo/payment-sync',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { tenantSlug, orderNo } = request.params as { tenantSlug: string; orderNo: string };
        await resolveTenantForParent(app.db, tenantSlug, request.parent!.tenantId);
        return new PaymentService(app).syncProviderPayment({
          orderNo,
          parentId: request.parent!.id,
        });
      },
    );

    // Development-only shortcut to drive the buy→credit loop without a provider.
    app.post(
      '/public/:tenantSlug/orders/:orderNo/mock-pay',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { tenantSlug, orderNo } = request.params as { tenantSlug: string; orderNo: string };
        await resolveTenantForParent(app.db, tenantSlug, request.parent!.tenantId);
        return new PaymentService(app).markMockPaid({
          orderNo,
          parentId: request.parent!.id,
        });
      },
    );

    app.get('/public/:tenantSlug/payment-providers', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = await findTenantBySlug(app.db, tenantSlug);
      if (!tenant) {
        throw httpError(404, 'Tenant not found');
      }

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

    app.get(
      '/v1/tenants/:tenantId/payment-providers',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return new PaymentSettingsService(app).getOverview({ includeMock: true });
      },
    );

    app.get(
      '/v1/tenants/:tenantId/payment-settings',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return new PaymentSettingsService(app).getOverview();
      },
    );

    app.put(
      '/v1/tenants/:tenantId/payment-settings/wechat',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const payload = wechatSettingsSchema.parse(request.body);
        const updatedBy = (request.user as { sub?: string }).sub;
        return new PaymentSettingsService(app).upsertWechatSettings(payload, updatedBy);
      },
    );

    app.put(
      '/v1/tenants/:tenantId/payment-settings/alipay',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const payload = alipaySettingsSchema.parse(request.body);
        const updatedBy = (request.user as { sub?: string }).sub;
        return new PaymentSettingsService(app).upsertAlipaySettings(payload, updatedBy);
      },
    );

    app.delete(
      '/v1/tenants/:tenantId/payment-settings/:provider',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const { provider } = providerParamSchema.parse(request.params);
        await new PaymentSettingsService(app).clearProviderSettings(provider);
        return { ok: true };
      },
    );
  },
};
