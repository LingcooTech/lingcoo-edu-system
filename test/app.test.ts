import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { and, eq } from 'drizzle-orm';

import { buildApp } from '../src/app.js';
import * as schema from '../src/db/schema.js';
import type { AppEnv } from '../src/lib/env.js';
import { hashPassword } from '../src/lib/password.js';
import { LessonNotificationService } from '../src/modules/notifications/lesson-notification-service.js';

const testEnv: AppEnv = {
  NODE_ENV: 'test',
  APP_NAME: 'fd-edu-system',
  API_HOST: '127.0.0.1',
  API_PORT: 0,
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_SECRET: 'test-secret-at-least-12-chars',
  DATABASE_URL: 'postgres://fd_edu:fd_edu@localhost:5434/fd_edu',
  REDIS_URL: 'redis://localhost:6381',
  LOG_LEVEL: 'silent',
  WECHAT_MINI_PROGRAM_APP_ID: 'test-mini-app',
  WECHAT_MINI_PROGRAM_APP_SECRET: 'test-mini-secret',
};

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function phoneFromSuffix(suffix: string, prefix = '136') {
  return `${prefix}${String(parseInt(suffix.replaceAll('-', '').slice(0, 8), 16))
    .slice(-8)
    .padStart(8, '0')}`;
}

function futureDateFromSuffix(suffix: string, year: number) {
  const minuteOffset = parseInt(suffix.replaceAll('-', '').slice(0, 8), 16) % (365 * 24 * 60);
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0) + minuteOffset * 60_000);
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function installWechatSubscribeMock(env: AppEnv, sentPayloads: Array<Record<string, unknown>>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, 'api.weixin.qq.com');

    if (url.pathname === '/cgi-bin/token') {
      assert.equal(url.searchParams.get('appid'), env.WECHAT_MINI_PROGRAM_APP_ID);
      assert.equal(url.searchParams.get('secret'), env.WECHAT_MINI_PROGRAM_APP_SECRET);
      return jsonResponse({
        access_token: `token-${env.WECHAT_MINI_PROGRAM_APP_ID}`,
        expires_in: 7200,
      });
    }

    if (url.pathname === '/cgi-bin/message/subscribe/send') {
      sentPayloads.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return jsonResponse({ errcode: 0, msgid: sentPayloads.length });
    }

    throw new Error(`Unexpected WeChat API call: ${url.pathname}`);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function createLessonNotificationFixture(
  app: TestApp,
  suffix: string,
  input: {
    appId: string;
    startsAt: Date;
    balance?: number;
  },
) {
  const phone = phoneFromSuffix(suffix);
  const [guardian] = await app.db
    .insert(schema.guardians)
    .values({ name: `Lesson Guardian ${suffix.slice(0, 8)}`, phone })
    .returning();
  const [account] = await app.db
    .insert(schema.accounts)
    .values({
      role: 'parent',
      phone,
      passwordHash: hashPassword('test-password'),
      displayName: guardian.name,
      guardianId: guardian.id,
    })
    .returning();
  const openid = `openid-lesson-${suffix}`;
  await app.db.insert(schema.accountWechatIdentities).values({
    accountId: account.id,
    appId: input.appId,
    openid,
  });
  const [student] = await app.db
    .insert(schema.students)
    .values({
      guardianId: guardian.id,
      name: `Lesson Student ${suffix.slice(0, 8)}`,
      grade: '三年级',
      status: 'active',
    })
    .returning();
  const [campus] = await app.db
    .insert(schema.campuses)
    .values({ name: `Lesson Campus ${suffix.slice(0, 8)}` })
    .returning();
  const [course] = await app.db
    .insert(schema.courses)
    .values({
      campusId: campus.id,
      slug: `lesson-notify-${suffix}`,
      name: 'Lesson Notify Course',
      category: '编程',
      ageRange: '8-10 岁',
      durationMinutes: 60,
      summary: 'Lesson notification course',
      content: '',
      status: 'published',
    })
    .returning();
  const [teacher] = await app.db
    .insert(schema.teachers)
    .values({ name: `Lesson Teacher ${suffix.slice(0, 8)}`, status: 'active' })
    .returning();
  const [classroom] = await app.db
    .insert(schema.classrooms)
    .values({ campusId: campus.id, name: `Room ${suffix.slice(0, 8)}`, status: 'active' })
    .returning();
  const [classGroup] = await app.db
    .insert(schema.classes)
    .values({
      campusId: campus.id,
      courseId: course.id,
      teacherId: teacher.id,
      classroomId: classroom.id,
      name: `Lesson Class ${suffix.slice(0, 8)}`,
      status: 'active',
    })
    .returning();
  const [session] = await app.db
    .insert(schema.classSessions)
    .values({
      classId: classGroup.id,
      teacherId: teacher.id,
      classroomId: classroom.id,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + 60 * 60 * 1000),
      topic: 'Lesson notification topic',
      status: 'scheduled',
    })
    .returning();
  await app.db
    .insert(schema.classEnrollments)
    .values({ classId: classGroup.id, studentId: student.id, active: true });
  const [lessonAccount] = await app.db
    .insert(schema.lessonAccounts)
    .values({ studentId: student.id, courseId: course.id, balance: input.balance ?? 6 })
    .returning();

  return {
    guardian,
    account,
    openid,
    student,
    campus,
    course,
    teacher,
    classroom,
    classGroup,
    session,
    lessonAccount,
  };
}

test('serves health and readiness probes', async () => {
  const app = await buildApp(testEnv);

  try {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { ok: true });
    assert.match(
      health.headers['content-security-policy'] as string,
      /img-src 'self' data: blob: https:/,
    );

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { ok: true, checks: { api: true, db: true } });
  } finally {
    await app.close();
  }
});

test('exposes the public organization home payload', async () => {
  const app = await buildApp(testEnv);

  try {
    const response = await app.inject({ method: 'GET', url: '/public/home' });

    assert.equal(response.statusCode, 200);
    assert.equal(typeof response.json().organization.name, 'string');
    assert.equal(typeof response.json().organization.publicProfile.headline, 'string');
    assert.ok(Array.isArray(response.json().featuredCourses));
    assert.ok(Array.isArray(response.json().campuses));
  } finally {
    await app.close();
  }
});

test('exposes configured WeChat Mini Program subscribe templates', async () => {
  const app = await buildApp({
    ...testEnv,
    WECHAT_MINI_SUBSCRIBE_TRIAL_TEMPLATE_ID: 'trial-template-id',
    WECHAT_MINI_SUBSCRIBE_PAYMENT_TEMPLATE_ID: 'payment-template-id',
    WECHAT_MINI_SUBSCRIBE_LESSON_REMINDER_TEMPLATE_ID: 'reminder-template-id',
    WECHAT_MINI_SUBSCRIBE_LESSON_CONSUMED_TEMPLATE_ID: 'consumed-template-id',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/public/wechat-mini/subscribe-templates',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().templates, [
      {
        key: 'trial_registration',
        label: '预约试听通知',
        templateId: 'trial-template-id',
      },
      {
        key: 'payment_success',
        label: '支付成功通知',
        templateId: 'payment-template-id',
      },
      {
        key: 'lesson_reminder',
        label: '课前提醒',
        templateId: 'reminder-template-id',
      },
      {
        key: 'lesson_consumed',
        label: '课消通知',
        templateId: 'consumed-template-id',
      },
    ]);
  } finally {
    await app.close();
  }
});

test('does not expose unconfigured WeChat Mini Program subscribe templates', async () => {
  const app = await buildApp(testEnv);

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/public/wechat-mini/subscribe-templates',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { templates: [] });
  } finally {
    await app.close();
  }
});

test('creates Qiniu upload tokens and lists images under the default prefix', async () => {
  const qiniuEnv: AppEnv = {
    ...testEnv,
    QINIU_ACCESS_KEY: 'qiniu-access-key',
    QINIU_SECRET_KEY: 'qiniu-secret-key',
    QINIU_BUCKET_NAME: 'fd-assets',
    QINIU_PUBLIC_BASE_URL: 'https://cdn.example.com',
    QINIU_UPLOAD_HOST: 'https://upload.qiniup.com',
    QINIU_DEFAULT_PREFIX: 'fd-edu',
  };
  const app = await buildApp(qiniuEnv);
  const originalFetch = globalThis.fetch;
  let listPrefix = '';

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'rsf.qiniuapi.com') {
      assert.equal(url.pathname, '/list');
      assert.equal(url.searchParams.get('bucket'), 'fd-assets');
      listPrefix = url.searchParams.get('prefix') ?? '';
      return jsonResponse({
        items: [
          {
            key: 'fd-edu/brand/logo/logo.png',
            fsize: 1234,
            mimeType: 'image/png',
            putTime: 17_000_000_000_000_000,
          },
        ],
      });
    }

    assert.equal(url.hostname, 'upload.qiniup.com');
    assert.equal(init?.method, 'POST');
    assert.ok(init?.body instanceof FormData);
    const formData = init.body;
    const key = String(formData.get('key'));
    assert.match(key, /^fd-edu\/brand\/logo\/\d{4}\/\d{2}\/\d{2}\/Logo-01-/);
    assert.match(String(formData.get('token')), /^qiniu-access-key:/);
    const file = formData.get('file');
    assert.ok(file instanceof Blob);
    assert.equal(file.type, 'image/png');
    assert.equal(await file.text(), 'image-data');
    return new Response(JSON.stringify({ key, hash: 'qiniu-hash' }), { status: 200 });
  }) as typeof fetch;

  try {
    const token = await app.jwt.sign({ sub: randomUUID(), role: 'admin' }, { expiresIn: '1h' });
    const uploadToken = await app.inject({
      method: 'POST',
      url: '/v1/storage/qiniu/upload-token',
      headers: { authorization: `Bearer ${token}` },
      payload: { filename: 'Logo 01.png', prefix: 'brand/logo' },
    });
    assert.equal(uploadToken.statusCode, 200, uploadToken.body);
    const uploadPayload = uploadToken.json();
    assert.match(uploadPayload.key, /^fd-edu\/brand\/logo\/\d{4}\/\d{2}\/\d{2}\/Logo-01-/);
    assert.match(uploadPayload.key, /\.png$/);
    assert.equal(uploadPayload.uploadHost, 'https://upload.qiniup.com');
    assert.equal(uploadPayload.publicUrl, `https://cdn.example.com/${uploadPayload.key}`);
    assert.match(uploadPayload.uploadToken, /^qiniu-access-key:/);
    assert.doesNotMatch(uploadPayload.uploadToken, /qiniu-secret-key/);

    const images = await app.inject({
      method: 'GET',
      url: '/v1/storage/qiniu/images?prefix=brand/logo',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(images.statusCode, 200, images.body);
    assert.equal(listPrefix, 'fd-edu/brand/logo');
    assert.equal(images.json().items[0].url, 'https://cdn.example.com/fd-edu/brand/logo/logo.png');

    const upload = await app.inject({
      method: 'POST',
      url: '/v1/storage/qiniu/upload?filename=Logo%2001.png&prefix=brand/logo',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'image/png',
      },
      payload: Buffer.from('image-data'),
    });
    assert.equal(upload.statusCode, 200, upload.body);
    const uploadedPayload = upload.json();
    assert.match(uploadedPayload.key, /^fd-edu\/brand\/logo\/\d{4}\/\d{2}\/\d{2}\/Logo-01-/);
    assert.equal(uploadedPayload.publicUrl, `https://cdn.example.com/${uploadedPayload.key}`);
    assert.equal(uploadedPayload.url, uploadedPayload.publicUrl);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('binds and reuses a WeChat Mini Program parent account', async () => {
  const app = await buildApp(testEnv);
  const originalFetch = globalThis.fetch;
  const openid = `openid-${randomUUID()}`;
  const suffix = randomUUID();
  const phone = `139${String(parseInt(suffix.replaceAll('-', '').slice(0, 8), 16))
    .slice(-8)
    .padStart(8, '0')}`;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.hostname, 'api.weixin.qq.com');
    assert.equal(url.pathname, '/sns/jscode2session');
    assert.equal(url.searchParams.get('appid'), testEnv.WECHAT_MINI_PROGRAM_APP_ID);
    assert.equal(url.searchParams.get('secret'), testEnv.WECHAT_MINI_PROGRAM_APP_SECRET);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        openid,
        session_key: 'session-key',
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const [guardian] = await app.db
      .insert(schema.guardians)
      .values({ name: 'Mini Guardian', phone })
      .returning();
    const [student] = await app.db
      .insert(schema.students)
      .values({
        guardianId: guardian.id,
        name: 'Mini Student',
        grade: '一年级',
        status: 'active',
      })
      .returning();
    const [course] = await app.db
      .insert(schema.courses)
      .values({
        slug: `mini-parent-${suffix}`,
        name: 'Mini Parent Course',
        category: '书法',
        ageRange: '6-8 岁',
        durationMinutes: 60,
        summary: 'Parent center test course',
        content: '',
        status: 'published',
      })
      .returning();
    const [pkg] = await app.db
      .insert(schema.coursePackages)
      .values({
        courseId: course.id,
        name: '12 课时包',
        description: '',
        lessonCount: 12,
        priceAmount: 129900,
        status: 'active',
      })
      .returning();
    await app.db
      .insert(schema.lessonAccounts)
      .values({ studentId: student.id, courseId: course.id, balance: 8 });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/wechat-mini/login',
      payload: { code: 'wx-code' },
    });
    assert.equal(login.statusCode, 200);
    const loginPayload = login.json();
    assert.equal(loginPayload.bound, false);
    assert.equal(typeof loginPayload.bindToken, 'string');

    const bind = await app.inject({
      method: 'POST',
      url: '/auth/wechat-mini/bind-phone',
      payload: {
        bindToken: loginPayload.bindToken,
        phone,
        displayName: 'Mini Parent',
      },
    });
    assert.equal(bind.statusCode, 200);
    const bindPayload = bind.json();
    assert.equal(bindPayload.accountCreated, true);
    assert.equal(bindPayload.account.role, 'parent');
    assert.equal(bindPayload.account.phone, phone);
    assert.equal(bindPayload.defaultPassword, phone.slice(-6));
    assert.equal(typeof bindPayload.token, 'string');

    await app.db.insert(schema.orders).values({
      accountId: bindPayload.account.id,
      studentId: student.id,
      courseId: course.id,
      packageId: pkg.id,
      orderNo: `TEST${Date.now()}${suffix.slice(0, 8)}`,
      amount: pkg.priceAmount,
      paidAmount: 0,
      lessonCount: pkg.lessonCount,
      status: 'pending',
      source: 'test',
    });

    const children = await app.inject({
      method: 'GET',
      url: '/public/me/children',
      headers: { authorization: `Bearer ${bindPayload.token}` },
    });
    assert.equal(children.statusCode, 200);
    assert.equal(children.json().children[0].id, student.id);

    const lessonAccounts = await app.inject({
      method: 'GET',
      url: '/public/me/lesson-accounts',
      headers: { authorization: `Bearer ${bindPayload.token}` },
    });
    assert.equal(lessonAccounts.statusCode, 200);
    assert.equal(lessonAccounts.json().lessonAccounts[0].course.name, course.name);
    assert.equal(lessonAccounts.json().lessonAccounts[0].student.name, student.name);

    const orders = await app.inject({
      method: 'GET',
      url: '/public/me/orders',
      headers: { authorization: `Bearer ${bindPayload.token}` },
    });
    assert.equal(orders.statusCode, 200);
    assert.equal(orders.json().orders[0].course.name, course.name);
    assert.equal(orders.json().orders[0].package.name, pkg.name);

    const secondLogin = await app.inject({
      method: 'POST',
      url: '/auth/wechat-mini/login',
      payload: { code: 'wx-code' },
    });
    assert.equal(secondLogin.statusCode, 200);
    const secondLoginPayload = secondLogin.json();
    assert.equal(secondLoginPayload.bound, true);
    assert.equal(secondLoginPayload.account.id, bindPayload.account.id);
    assert.equal(typeof secondLoginPayload.token, 'string');
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('creates and mock-pays a public package order', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();
  const phone = `138${String(parseInt(suffix.replaceAll('-', '').slice(0, 8), 16))
    .slice(-8)
    .padStart(8, '0')}`;

  try {
    const [course] = await app.db
      .insert(schema.courses)
      .values({
        slug: `mini-checkout-${suffix}`,
        name: 'Mini Checkout Course',
        category: '美术',
        ageRange: '7-9 岁',
        durationMinutes: 60,
        summary: 'Mini checkout course',
        content: '',
        status: 'published',
      })
      .returning();
    const [pkg] = await app.db
      .insert(schema.coursePackages)
      .values({
        courseId: course.id,
        name: '8 课时包',
        description: '',
        lessonCount: 8,
        priceAmount: 88000,
        status: 'active',
      })
      .returning();

    const checkout = await app.inject({
      method: 'POST',
      url: '/public/orders',
      payload: {
        packageId: pkg.id,
        guardianName: 'Mini Buyer',
        guardianPhone: phone,
        studentName: 'Checkout Student',
        grade: '二年级',
        source: 'mini_program',
        medium: 'wechat_mini_program',
      },
    });
    assert.equal(checkout.statusCode, 200);
    const checkoutPayload = checkout.json();
    assert.equal(checkoutPayload.order.status, 'pending');
    assert.equal(checkoutPayload.order.amount, pkg.priceAmount);
    assert.equal(checkoutPayload.checkout.defaultPassword, phone.slice(-6));

    const intent = await app.inject({
      method: 'POST',
      url: `/public/orders/${checkoutPayload.order.orderNo}/payment-intent`,
      payload: { provider: 'mock' },
    });
    assert.equal(intent.statusCode, 200);
    assert.equal(intent.json().item.nextAction, 'mock_pay');

    const paid = await app.inject({
      method: 'POST',
      url: `/public/orders/${checkoutPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(paid.statusCode, 200);
    assert.equal(paid.json().item.status, 'paid');
    assert.equal(paid.json().item.paidAmount, pkg.priceAmount);

    const [lessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, checkoutPayload.order.studentId),
          eq(schema.lessonAccounts.courseId, course.id),
        ),
      )
      .limit(1);
    assert.ok(lessonAccount);
    assert.equal(lessonAccount.balance, pkg.lessonCount);
  } finally {
    await app.close();
  }
});

test('creates a WeChat Mini Program payment intent for a bound parent order', async () => {
  const payEnv: AppEnv = {
    ...testEnv,
    PUBLIC_BASE_URL: 'https://api.example.com',
    WECHAT_PAY_APP_ID: testEnv.WECHAT_MINI_PROGRAM_APP_ID,
    WECHAT_PAY_APP_SECRET: 'wechat-pay-secret',
    WECHAT_PAY_MCH_ID: '1234567890',
    WECHAT_PAY_KEY: '12345678901234567890123456789012',
  };
  const app = await buildApp(payEnv);
  const originalFetch = globalThis.fetch;
  const suffix = randomUUID();
  let requestXml = '';

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestXml = String(init?.body ?? '');
    return {
      ok: true,
      status: 200,
      text: async () =>
        '<xml><return_code><![CDATA[SUCCESS]]></return_code><result_code><![CDATA[SUCCESS]]></result_code><prepay_id><![CDATA[wx-prepay-id]]></prepay_id></xml>',
    } as Response;
  }) as typeof fetch;

  try {
    const [guardian] = await app.db
      .insert(schema.guardians)
      .values({ name: 'JSAPI Guardian', phone: `137${suffix.replaceAll('-', '').slice(0, 8)}` })
      .returning();
    const [account] = await app.db
      .insert(schema.accounts)
      .values({
        role: 'parent',
        phone: guardian.phone,
        passwordHash: hashPassword('test-password'),
        displayName: guardian.name,
        guardianId: guardian.id,
      })
      .returning();
    await app.db.insert(schema.accountWechatIdentities).values({
      accountId: account.id,
      appId: payEnv.WECHAT_PAY_APP_ID!,
      openid: `openid-jsapi-${suffix}`,
    });
    const [student] = await app.db
      .insert(schema.students)
      .values({
        guardianId: guardian.id,
        name: 'JSAPI Student',
        grade: '三年级',
        status: 'active',
      })
      .returning();
    const [course] = await app.db
      .insert(schema.courses)
      .values({
        slug: `mini-jsapi-${suffix}`,
        name: 'Mini JSAPI Course',
        category: '编程',
        ageRange: '8-10 岁',
        durationMinutes: 60,
        summary: 'Mini JSAPI course',
        content: '',
        status: 'published',
      })
      .returning();
    const [pkg] = await app.db
      .insert(schema.coursePackages)
      .values({
        courseId: course.id,
        name: '10 课时包',
        description: '',
        lessonCount: 10,
        priceAmount: 108000,
        status: 'active',
      })
      .returning();
    const [order] = await app.db
      .insert(schema.orders)
      .values({
        accountId: account.id,
        studentId: student.id,
        courseId: course.id,
        packageId: pkg.id,
        orderNo: `JSAPI${Date.now()}${suffix.slice(0, 8)}`,
        amount: pkg.priceAmount,
        paidAmount: 0,
        lessonCount: pkg.lessonCount,
        status: 'pending',
        source: 'test',
      })
      .returning();
    const token = await app.jwt.sign({ sub: account.id, role: 'parent' }, { expiresIn: '1h' });

    const response = await app.inject({
      method: 'POST',
      url: `/public/orders/${order.orderNo}/wechat-mini-payment-intent`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    const intent = response.json().item;
    assert.equal(intent.mode, 'mini_program_jsapi');
    assert.equal(intent.nextAction, 'request_payment');
    assert.equal(intent.payload.package, 'prepay_id=wx-prepay-id');
    assert.equal(intent.payload.signType, 'HMAC-SHA256');
    assert.equal(typeof intent.payload.paySign, 'string');
    assert.match(requestXml, /<trade_type><!\[CDATA\[JSAPI\]\]><\/trade_type>/);
    assert.match(
      requestXml,
      new RegExp(`<openid><!\\[CDATA\\[openid-jsapi-${suffix}\\]\\]></openid>`),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('sends upcoming lesson reminders idempotently', async () => {
  const suffix = randomUUID();
  const reminderEnv: AppEnv = {
    ...testEnv,
    WECHAT_MINI_PROGRAM_APP_ID: `lesson-reminder-app-${suffix}`,
    WECHAT_MINI_SUBSCRIBE_LESSON_REMINDER_TEMPLATE_ID: 'reminder-template-id',
  };
  const app = await buildApp(reminderEnv);
  const sentPayloads: Array<Record<string, unknown>> = [];
  const restoreFetch = installWechatSubscribeMock(reminderEnv, sentPayloads);
  const startsAt = futureDateFromSuffix(suffix, 2040);

  try {
    const fixture = await createLessonNotificationFixture(app, suffix, {
      appId: reminderEnv.WECHAT_MINI_PROGRAM_APP_ID!,
      startsAt,
    });
    const service = new LessonNotificationService({
      db: app.db,
      env: reminderEnv,
      log: app.log,
    });
    const now = new Date(startsAt.getTime() - 30_000);

    const firstRun = await service.runUpcomingLessonReminders({
      now,
      windowHours: 1 / 60,
    });
    assert.equal(firstRun.scannedTargets, 1);
    assert.equal(firstRun.notificationsCreated, 1);
    assert.equal(firstRun.wechatSent, 1);
    assert.equal(sentPayloads.length, 1);

    const secondRun = await service.runUpcomingLessonReminders({
      now,
      windowHours: 1 / 60,
    });
    assert.equal(secondRun.notificationsCreated, 0);
    assert.equal(secondRun.wechatSent, 0);
    assert.equal(sentPayloads.length, 1);

    const sentPayload = sentPayloads[0] as {
      touser: string;
      template_id: string;
      data: Record<string, { value: string }>;
    };
    assert.equal(sentPayload.touser, fixture.openid);
    assert.equal(sentPayload.template_id, 'reminder-template-id');
    assert.equal(sentPayload.data.thing1.value, fixture.student.name.slice(0, 20));

    const [notification] = await app.db
      .select()
      .from(schema.notifications)
      .where(
        eq(
          schema.notifications.dedupeKey,
          `lesson.reminder:${fixture.account.id}:${fixture.session.id}:${fixture.student.id}`,
        ),
      )
      .limit(1);
    assert.ok(notification);
    assert.equal(notification.title, '课前提醒');
  } finally {
    restoreFetch();
    await app.close();
  }
});

test('creates lesson consumption notifications after admin attendance once', async () => {
  const suffix = randomUUID();
  const consumedEnv: AppEnv = {
    ...testEnv,
    WECHAT_MINI_PROGRAM_APP_ID: `lesson-consumed-app-${suffix}`,
    WECHAT_MINI_SUBSCRIBE_LESSON_CONSUMED_TEMPLATE_ID: 'consumed-template-id',
  };
  const app = await buildApp(consumedEnv);
  const sentPayloads: Array<Record<string, unknown>> = [];
  const restoreFetch = installWechatSubscribeMock(consumedEnv, sentPayloads);

  try {
    const fixture = await createLessonNotificationFixture(app, suffix, {
      appId: consumedEnv.WECHAT_MINI_PROGRAM_APP_ID!,
      startsAt: futureDateFromSuffix(suffix, 2041),
      balance: 5,
    });
    const adminToken = await app.jwt.sign(
      { sub: randomUUID(), role: 'admin' },
      { expiresIn: '1h' },
    );

    const firstResponse = await app.inject({
      method: 'POST',
      url: `/v1/class-sessions/${fixture.session.id}/attendance`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        records: [{ studentId: fixture.student.id, status: 'present' }],
      },
    });
    assert.equal(firstResponse.statusCode, 200, firstResponse.body);
    assert.equal(sentPayloads.length, 1);

    const [lessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(eq(schema.lessonAccounts.id, fixture.lessonAccount.id))
      .limit(1);
    assert.equal(lessonAccount.balance, 4);

    const dedupeKey = `lesson.consumed:${fixture.account.id}:${fixture.session.id}:${fixture.student.id}`;
    const [notification] = await app.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.dedupeKey, dedupeKey))
      .limit(1);
    assert.ok(notification);
    assert.equal(notification.title, '课时已扣减');
    assert.match(notification.body, /剩余 4 课时/);

    const sentPayload = sentPayloads[0] as {
      template_id: string;
      data: Record<string, { value: string }>;
    };
    assert.equal(sentPayload.template_id, 'consumed-template-id');
    assert.equal(sentPayload.data.thing3.value, '扣减 1 课时，剩余 4 课时');

    const secondResponse = await app.inject({
      method: 'POST',
      url: `/v1/class-sessions/${fixture.session.id}/attendance`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        records: [{ studentId: fixture.student.id, status: 'present' }],
      },
    });
    assert.equal(secondResponse.statusCode, 200, secondResponse.body);

    const notifications = await app.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.dedupeKey, dedupeKey));
    assert.equal(notifications.length, 1);
    assert.equal(sentPayloads.length, 1);
  } finally {
    restoreFetch();
    await app.close();
  }
});
