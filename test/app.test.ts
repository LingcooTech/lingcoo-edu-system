import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { and, eq } from 'drizzle-orm';

import { buildApp } from '../src/app.js';
import * as schema from '../src/db/schema.js';
import type { AppEnv } from '../src/lib/env.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { LessonNotificationService } from '../src/modules/notifications/lesson-notification-service.js';

const testEnv: AppEnv = {
  NODE_ENV: 'test',
  APP_NAME: 'lingcoo-edu-system',
  API_HOST: '127.0.0.1',
  API_PORT: 0,
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_SECRET: 'test-secret-at-least-12-chars',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://fd_edu:fd_edu@localhost:5434/fd_edu',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6381',
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
      courseId: course.id,
      teacherId: teacher.id,
      classroomId: classroom.id,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + 60 * 60 * 1000),
      topic: 'Lesson notification topic',
      status: 'scheduled',
    })
    .returning();
  await app.db.insert(schema.classEnrollments).values({
    classId: classGroup.id,
    studentId: student.id,
    billingCourseId: course.id,
    active: true,
  });
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
    assert.equal(typeof response.json().organization.publicProfile.eyebrow, 'string');
    assert.equal(typeof response.json().organization.publicProfile.bannerTitle, 'string');
    assert.equal(typeof response.json().organization.publicProfile.bannerSubtitle, 'string');
    assert.equal(typeof response.json().organization.publicProfile.highlights[0]?.icon, 'string');
    assert.equal(typeof response.json().organization.publicProfile.highlights[0]?.title, 'string');
    assert.equal(typeof response.json().organization.publicProfile.highlights[0]?.text, 'string');
    assert.equal(
      typeof response.json().organization.publicProfile.testimonials[0]?.content,
      'string',
    );
    assert.ok(Array.isArray(response.json().organization.publicProfile.studentStories));
    assert.equal(typeof response.json().organization.publicProfile.growthLoop.title, 'string');
    assert.ok(Array.isArray(response.json().organization.publicProfile.growthLoop.steps));
    assert.ok(Array.isArray(response.json().featuredCourses));
    assert.ok(Array.isArray(response.json().contentItems));
    assert.ok(Array.isArray(response.json().campuses));
    assert.ok(Array.isArray(response.json().teachers));
  } finally {
    await app.close();
  }
});

test('manages and exposes published content marketing items', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();
  const token = await app.jwt.sign({ sub: randomUUID(), role: 'admin' }, { expiresIn: '1h' });

  try {
    const create = await app.inject({
      method: 'POST',
      url: '/v1/admin/content',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: `成长故事 ${suffix}`,
        slug: `story-${suffix}`,
        excerpt: '一次稳定的成长记录',
        content: '<p>孩子从试听到持续练习，逐步建立了课堂习惯。</p>',
        authorName: '一年级学员',
        status: 'published',
        sourceType: 'manual',
      },
    });
    assert.equal(create.statusCode, 201, create.body);
    assert.equal(create.json().status, 'published');
    assert.equal(typeof create.json().publishedAt, 'string');

    const adminList = await app.inject({
      method: 'GET',
      url: `/v1/admin/content?search=${suffix}&status=published`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(adminList.statusCode, 200, adminList.body);
    assert.equal(adminList.json().items[0].slug, `story-${suffix}`);

    const publicList = await app.inject({
      method: 'GET',
      url: `/public/stories?search=${suffix}`,
    });
    assert.equal(publicList.statusCode, 200, publicList.body);
    assert.equal(publicList.json().items[0].slug, `story-${suffix}`);

    const detail = await app.inject({
      method: 'GET',
      url: `/public/stories/story-${suffix}`,
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().title, `成长故事 ${suffix}`);

    const draft = await app.inject({
      method: 'POST',
      url: '/v1/admin/content',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: `草稿 ${suffix}`,
        slug: `draft-${suffix}`,
        content: '暂不公开',
        status: 'draft',
        sourceType: 'manual',
      },
    });
    assert.equal(draft.statusCode, 201, draft.body);

    const hidden = await app.inject({
      method: 'GET',
      url: `/public/stories/draft-${suffix}`,
    });
    assert.equal(hidden.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('stores content import settings without exposing secrets', async () => {
  const app = await buildApp(testEnv);
  const token = await app.jwt.sign({ sub: randomUUID(), role: 'admin' }, { expiresIn: '1h' });
  const settingKey = 'system.content.import';
  const [originalSetting] = await app.db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, settingKey))
    .limit(1);

  try {
    await app.db.delete(schema.settings).where(eq(schema.settings.key, settingKey));

    const initial = await app.inject({
      method: 'GET',
      url: '/v1/system-settings/content-import',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(initial.statusCode, 200, initial.body);
    assert.equal(initial.json().configured, false);
    assert.equal(initial.json().source, 'none');

    const saved = await app.inject({
      method: 'PUT',
      url: '/v1/system-settings/content-import',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        wordpress: {
          siteUrl: 'https://example.com/',
          username: 'editor',
          appPassword: 'wp-secret',
        },
        notion: {
          apiToken: 'notion-secret',
        },
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().configured, true);
    assert.equal(saved.json().source, 'database');
    assert.equal(saved.json().values.wordpress.siteUrl, 'https://example.com');
    assert.equal(saved.json().values.wordpress.username, 'editor');
    assert.equal(saved.json().secrets.wordpress.appPassword.configured, true);
    assert.equal(saved.json().secrets.notion.apiToken.configured, true);
    assert.equal(saved.body.includes('wp-secret'), false);
    assert.equal(saved.body.includes('notion-secret'), false);

    const cleared = await app.inject({
      method: 'DELETE',
      url: '/v1/system-settings/content-import',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(cleared.statusCode, 200, cleared.body);

    const afterClear = await app.inject({
      method: 'GET',
      url: '/v1/system-settings/content-import',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(afterClear.statusCode, 200, afterClear.body);
    assert.equal(afterClear.json().configured, false);
  } finally {
    await app.db.delete(schema.settings).where(eq(schema.settings.key, settingKey));
    if (originalSetting) {
      await app.db.insert(schema.settings).values(originalSetting);
    }
    await app.close();
  }
});

test('exposes public institution detail with media items', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();

  try {
    const [institution] = await app.db
      .insert(schema.institutions)
      .values({
        name: `机构详情 ${suffix}`,
        intro: '机构详情介绍',
        contact: '电话 0571-0000',
        qualificationItems: [
          { imageUrl: 'https://cdn.example.com/license.jpg', caption: '办学资质' },
        ],
        outcomeItems: [{ imageUrl: 'https://cdn.example.com/outcome.jpg', caption: '阶段成果展' }],
        sortOrder: 999,
        status: 'active',
      })
      .returning();

    const detail = await app.inject({
      method: 'GET',
      url: `/public/institutions/${institution.id}`,
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().institution.name, `机构详情 ${suffix}`);
    assert.equal(detail.json().institution.qualificationItems[0].caption, '办学资质');
    assert.equal(
      detail.json().institution.outcomeItems[0].imageUrl,
      'https://cdn.example.com/outcome.jpg',
    );
    assert.ok(Array.isArray(detail.json().teachers));
    assert.ok(Array.isArray(detail.json().courses));
  } finally {
    await app.db
      .delete(schema.institutions)
      .where(eq(schema.institutions.name, `机构详情 ${suffix}`));
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
        label: '预约通知',
        templateId: 'trial-template-id',
      },
      {
        key: 'payment_success',
        label: '支付成功通知',
        templateId: 'payment-template-id',
      },
      {
        key: 'lesson_reminder',
        label: '日程提醒',
        templateId: 'reminder-template-id',
      },
      {
        key: 'lesson_consumed',
        label: '核销成功通知',
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

    await app.db
      .update(schema.orders)
      .set({ status: 'refunded', paidAmount: 0, updatedAt: new Date() })
      .where(eq(schema.orders.id, checkoutPayload.order.id));

    const refundedSync = await app.inject({
      method: 'POST',
      url: `/public/orders/${checkoutPayload.order.orderNo}/payment-sync`,
    });
    assert.equal(refundedSync.statusCode, 200, refundedSync.body);
    assert.equal(refundedSync.json().item.status, 'refunded');
    assert.equal(refundedSync.json().reconciliation.status, 'refunded');

    const lateMockPay = await app.inject({
      method: 'POST',
      url: `/public/orders/${checkoutPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(lateMockPay.statusCode, 409);

    const [unchangedLessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, checkoutPayload.order.studentId),
          eq(schema.lessonAccounts.courseId, course.id),
        ),
      )
      .limit(1);
    assert.ok(unchangedLessonAccount);
    assert.equal(unchangedLessonAccount.balance, pkg.lessonCount);
  } finally {
    await app.close();
  }
});

test('creates, voids, and recreates settlement batches for paid receiver orders', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();
  const paidAt = futureDateFromSuffix(suffix, 2040);

  try {
    const [admin] = await app.db
      .insert(schema.accounts)
      .values({
        role: 'admin',
        email: `settlement-admin-${suffix}@example.com`,
        passwordHash: hashPassword('test-password'),
        displayName: 'Settlement Admin',
      })
      .returning();
    const adminToken = await app.jwt.sign({ sub: admin.id, role: 'admin' }, { expiresIn: '1h' });

    const [campus] = await app.db
      .insert(schema.campuses)
      .values({ name: `Settlement Campus ${suffix.slice(0, 8)}` })
      .returning();
    const [guardian] = await app.db
      .insert(schema.guardians)
      .values({
        name: `Settlement Guardian ${suffix.slice(0, 8)}`,
        phone: phoneFromSuffix(suffix, '139'),
      })
      .returning();
    const [student] = await app.db
      .insert(schema.students)
      .values({
        guardianId: guardian.id,
        name: `Settlement Student ${suffix.slice(0, 8)}`,
        grade: '二年级',
        status: 'active',
      })
      .returning();
    const [course] = await app.db
      .insert(schema.courses)
      .values({
        campusId: campus.id,
        slug: `settlement-course-${suffix}`,
        name: 'Settlement Course',
        category: '书法',
        ageRange: '6-9 岁',
        durationMinutes: 60,
        paymentReceiverType: 'provider',
        paymentReceiverName: '结算合作方',
        summary: 'Settlement course',
        content: '',
        status: 'published',
      })
      .returning();
    const [firstOrder, secondOrder] = await app.db
      .insert(schema.orders)
      .values([
        {
          studentId: student.id,
          courseId: course.id,
          orderNo: `SETTLE${suffix.slice(0, 8)}A`,
          orderType: 'seat_reservation',
          amount: 990,
          paidAmount: 990,
          lessonCount: 0,
          paymentReceiverType: 'provider',
          paymentReceiverName: '结算合作方',
          status: 'paid',
          paidAt,
          source: 'test',
        },
        {
          studentId: student.id,
          courseId: course.id,
          orderNo: `SETTLE${suffix.slice(0, 8)}B`,
          orderType: 'manual_package_grant',
          amount: 88000,
          paidAmount: 88000,
          lessonCount: 8,
          paymentReceiverType: 'provider',
          paymentReceiverName: '结算合作方',
          status: 'paid',
          paidAt: new Date(paidAt.getTime() + 60_000),
          source: 'test',
        },
      ])
      .returning();

    const listBefore = await app.inject({
      method: 'GET',
      url: '/v1/settlement-batches',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listBefore.statusCode, 200, listBefore.body);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/settlement-batches',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        paymentReceiverType: 'provider',
        paymentReceiverName: '结算合作方',
        startsAt: new Date(paidAt.getTime() - 60_000).toISOString(),
        endsAt: new Date(paidAt.getTime() + 120_000).toISOString(),
      },
    });
    assert.equal(created.statusCode, 200, created.body);
    const createdPayload = created.json();
    assert.equal(createdPayload.settlementBatch.orderCount, 2);
    assert.equal(
      createdPayload.settlementBatch.totalAmount,
      firstOrder.paidAmount + secondOrder.paidAmount,
    );
    assert.equal(createdPayload.settlementBatch.orders.length, 2);

    const repeated = await app.inject({
      method: 'POST',
      url: '/v1/settlement-batches',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        paymentReceiverType: 'provider',
        paymentReceiverName: '结算合作方',
        startsAt: new Date(paidAt.getTime() - 60_000).toISOString(),
        endsAt: new Date(paidAt.getTime() + 120_000).toISOString(),
      },
    });
    assert.equal(repeated.statusCode, 422);

    const voided = await app.inject({
      method: 'POST',
      url: `/v1/settlement-batches/${createdPayload.settlementBatch.id}/void`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(voided.statusCode, 200, voided.body);
    assert.equal(voided.json().settlementBatch.status, 'voided');

    const recreated = await app.inject({
      method: 'POST',
      url: '/v1/settlement-batches',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        paymentReceiverType: 'provider',
        paymentReceiverName: '结算合作方',
        startsAt: new Date(paidAt.getTime() - 60_000).toISOString(),
        endsAt: new Date(paidAt.getTime() + 120_000).toISOString(),
      },
    });
    assert.equal(recreated.statusCode, 200, recreated.body);
    assert.equal(recreated.json().settlementBatch.orderCount, 2);
  } finally {
    await app.close();
  }
});

test('creates and links parent accounts from student profiles', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();

  try {
    const [admin] = await app.db
      .insert(schema.accounts)
      .values({
        role: 'admin',
        email: `student-admin-${suffix}@example.com`,
        passwordHash: hashPassword('test-password'),
        displayName: 'Student Admin',
      })
      .returning();
    const adminToken = await app.jwt.sign({ sub: admin.id, role: 'admin' }, { expiresIn: '1h' });

    const createPhone = phoneFromSuffix(suffix, '135');
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Student Create ${suffix.slice(0, 8)}`,
        grade: '一年级',
        guardianName: `Guardian Create ${suffix.slice(0, 8)}`,
        guardianPhone: createPhone,
        createParentAccount: true,
        status: 'active',
      },
    });
    assert.equal(createResponse.statusCode, 200, createResponse.body);
    assert.equal(createResponse.json().parentAccountCreated, true);
    assert.equal(createResponse.json().defaultPassword, createPhone.slice(-6));

    const [createdAccount] = await app.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.phone, createPhone))
      .limit(1);
    assert.equal(createdAccount.role, 'parent');
    assert.equal(createdAccount.guardianId, createResponse.json().student.guardianId);
    assert.equal(verifyPassword(createPhone.slice(-6), createdAccount.passwordHash), true);

    const [bareStudent] = await app.db
      .insert(schema.students)
      .values({
        name: `Student Edit ${suffix.slice(0, 8)}`,
        grade: '二年级',
        status: 'active',
      })
      .returning();
    const editPhone = phoneFromSuffix(randomUUID(), '134');
    const editResponse = await app.inject({
      method: 'PATCH',
      url: `/v1/students/${bareStudent.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        guardianName: `Guardian Edit ${suffix.slice(0, 8)}`,
        guardianPhone: editPhone,
        createParentAccount: true,
      },
    });
    assert.equal(editResponse.statusCode, 200, editResponse.body);
    assert.equal(editResponse.json().parentAccountCreated, true);
    assert.equal(editResponse.json().student.guardian.phone, editPhone);

    const [editedAccount] = await app.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.phone, editPhone))
      .limit(1);
    assert.equal(editedAccount.role, 'parent');
    assert.equal(editedAccount.guardianId, editResponse.json().student.guardianId);
    assert.equal(verifyPassword(editPhone.slice(-6), editedAccount.passwordHash), true);
  } finally {
    await app.close();
  }
});

test('creates a course contract with offline payment, lesson credit and class enrollment', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();

  try {
    const [admin] = await app.db
      .insert(schema.accounts)
      .values({
        role: 'admin',
        email: `contract-admin-${suffix}@example.com`,
        passwordHash: hashPassword('test-password'),
        displayName: 'Contract Admin',
      })
      .returning();
    const adminToken = await app.jwt.sign({ sub: admin.id, role: 'admin' }, { expiresIn: '1h' });

    const [campus] = await app.db
      .insert(schema.campuses)
      .values({ name: `Contract Campus ${suffix.slice(0, 8)}` })
      .returning();
    const [institution] = await app.db
      .insert(schema.institutions)
      .values({
        name: `Contract Provider ${suffix.slice(0, 8)}`,
        status: 'active',
      })
      .returning();
    const [guardian] = await app.db
      .insert(schema.guardians)
      .values({
        name: `Contract Guardian ${suffix.slice(0, 8)}`,
        phone: phoneFromSuffix(suffix, '136'),
      })
      .returning();
    const [student] = await app.db
      .insert(schema.students)
      .values({
        guardianId: guardian.id,
        name: `Contract Student ${suffix.slice(0, 8)}`,
        grade: '一年级',
        status: 'active',
      })
      .returning();
    const [course] = await app.db
      .insert(schema.courses)
      .values({
        campusId: campus.id,
        slug: `contract-course-${suffix}`,
        name: 'Contract Course',
        category: '魔方',
        ageRange: '6-9 岁',
        durationMinutes: 60,
        providerInstitutionId: institution.id,
        paymentReceiverType: 'provider',
        paymentReceiverInstitutionId: institution.id,
        paymentReceiverName: institution.name,
        summary: 'Contract course',
        content: '',
        status: 'published',
      })
      .returning();
    const [giftCourse] = await app.db
      .insert(schema.courses)
      .values({
        campusId: campus.id,
        slug: `contract-gift-course-${suffix}`,
        name: 'Contract Gift Course',
        category: '书法',
        ageRange: '6-9 岁',
        durationMinutes: 60,
        summary: 'Contract gift course',
        content: '',
        status: 'published',
      })
      .returning();
    const [coursePackage] = await app.db
      .insert(schema.coursePackages)
      .values({
        courseId: course.id,
        name: '16 课时正式班',
        description: '',
        lessonCount: 16,
        priceAmount: 168000,
        status: 'active',
      })
      .returning();
    const [teacher] = await app.db
      .insert(schema.teachers)
      .values({ name: `Contract Teacher ${suffix.slice(0, 8)}`, status: 'active' })
      .returning();
    const [classroom] = await app.db
      .insert(schema.classrooms)
      .values({
        campusId: campus.id,
        name: `Contract Room ${suffix.slice(0, 8)}`,
        capacity: 8,
        status: 'active',
      })
      .returning();
    const [classGroup] = await app.db
      .insert(schema.classes)
      .values({
        campusId: campus.id,
        courseId: course.id,
        teacherId: teacher.id,
        classroomId: classroom.id,
        name: `Contract Class ${suffix.slice(0, 8)}`,
        capacity: 8,
        status: 'active',
      })
      .returning();
    const [giftClass] = await app.db
      .insert(schema.classes)
      .values({
        campusId: campus.id,
        courseId: giftCourse.id,
        teacherId: teacher.id,
        classroomId: classroom.id,
        name: `Contract Gift Class ${suffix.slice(0, 8)}`,
        capacity: 8,
        status: 'active',
      })
      .returning();

    const created = await app.inject({
      method: 'POST',
      url: '/v1/course-contracts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        studentId: student.id,
        courseId: course.id,
        classId: classGroup.id,
        packageId: coursePackage.id,
        lessonCount: coursePackage.lessonCount,
        paidAmount: 158000,
        paymentMethod: 'wechat_offline',
        startsAt: futureDateFromSuffix(suffix, 2040).toISOString(),
        note: '线下优惠收款',
        gifts: [
          {
            courseId: giftCourse.id,
            classId: giftClass.id,
            lessonCount: 3,
            reason: 'group_signup',
            note: '组团报名赠软笔',
          },
        ],
      },
    });
    assert.equal(created.statusCode, 200, created.body);
    const createdPayload = created.json();
    assert.equal(createdPayload.courseContract.status, 'active');
    assert.equal(createdPayload.courseContract.remainingLessonCount, coursePackage.lessonCount);
    assert.equal(createdPayload.courseContract.student.id, student.id);
    assert.equal(createdPayload.courseContract.course.id, course.id);
    assert.equal(createdPayload.courseContract.package.id, coursePackage.id);
    assert.equal(createdPayload.courseContract.order.orderType, 'manual_package_grant');
    assert.equal(createdPayload.courseContract.order.status, 'paid');
    assert.equal(createdPayload.courseContract.order.amount, coursePackage.priceAmount);
    assert.equal(createdPayload.courseContract.order.paidAmount, 158000);
    assert.equal(createdPayload.courseContract.order.paymentReceiverType, 'provider');
    assert.equal(createdPayload.courseContract.order.paymentReceiverName, institution.name);
    assert.equal(createdPayload.courseContract.gifts.length, 1);
    assert.equal(createdPayload.courseContract.gifts[0].course.id, giftCourse.id);
    assert.equal(createdPayload.paymentRecord.paidAmount, 158000);
    assert.equal(createdPayload.enrollment.classId, classGroup.id);

    const [lessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student.id),
          eq(schema.lessonAccounts.courseId, course.id),
        ),
      )
      .limit(1);
    assert.ok(lessonAccount);
    assert.equal(lessonAccount.balance, coursePackage.lessonCount);

    const [giftLessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student.id),
          eq(schema.lessonAccounts.courseId, giftCourse.id),
        ),
      )
      .limit(1);
    assert.ok(giftLessonAccount);
    assert.equal(giftLessonAccount.balance, 3);

    const [lessonTransaction] = await app.db
      .select()
      .from(schema.lessonTransactions)
      .where(
        and(
          eq(schema.lessonTransactions.studentId, student.id),
          eq(schema.lessonTransactions.relatedEntityType, 'course_contract'),
          eq(schema.lessonTransactions.relatedEntityId, createdPayload.courseContract.id),
        ),
      )
      .limit(1);
    assert.ok(lessonTransaction);
    assert.equal(lessonTransaction.amount, coursePackage.lessonCount);

    const [giftTransaction] = await app.db
      .select()
      .from(schema.lessonTransactions)
      .where(
        and(
          eq(schema.lessonTransactions.studentId, student.id),
          eq(schema.lessonTransactions.relatedEntityType, 'course_contract_gift'),
          eq(schema.lessonTransactions.relatedEntityId, createdPayload.courseContract.gifts[0].id),
        ),
      )
      .limit(1);
    assert.ok(giftTransaction);
    assert.equal(giftTransaction.amount, 3);

    const [enrollment] = await app.db
      .select()
      .from(schema.classEnrollments)
      .where(
        and(
          eq(schema.classEnrollments.classId, classGroup.id),
          eq(schema.classEnrollments.studentId, student.id),
        ),
      )
      .limit(1);
    assert.ok(enrollment);
    assert.equal(enrollment.active, true);

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/course-contracts',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listed.statusCode, 200, listed.body);
    const listedContract = listed
      .json()
      .courseContracts.find((item: { id: string }) => item.id === createdPayload.courseContract.id);
    assert.ok(listedContract);
    assert.equal(listedContract.student.name, student.name);
    assert.equal(listedContract.class.name, classGroup.name);
    assert.equal(listedContract.paymentRecords.length, 1);
    assert.equal(listedContract.gifts.length, 1);
    assert.equal(listedContract.gifts[0].course.name, giftCourse.name);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/course-contracts/${createdPayload.courseContract.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { lessonCount: coursePackage.lessonCount + 2 },
    });
    assert.equal(edited.statusCode, 200, edited.body);

    const [editedLessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student.id),
          eq(schema.lessonAccounts.courseId, course.id),
        ),
      )
      .limit(1);
    assert.ok(editedLessonAccount);
    assert.equal(editedLessonAccount.balance, coursePackage.lessonCount + 2);
    assert.equal(edited.json().courseContract.remainingLessonCount, coursePackage.lessonCount + 2);

    const [unchangedGiftLessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student.id),
          eq(schema.lessonAccounts.courseId, giftCourse.id),
        ),
      )
      .limit(1);
    assert.ok(unchangedGiftLessonAccount);
    assert.equal(unchangedGiftLessonAccount.balance, 3);

    const addedGift = await app.inject({
      method: 'POST',
      url: `/v1/course-contracts/${createdPayload.courseContract.id}/gifts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        courseId: giftCourse.id,
        lessonCount: 2,
        reason: 'retention',
        note: '创建档案后补赠课',
      },
    });
    assert.equal(addedGift.statusCode, 200, addedGift.body);
    assert.equal(addedGift.json().gift.course.id, giftCourse.id);
    assert.equal(addedGift.json().gift.lessonCount, 2);

    const [supplementGiftLessonAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student.id),
          eq(schema.lessonAccounts.courseId, giftCourse.id),
        ),
      )
      .limit(1);
    assert.ok(supplementGiftLessonAccount);
    assert.equal(supplementGiftLessonAccount.balance, 5);

    const [supplementGiftTransaction] = await app.db
      .select()
      .from(schema.lessonTransactions)
      .where(
        and(
          eq(schema.lessonTransactions.studentId, student.id),
          eq(schema.lessonTransactions.relatedEntityType, 'course_contract_gift'),
          eq(schema.lessonTransactions.relatedEntityId, addedGift.json().gift.id),
        ),
      )
      .limit(1);
    assert.ok(supplementGiftTransaction);
    assert.equal(supplementGiftTransaction.amount, 2);

    const listedAfterSupplementGift = await app.inject({
      method: 'GET',
      url: '/v1/course-contracts',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listedAfterSupplementGift.statusCode, 200, listedAfterSupplementGift.body);
    const supplementedContract = listedAfterSupplementGift
      .json()
      .courseContracts.find((item: { id: string }) => item.id === createdPayload.courseContract.id);
    assert.ok(supplementedContract);
    assert.equal(supplementedContract.gifts.length, 2);

    const [periodPackage] = await app.db
      .insert(schema.coursePackages)
      .values({
        courseId: course.id,
        name: '同课程月卡',
        description: '',
        billingType: 'period',
        periodUnit: 'month',
        periodCount: 1,
        lessonCount: 4,
        priceAmount: 68000,
        status: 'active',
      })
      .returning();
    const periodStartsAt = new Date(createdPayload.courseContract.startsAt);
    const periodCreated = await app.inject({
      method: 'POST',
      url: '/v1/course-contracts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        studentId: student.id,
        courseId: course.id,
        classId: classGroup.id,
        packageId: periodPackage.id,
        lessonCount: periodPackage.lessonCount,
        paidAmount: 68000,
        paymentMethod: 'wechat_offline',
        startsAt: periodStartsAt.toISOString(),
      },
    });
    assert.equal(periodCreated.statusCode, 200, periodCreated.body);
    const periodContract = periodCreated.json().courseContract;
    assert.equal(periodContract.remainingLessonCount, 4);

    const temporarilyUnassigned = await app.inject({
      method: 'PATCH',
      url: `/v1/course-contracts/${periodContract.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { classId: null },
    });
    assert.equal(temporarilyUnassigned.statusCode, 200, temporarilyUnassigned.body);
    assert.equal(temporarilyUnassigned.json().courseContract.classId, null);

    const listAfterHistoricalEnrollment = await app.inject({
      method: 'GET',
      url: '/v1/course-contracts',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listAfterHistoricalEnrollment.statusCode, 200, listAfterHistoricalEnrollment.body);
    const backfilledContract = listAfterHistoricalEnrollment
      .json()
      .courseContracts.find((item: { id: string }) => item.id === periodContract.id);
    assert.equal(backfilledContract.classId, classGroup.id);
    const [syncedPeriodContract] = await app.db
      .select()
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.id, periodContract.id))
      .limit(1);
    assert.equal(syncedPeriodContract.classId, classGroup.id);

    const removedEnrollment = await app.inject({
      method: 'DELETE',
      url: `/v1/classes/${classGroup.id}/enrollments/${enrollment.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(removedEnrollment.statusCode, 200, removedEnrollment.body);
    const [unassignedAfterRemoval] = await app.db
      .select()
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.id, periodContract.id))
      .limit(1);
    assert.equal(unassignedAfterRemoval.classId, null);

    const reenrolled = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classGroup.id}/enrollments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { studentId: student.id, billingCourseId: course.id },
    });
    assert.equal(reenrolled.statusCode, 200, reenrolled.body);

    const sessionStartsAt = new Date(periodStartsAt.getTime() + 24 * 60 * 60 * 1000);
    const [attendanceSession] = await app.db
      .insert(schema.classSessions)
      .values({
        classId: classGroup.id,
        courseId: course.id,
        teacherId: teacher.id,
        classroomId: classroom.id,
        startsAt: sessionStartsAt,
        endsAt: new Date(sessionStartsAt.getTime() + 60 * 60 * 1000),
        topic: '多课时包扣课测试',
        status: 'scheduled',
      })
      .returning();

    const sources = await app.inject({
      method: 'GET',
      url: `/v1/class-sessions/${attendanceSession.id}/attendance-sources`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(sources.statusCode, 200, sources.body);
    assert.equal(sources.json().lessonSourcesByStudentId[student.id][0].id, periodContract.id);

    const attendance = await app.inject({
      method: 'POST',
      url: `/v1/class-sessions/${attendanceSession.id}/attendance`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { records: [{ studentId: student.id, status: 'present' }] },
    });
    assert.equal(attendance.statusCode, 200, attendance.body);
    assert.equal(attendance.json().attendanceRecords[0].courseContractId, periodContract.id);
    assert.equal(
      attendance.json().attendanceRecords[0].lessonSource.packageName,
      periodPackage.name,
    );

    const correctedAttendance = await app.inject({
      method: 'PATCH',
      url: `/v1/class-sessions/${attendanceSession.id}/attendance/${student.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        status: 'present',
        courseContractId: createdPayload.courseContract.id,
      },
    });
    assert.equal(correctedAttendance.statusCode, 200, correctedAttendance.body);
    assert.equal(
      correctedAttendance.json().attendanceRecord.courseContractId,
      createdPayload.courseContract.id,
    );

    const [ordinaryAfterCorrection] = await app.db
      .select()
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.id, createdPayload.courseContract.id))
      .limit(1);
    const [periodAfterCorrection] = await app.db
      .select()
      .from(schema.courseContracts)
      .where(eq(schema.courseContracts.id, periodContract.id))
      .limit(1);
    assert.equal(ordinaryAfterCorrection.remainingLessonCount, coursePackage.lessonCount + 1);
    assert.equal(periodAfterCorrection.remainingLessonCount, periodPackage.lessonCount);

    const [targetGuardian] = await app.db
      .insert(schema.guardians)
      .values({
        name: `Contract Target Guardian ${suffix.slice(0, 8)}`,
        phone: phoneFromSuffix(suffix, '135'),
      })
      .returning();
    const [targetStudent] = await app.db
      .insert(schema.students)
      .values({
        guardianId: targetGuardian.id,
        name: `Contract Target Student ${suffix.slice(0, 8)}`,
        grade: '二年级',
        status: 'active',
      })
      .returning();
    const [targetCourse] = await app.db
      .insert(schema.courses)
      .values({
        campusId: campus.id,
        slug: `contract-target-course-${suffix}`,
        name: 'Contract Target Course',
        category: '编程',
        ageRange: '7-10 岁',
        durationMinutes: 60,
        providerInstitutionId: institution.id,
        paymentReceiverType: 'provider',
        paymentReceiverInstitutionId: institution.id,
        paymentReceiverName: institution.name,
        summary: 'Contract target course',
        content: '',
        status: 'published',
      })
      .returning();
    const [targetPackage] = await app.db
      .insert(schema.coursePackages)
      .values({
        courseId: targetCourse.id,
        name: '迁移后的 6 课时包',
        description: '',
        lessonCount: 6,
        priceAmount: 60000,
        status: 'active',
      })
      .returning();
    const [targetClass] = await app.db
      .insert(schema.classes)
      .values({
        campusId: campus.id,
        courseId: targetCourse.id,
        teacherId: teacher.id,
        classroomId: classroom.id,
        name: `Contract Target Class ${suffix.slice(0, 8)}`,
        capacity: 8,
        status: 'active',
      })
      .returning();

    const fullyEdited = await app.inject({
      method: 'PATCH',
      url: `/v1/course-contracts/${periodContract.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        studentId: targetStudent.id,
        courseId: targetCourse.id,
        classId: targetClass.id,
        packageId: targetPackage.id,
        title: '迁移后的正式课程档案',
        lessonCount: targetPackage.lessonCount,
        paidAmount: targetPackage.priceAmount,
        paymentMethod: 'bank_transfer',
        startsAt: futureDateFromSuffix(suffix, 2041).toISOString(),
        endsAt: null,
        note: '修正原档案归属',
      },
    });
    assert.equal(fullyEdited.statusCode, 200, fullyEdited.body);
    assert.equal(fullyEdited.json().courseContract.student.id, targetStudent.id);
    assert.equal(fullyEdited.json().courseContract.course.id, targetCourse.id);
    assert.equal(fullyEdited.json().courseContract.package.id, targetPackage.id);
    assert.equal(fullyEdited.json().courseContract.class.id, targetClass.id);
    assert.equal(fullyEdited.json().courseContract.remainingLessonCount, 6);

    const [oldAccountAfterReassignment] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student.id),
          eq(schema.lessonAccounts.courseId, course.id),
        ),
      )
      .limit(1);
    const [targetAccountAfterReassignment] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, targetStudent.id),
          eq(schema.lessonAccounts.courseId, targetCourse.id),
        ),
      )
      .limit(1);
    assert.equal(oldAccountAfterReassignment.balance, coursePackage.lessonCount + 1);
    assert.equal(targetAccountAfterReassignment.balance, targetPackage.lessonCount);

    const [reassignedOrder] = await app.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, periodContract.orderId))
      .limit(1);
    assert.equal(reassignedOrder.studentId, targetStudent.id);
    assert.equal(reassignedOrder.courseId, targetCourse.id);
    assert.equal(reassignedOrder.packageId, targetPackage.id);
    assert.equal(reassignedOrder.lessonCount, targetPackage.lessonCount);

    const completed = await app.inject({
      method: 'PATCH',
      url: `/v1/course-contracts/${createdPayload.courseContract.id}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'completed' },
    });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(completed.json().courseContract.status, 'completed');

    const [attendedLead] = await app.db
      .insert(schema.leads)
      .values({
        campusId: campus.id,
        courseId: course.id,
        trialSessionId: null,
        guardianName: `Lead Contract Guardian ${suffix.slice(0, 8)}`,
        phone: phoneFromSuffix(suffix, '137'),
        studentName: `Lead Contract Student ${suffix.slice(0, 8)}`,
        grade: '大班',
        source: 'test',
        status: 'trial_attended',
      })
      .returning();

    const fromLead = await app.inject({
      method: 'POST',
      url: `/v1/crm/leads/${attendedLead.id}/course-contract`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        courseId: course.id,
        classId: classGroup.id,
        packageId: coursePackage.id,
        lessonCount: coursePackage.lessonCount,
        paidAmount: 168000,
        paymentMethod: 'bank_transfer',
        school: '测试小学',
        note: '普通试听转正式课',
      },
    });
    assert.equal(fromLead.statusCode, 200, fromLead.body);
    const fromLeadPayload = fromLead.json();
    assert.equal(fromLeadPayload.courseContract.order.orderType, 'manual_package_grant');
    assert.equal(fromLeadPayload.lead.status, 'paid');
    assert.equal(fromLeadPayload.lead.convertedStudentId, fromLeadPayload.student.id);
    assert.equal(fromLeadPayload.student.school, '测试小学');
    assert.equal(fromLeadPayload.enrollment.classId, classGroup.id);

    const [seatLead] = await app.db
      .insert(schema.leads)
      .values({
        campusId: campus.id,
        courseId: course.id,
        guardianName: `Seat Contract Guardian ${suffix.slice(0, 8)}`,
        phone: phoneFromSuffix(suffix, '138'),
        studentName: `Seat Contract Student ${suffix.slice(0, 8)}`,
        grade: '中班',
        source: 'test',
        status: 'trial_attended',
      })
      .returning();
    const [seatOrder] = await app.db
      .insert(schema.orders)
      .values({
        studentId: null,
        courseId: course.id,
        orderNo: `SEATCON${suffix.replaceAll('-', '').slice(0, 12)}`,
        orderType: 'seat_reservation',
        amount: 990,
        paidAmount: 990,
        lessonCount: 0,
        paymentReceiverType: 'provider',
        paymentReceiverInstitutionId: institution.id,
        paymentReceiverName: institution.name,
        status: 'paid',
        paidAt: new Date(),
        source: 'test',
      })
      .returning();
    const [seatReservation] = await app.db
      .insert(schema.seatReservations)
      .values({
        orderId: seatOrder.id,
        orderNo: seatOrder.orderNo,
        leadId: seatLead.id,
        campusId: campus.id,
        courseId: course.id,
        guardianName: seatLead.guardianName,
        phone: seatLead.phone,
        studentName: seatLead.studentName,
        grade: seatLead.grade,
        reservationFeeAmount: 990,
        reservationStatus: 'reserved',
        paymentStatus: 'paid',
        checkInStatus: 'checked_in',
        checkedInAt: new Date(),
        source: 'test',
      })
      .returning();

    const fromSeat = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${seatReservation.id}/course-contract`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        courseId: course.id,
        classId: classGroup.id,
        packageId: coursePackage.id,
        lessonCount: coursePackage.lessonCount,
        paidAmount: 168000,
        paymentMethod: 'wechat_offline',
        note: '占位费到课转正式课',
      },
    });
    assert.equal(fromSeat.statusCode, 200, fromSeat.body);
    const fromSeatPayload = fromSeat.json();
    assert.equal(fromSeatPayload.courseContract.courseId, course.id);
    assert.equal(fromSeatPayload.seatReservation.id, seatReservation.id);
    assert.equal(fromSeatPayload.lead.status, 'paid');
    assert.equal(fromSeatPayload.lead.convertedStudentId, fromSeatPayload.student.id);
  } finally {
    await app.close();
  }
});

test('creates and mock-pays a public seat reservation without crediting lessons', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();
  const phone = phoneFromSuffix(suffix, '135');

  const [organization] = await app.db.select().from(schema.organization).limit(1);
  const previousSettings = organization?.settings;

  try {
    assert.ok(organization);
    const existingSettings =
      previousSettings && typeof previousSettings === 'object' && !Array.isArray(previousSettings)
        ? (previousSettings as Record<string, unknown>)
        : {};
    await app.db
      .update(schema.organization)
      .set({
        settings: {
          ...existingSettings,
          businessModel: {
            onlinePackageSalesEnabled: false,
            manualPackageGrantEnabled: true,
            packagePriceDisplayEnabled: true,
            seatReservationFeeEnabled: true,
          },
        },
      })
      .where(eq(schema.organization.id, organization.id));

    const [campus] = await app.db
      .insert(schema.campuses)
      .values({ name: `Seat Campus ${suffix.slice(0, 8)}` })
      .returning();
    const [course] = await app.db
      .insert(schema.courses)
      .values({
        campusId: campus.id,
        slug: `seat-reservation-${suffix}`,
        name: 'Seat Reservation Course',
        category: '书法',
        ageRange: '6-9 岁',
        durationMinutes: 60,
        paymentReceiverType: 'provider',
        paymentReceiverName: '亦安书画',
        summary: 'Seat reservation course',
        content: '',
        status: 'published',
      })
      .returning();
    const startsAt = futureDateFromSuffix(suffix, 2040);
    const [trialSession] = await app.db
      .insert(schema.trialSessions)
      .values({
        campusId: campus.id,
        courseId: course.id,
        title: '周六硬笔书法公开课',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
        bookedCount: 0,
        reservationFeeAmount: 990,
        reservationNotice: '开课前12小时以前可改期一次。',
        status: 'open',
      })
      .returning();

    const rejectedTrialRegistration = await app.inject({
      method: 'POST',
      url: '/public/trial-registrations',
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'Bypass Guardian',
        phone: phoneFromSuffix(suffix, '134'),
        studentName: 'Bypass Student',
        grade: '大班',
        source: 'h5',
      },
    });
    assert.equal(rejectedTrialRegistration.statusCode, 422);
    assert.match(rejectedTrialRegistration.json().message, /席位保留费/);

    const [channel] = await app.db
      .insert(schema.channels)
      .values({ code: `seat-${suffix.slice(0, 8)}`, name: 'Seat Channel' })
      .returning();
    const [campaign] = await app.db
      .insert(schema.campaigns)
      .values({
        channelId: channel.id,
        code: `seat-${suffix.slice(9, 17)}`,
        name: 'Seat Campaign',
        courseSlug: course.slug,
        medium: 'qr_code',
        status: 'active',
      })
      .returning();
    const rejectedCampaignParticipation = await app.inject({
      method: 'POST',
      url: `/public/crm/campaigns/${campaign.code}/participations`,
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'Campaign Bypass Guardian',
        phone: phoneFromSuffix(suffix, '133'),
        studentName: 'Campaign Bypass Student',
        grade: '大班',
        source: 'campaign',
      },
    });
    assert.equal(rejectedCampaignParticipation.statusCode, 422);
    assert.match(rejectedCampaignParticipation.json().message, /席位保留费/);

    const [rejectedSession] = await app.db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, trialSession.id))
      .limit(1);
    assert.equal(rejectedSession.bookedCount, 0);

    const reservation = await app.inject({
      method: 'POST',
      url: '/public/seat-reservations',
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'Seat Guardian',
        phone,
        studentName: 'Seat Student',
        grade: '大班',
        source: 'h5',
        medium: 'trial_qr',
      },
    });
    assert.equal(reservation.statusCode, 200, reservation.body);
    const reservationPayload = reservation.json();
    assert.equal(reservationPayload.order.orderType, 'seat_reservation');
    assert.equal(reservationPayload.order.amount, 990);
    assert.equal(reservationPayload.order.lessonCount, 0);
    assert.equal(reservationPayload.order.paymentReceiverType, 'provider');
    assert.equal(reservationPayload.order.paymentReceiverName, '亦安书画');
    assert.equal(reservationPayload.seatReservation.reservationStatus, 'pending_payment');
    assert.equal(reservationPayload.seatReservation.paymentStatus, 'unpaid');
    assert.equal(reservationPayload.lead.status, 'new');

    const [unpaidSession] = await app.db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, trialSession.id))
      .limit(1);
    assert.equal(unpaidSession.bookedCount, 0);

    const intent = await app.inject({
      method: 'POST',
      url: `/public/orders/${reservationPayload.order.orderNo}/payment-intent`,
      payload: { provider: 'mock' },
    });
    assert.equal(intent.statusCode, 200, intent.body);
    assert.equal(intent.json().item.nextAction, 'mock_pay');

    const paid = await app.inject({
      method: 'POST',
      url: `/public/orders/${reservationPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(paid.statusCode, 200, paid.body);
    assert.equal(paid.json().item.status, 'paid');
    assert.equal(paid.json().item.lessonCount, 0);

    const [paidReservation] = await app.db
      .select()
      .from(schema.seatReservations)
      .where(eq(schema.seatReservations.id, reservationPayload.seatReservation.id))
      .limit(1);
    assert.equal(paidReservation.reservationStatus, 'reserved');
    assert.equal(paidReservation.paymentStatus, 'paid');

    const [paidLead] = await app.db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, reservationPayload.lead.id))
      .limit(1);
    assert.equal(paidLead.status, 'trial_booked');

    const [paidSession] = await app.db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, trialSession.id))
      .limit(1);
    assert.equal(paidSession.bookedCount, 1);

    const adminToken = await app.jwt.sign(
      { sub: randomUUID(), role: 'admin' },
      { expiresIn: '1h' },
    );
    const checkIn = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${paidReservation.id}/check-in`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(checkIn.statusCode, 200, checkIn.body);
    assert.equal(checkIn.json().seatReservation.checkInStatus, 'checked_in');

    const [attendedLead] = await app.db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, reservationPayload.lead.id))
      .limit(1);
    assert.equal(attendedLead.status, 'trial_attended');

    const cancelCheckedIn = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${paidReservation.id}/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(cancelCheckedIn.statusCode, 422);

    const secondReservation = await app.inject({
      method: 'POST',
      url: '/public/seat-reservations',
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'Seat Guardian 2',
        phone: phoneFromSuffix(suffix, '132'),
        studentName: 'Seat Student 2',
        grade: '大班',
        source: 'h5',
        medium: 'trial_qr',
      },
    });
    assert.equal(secondReservation.statusCode, 200, secondReservation.body);
    const secondReservationPayload = secondReservation.json();
    const secondPaid = await app.inject({
      method: 'POST',
      url: `/public/orders/${secondReservationPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(secondPaid.statusCode, 200, secondPaid.body);

    const [twoPaidSession] = await app.db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, trialSession.id))
      .limit(1);
    assert.equal(twoPaidSession.bookedCount, 2);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${secondReservationPayload.seatReservation.id}/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    assert.equal(cancelled.json().seatReservation.reservationStatus, 'cancelled');
    assert.equal(cancelled.json().trialSession.bookedCount, 1);

    const noShowReservation = await app.inject({
      method: 'POST',
      url: '/public/seat-reservations',
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'Seat Guardian 3',
        phone: phoneFromSuffix(suffix, '131'),
        studentName: 'Seat Student 3',
        grade: '大班',
        source: 'h5',
        medium: 'trial_qr',
      },
    });
    assert.equal(noShowReservation.statusCode, 200, noShowReservation.body);
    const noShowReservationPayload = noShowReservation.json();
    const noShowPaid = await app.inject({
      method: 'POST',
      url: `/public/orders/${noShowReservationPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(noShowPaid.statusCode, 200, noShowPaid.body);

    const noShow = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${noShowReservationPayload.seatReservation.id}/no-show`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(noShow.statusCode, 200, noShow.body);
    assert.equal(noShow.json().seatReservation.checkInStatus, 'no_show');

    const [noShowLead] = await app.db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, noShowReservationPayload.lead.id))
      .limit(1);
    assert.equal(noShowLead.status, 'follow_up');

    const [noShowSession] = await app.db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, trialSession.id))
      .limit(1);
    assert.equal(noShowSession.bookedCount, 2);

    const targetStartsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [targetTrialSession] = await app.db
      .insert(schema.trialSessions)
      .values({
        campusId: campus.id,
        courseId: course.id,
        title: '周日硬笔书法公开课',
        startsAt: targetStartsAt,
        endsAt: new Date(targetStartsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
        bookedCount: 0,
        reservationFeeAmount: 990,
        reservationNotice: '开课前12小时以前可改期一次。',
        status: 'open',
      })
      .returning();
    const rescheduleReservation = await app.inject({
      method: 'POST',
      url: '/public/seat-reservations',
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'Seat Guardian 4',
        phone: phoneFromSuffix(suffix, '130'),
        studentName: 'Seat Student 4',
        grade: '大班',
        source: 'h5',
        medium: 'trial_qr',
      },
    });
    assert.equal(rescheduleReservation.statusCode, 200, rescheduleReservation.body);
    const rescheduleReservationPayload = rescheduleReservation.json();
    const reschedulePaid = await app.inject({
      method: 'POST',
      url: `/public/orders/${rescheduleReservationPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(reschedulePaid.statusCode, 200, reschedulePaid.body);

    const pastTargetStartsAt = new Date(Date.now() - 60 * 60 * 1000);
    const [pastTargetTrialSession] = await app.db
      .insert(schema.trialSessions)
      .values({
        campusId: campus.id,
        courseId: course.id,
        title: '已过期硬笔书法公开课',
        startsAt: pastTargetStartsAt,
        endsAt: new Date(pastTargetStartsAt.getTime() + 60 * 60 * 1000),
        capacity: 6,
        bookedCount: 0,
        reservationFeeAmount: 990,
        reservationNotice: '开课前12小时以前可改期一次。',
        status: 'open',
      })
      .returning();
    const expiredTargetReschedule = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${rescheduleReservationPayload.seatReservation.id}/reschedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { trialSessionId: pastTargetTrialSession.id },
    });
    assert.equal(expiredTargetReschedule.statusCode, 422);

    const rescheduled = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${rescheduleReservationPayload.seatReservation.id}/reschedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { trialSessionId: targetTrialSession.id },
    });
    assert.equal(rescheduled.statusCode, 200, rescheduled.body);
    assert.equal(rescheduled.json().seatReservation.trialSessionId, targetTrialSession.id);
    assert.equal(rescheduled.json().seatReservation.originalTrialSessionId, trialSession.id);
    assert.equal(rescheduled.json().seatReservation.rescheduleCount, 1);
    assert.equal(rescheduled.json().previousTrialSession.bookedCount, 2);
    assert.equal(rescheduled.json().trialSession.bookedCount, 1);

    const [rescheduledLead] = await app.db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, rescheduleReservationPayload.lead.id))
      .limit(1);
    assert.equal(rescheduledLead.trialSessionId, targetTrialSession.id);
    assert.equal(rescheduledLead.status, 'trial_booked');

    const repeatedReschedule = await app.inject({
      method: 'POST',
      url: `/v1/seat-reservations/${rescheduleReservationPayload.seatReservation.id}/reschedule`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { trialSessionId: trialSession.id },
    });
    assert.equal(repeatedReschedule.statusCode, 422);

    const lessonAccounts = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(eq(schema.lessonAccounts.courseId, course.id));
    assert.equal(lessonAccounts.length, 0);
  } finally {
    if (organization) {
      await app.db
        .update(schema.organization)
        .set({ settings: previousSettings ?? {} })
        .where(eq(schema.organization.id, organization.id));
    }
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
  let organizationId: string | null = null;
  let previousSettings: unknown = null;

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

    const [organization] = await app.db.select().from(schema.organization).limit(1);
    assert.ok(organization);
    organizationId = organization.id;
    previousSettings = organization.settings;
    const existingSettings =
      previousSettings && typeof previousSettings === 'object' && !Array.isArray(previousSettings)
        ? (previousSettings as Record<string, unknown>)
        : {};
    await app.db
      .update(schema.organization)
      .set({
        settings: {
          ...existingSettings,
          businessModel: {
            onlinePackageSalesEnabled: false,
            manualPackageGrantEnabled: true,
            packagePriceDisplayEnabled: true,
            seatReservationFeeEnabled: true,
          },
        },
      })
      .where(eq(schema.organization.id, organization.id));

    const [campus] = await app.db
      .insert(schema.campuses)
      .values({ name: `JSAPI Seat Campus ${suffix.slice(0, 8)}` })
      .returning();
    const startsAt = futureDateFromSuffix(suffix, 2040);
    const [trialSession] = await app.db
      .insert(schema.trialSessions)
      .values({
        campusId: campus.id,
        courseId: course.id,
        title: 'JSAPI Seat Trial',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        capacity: 8,
        reservationFeeAmount: 1990,
        reservationNotice: '',
        status: 'open',
      })
      .returning();

    const seatReservation = await app.inject({
      method: 'POST',
      url: '/public/seat-reservations',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'JSAPI Seat Guardian',
        phone: guardian.phone,
        studentName: 'JSAPI Seat Student',
        grade: '大班',
        source: 'mini_program',
        medium: 'wechat_mini_program',
      },
    });
    assert.equal(seatReservation.statusCode, 200, seatReservation.body);
    const seatReservationPayload = seatReservation.json();
    assert.equal(seatReservationPayload.order.orderType, 'seat_reservation');
    assert.equal(seatReservationPayload.order.accountId, account.id);

    const seatIntent = await app.inject({
      method: 'POST',
      url: `/public/orders/${seatReservationPayload.order.orderNo}/wechat-mini-payment-intent`,
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(seatIntent.statusCode, 200, seatIntent.body);
    assert.equal(seatIntent.json().item.mode, 'mini_program_jsapi');
    assert.equal(seatIntent.json().item.nextAction, 'request_payment');
    assert.match(requestXml, /试听席位保留费/);

    const parentCenterSeatReservation = await app.inject({
      method: 'POST',
      url: '/public/seat-reservations',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        trialSessionId: trialSession.id,
        guardianName: 'JSAPI Parent Center Guardian',
        phone: guardian.phone,
        studentName: 'JSAPI Parent Center Student',
        grade: '大班',
        source: 'mini_program',
        medium: 'wechat_mini_program',
      },
    });
    assert.equal(parentCenterSeatReservation.statusCode, 200, parentCenterSeatReservation.body);
    const parentCenterSeatReservationPayload = parentCenterSeatReservation.json();

    const seatPaid = await app.inject({
      method: 'POST',
      url: `/public/orders/${parentCenterSeatReservationPayload.order.orderNo}/mock-pay`,
    });
    assert.equal(seatPaid.statusCode, 200, seatPaid.body);

    const targetStartsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [targetTrialSession] = await app.db
      .insert(schema.trialSessions)
      .values({
        campusId: campus.id,
        courseId: course.id,
        title: 'JSAPI Seat Trial Target',
        startsAt: targetStartsAt,
        endsAt: new Date(targetStartsAt.getTime() + 60 * 60 * 1000),
        capacity: 8,
        reservationFeeAmount: 1990,
        reservationNotice: '',
        status: 'open',
      })
      .returning();
    type ParentSeatReservationPayload = typeof schema.seatReservations.$inferSelect & {
      canReschedule: boolean;
      trialSession: typeof schema.trialSessions.$inferSelect;
      rescheduleOptions: (typeof schema.trialSessions.$inferSelect)[];
    };

    const parentSeatReservations = await app.inject({
      method: 'GET',
      url: '/public/me/seat-reservations',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(parentSeatReservations.statusCode, 200, parentSeatReservations.body);
    const parentSeatReservationsPayload = parentSeatReservations.json() as {
      seatReservations: ParentSeatReservationPayload[];
    };
    const parentSeatReservation = parentSeatReservationsPayload.seatReservations.find(
      (item) => item.id === parentCenterSeatReservationPayload.seatReservation.id,
    );
    assert.ok(parentSeatReservation);
    assert.equal(parentSeatReservation.canReschedule, true);
    assert.equal(parentSeatReservation.trialSession.id, trialSession.id);
    assert.ok(
      parentSeatReservation.rescheduleOptions.some(
        (session: typeof schema.trialSessions.$inferSelect) => session.id === targetTrialSession.id,
      ),
    );

    const parentRescheduled = await app.inject({
      method: 'POST',
      url: `/public/me/seat-reservations/${parentCenterSeatReservationPayload.seatReservation.id}/reschedule`,
      headers: { authorization: `Bearer ${token}` },
      payload: { trialSessionId: targetTrialSession.id },
    });
    assert.equal(parentRescheduled.statusCode, 200, parentRescheduled.body);
    assert.equal(parentRescheduled.json().seatReservation.trialSessionId, targetTrialSession.id);
    assert.equal(parentRescheduled.json().seatReservation.rescheduleCount, 1);

    const otherParentToken = await app.jwt.sign(
      { sub: randomUUID(), role: 'parent' },
      { expiresIn: '1h' },
    );
    const otherParentReschedule = await app.inject({
      method: 'POST',
      url: `/public/me/seat-reservations/${parentCenterSeatReservationPayload.seatReservation.id}/reschedule`,
      headers: { authorization: `Bearer ${otherParentToken}` },
      payload: { trialSessionId: trialSession.id },
    });
    assert.equal(otherParentReschedule.statusCode, 404);

    const updatedParentSeatReservations = await app.inject({
      method: 'GET',
      url: '/public/me/seat-reservations',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(updatedParentSeatReservations.statusCode, 200, updatedParentSeatReservations.body);
    const updatedParentSeatReservationsPayload = updatedParentSeatReservations.json() as {
      seatReservations: ParentSeatReservationPayload[];
    };
    const updatedParentSeatReservation = updatedParentSeatReservationsPayload.seatReservations.find(
      (item) => item.id === parentCenterSeatReservationPayload.seatReservation.id,
    );
    assert.ok(updatedParentSeatReservation);
    assert.equal(updatedParentSeatReservation.canReschedule, false);
    assert.equal(updatedParentSeatReservation.trialSession.id, targetTrialSession.id);
    assert.equal(updatedParentSeatReservation.rescheduleCount, 1);
  } finally {
    if (organizationId) {
      await app.db
        .update(schema.organization)
        .set({ settings: previousSettings ?? {} })
        .where(eq(schema.organization.id, organizationId));
    }
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
    assert.equal(sentPayload.data.thing17.value, fixture.student.name.slice(0, 20));
    assert.equal(sentPayload.data.thing1.value, 'Lesson Notify Course');

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
    assert.equal(sentPayload.data.thing16.value, fixture.student.name.slice(0, 20));
    assert.equal(sentPayload.data.thing8.value, 'Lesson Notify Course');
    assert.equal(sentPayload.data.number3.value, '1');
    assert.equal(sentPayload.data.number4.value, '4');

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

test('lets a parent check in for class and submit homework from parent center', async () => {
  const app = await buildApp(testEnv);
  const suffix = randomUUID();

  try {
    const fixture = await createLessonNotificationFixture(app, suffix, {
      appId: testEnv.WECHAT_MINI_PROGRAM_APP_ID!,
      startsAt: new Date(Date.now() + 30 * 60 * 1000),
      balance: 3,
    });
    const parentToken = await app.jwt.sign(
      { sub: fixture.account.id, role: 'parent' },
      { expiresIn: '1h' },
    );
    const offlineOrderNo = `OFFLINE${suffix.replaceAll('-', '').slice(0, 12)}`;
    const [offlineOrder] = await app.db
      .insert(schema.orders)
      .values({
        studentId: fixture.student.id,
        courseId: fixture.course.id,
        orderNo: offlineOrderNo,
        orderType: 'manual_package_grant',
        amount: 128000,
        paidAmount: 128000,
        lessonCount: 8,
        paymentMethod: 'bank_transfer',
        status: 'paid',
        paidAt: new Date(),
        source: 'offline',
      })
      .returning();
    const seatOrderNo = `PSEAT${suffix.replaceAll('-', '').slice(0, 14)}`;
    const [seatOrder] = await app.db
      .insert(schema.orders)
      .values({
        studentId: fixture.student.id,
        courseId: fixture.course.id,
        orderNo: seatOrderNo,
        orderType: 'seat_reservation',
        amount: 990,
        paidAmount: 990,
        lessonCount: 0,
        status: 'paid',
        paidAt: new Date(),
        source: 'offline',
      })
      .returning();
    const [seatReservation] = await app.db
      .insert(schema.seatReservations)
      .values({
        orderId: seatOrder.id,
        orderNo: seatOrder.orderNo,
        campusId: fixture.campus.id,
        courseId: fixture.course.id,
        guardianName: fixture.guardian.name,
        phone: fixture.guardian.phone,
        studentName: fixture.student.name,
        grade: fixture.student.grade,
        reservationFeeAmount: seatOrder.paidAmount,
        reservationStatus: 'reserved',
        paymentStatus: 'paid',
        checkInStatus: 'pending',
        source: 'offline',
      })
      .returning();

    const parentOrders = await app.inject({
      method: 'GET',
      url: '/public/me/orders',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    assert.equal(parentOrders.statusCode, 200, parentOrders.body);
    const parentOrderPayload = parentOrders.json();
    assert.ok(
      parentOrderPayload.orders.some(
        (order: { id: string; accountId: string | null; student: { id: string } | null }) =>
          order.id === offlineOrder.id &&
          order.accountId === null &&
          order.student?.id === fixture.student.id,
      ),
    );

    const parentSeatReservations = await app.inject({
      method: 'GET',
      url: '/public/me/seat-reservations',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    assert.equal(parentSeatReservations.statusCode, 200, parentSeatReservations.body);
    assert.ok(
      parentSeatReservations
        .json()
        .seatReservations.some(
          (reservation: { id: string }) => reservation.id === seatReservation.id,
        ),
    );

    const offlineRefund = await app.inject({
      method: 'POST',
      url: `/public/me/orders/${offlineOrder.orderNo}/refund`,
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { reason: 'other', buyerNote: '线下补录订单退款测试' },
    });
    assert.equal(offlineRefund.statusCode, 200, offlineRefund.body);
    assert.equal(offlineRefund.json().refund.accountId, fixture.account.id);

    const parentRefunds = await app.inject({
      method: 'GET',
      url: '/public/me/refunds',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    assert.equal(parentRefunds.statusCode, 200, parentRefunds.body);
    assert.ok(
      parentRefunds
        .json()
        .refunds.some(
          (refund: { orderId: string; accountId: string | null }) =>
            refund.orderId === offlineOrder.id && refund.accountId === fixture.account.id,
        ),
    );

    const checkInList = await app.inject({
      method: 'GET',
      url: '/public/me/check-in-sessions',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    assert.equal(checkInList.statusCode, 200, checkInList.body);
    const checkInPayload = checkInList.json();
    const checkInItem = checkInPayload.checkInSessions.find(
      (item: { sessionId: string; student: { id: string } }) =>
        item.sessionId === fixture.session.id && item.student.id === fixture.student.id,
    );
    assert.ok(checkInItem);
    assert.equal(checkInItem.canCheckIn, true);

    const checkIn = await app.inject({
      method: 'POST',
      url: `/public/me/check-in-sessions/${fixture.session.id}/check-in`,
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { studentId: fixture.student.id },
    });
    assert.equal(checkIn.statusCode, 200, checkIn.body);
    assert.match(checkIn.json().message, /签到成功/);

    const [afterCheckInAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(eq(schema.lessonAccounts.id, fixture.lessonAccount.id))
      .limit(1);
    assert.equal(afterCheckInAccount.balance, 2);

    const repeatedCheckIn = await app.inject({
      method: 'POST',
      url: `/public/me/check-in-sessions/${fixture.session.id}/check-in`,
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { studentId: fixture.student.id },
    });
    assert.equal(repeatedCheckIn.statusCode, 200, repeatedCheckIn.body);
    assert.match(repeatedCheckIn.json().message, /已签到/);

    const [afterRepeatedAccount] = await app.db
      .select()
      .from(schema.lessonAccounts)
      .where(eq(schema.lessonAccounts.id, fixture.lessonAccount.id))
      .limit(1);
    assert.equal(afterRepeatedAccount.balance, 2);

    const homework = await app.inject({
      method: 'POST',
      url: '/public/me/homework-check-ins',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: {
        studentId: fixture.student.id,
        courseId: fixture.course.id,
        content: '今天完成控笔练习 2 页。',
        imageUrls: ['https://cdn.example.com/homework/sample.jpg'],
      },
    });
    assert.equal(homework.statusCode, 200, homework.body);
    const homeworkPayload = homework.json();
    assert.equal(homeworkPayload.homeworkCheckIn.student.id, fixture.student.id);
    assert.equal(homeworkPayload.homeworkCheckIn.course.id, fixture.course.id);
    assert.equal(homeworkPayload.homeworkCheckIn.imageUrls.length, 1);

    const [teacherAccount] = await app.db
      .insert(schema.accounts)
      .values({
        role: 'teacher',
        phone: phoneFromSuffix(randomUUID(), '138'),
        passwordHash: hashPassword('test-password'),
        displayName: fixture.teacher.name,
        teacherId: fixture.teacher.id,
      })
      .returning();
    const teacherToken = await app.jwt.sign(
      { sub: teacherAccount.id, role: 'teacher' },
      { expiresIn: '1h' },
    );

    const teacherHomeworkList = await app.inject({
      method: 'GET',
      url: '/public/teacher/homework-check-ins',
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(teacherHomeworkList.statusCode, 200, teacherHomeworkList.body);
    const teacherHomework = teacherHomeworkList
      .json()
      .homeworkCheckIns.find(
        (item: { id: string }) => item.id === homeworkPayload.homeworkCheckIn.id,
      );
    assert.ok(teacherHomework);
    assert.equal(teacherHomework.reviewStatus, 'submitted');

    const review = await app.inject({
      method: 'POST',
      url: `/public/teacher/homework-check-ins/${homeworkPayload.homeworkCheckIn.id}/review`,
      headers: { authorization: `Bearer ${teacherToken}` },
      payload: {
        reviewStatus: 'needs_revision',
        teacherFeedback: '控笔很好，第二页第三行需要重写。',
      },
    });
    assert.equal(review.statusCode, 200, review.body);
    assert.equal(review.json().homeworkCheckIn.reviewStatus, 'needs_revision');
    assert.equal(review.json().homeworkCheckIn.reviewer.id, fixture.teacher.id);

    const feedback = await app.inject({
      method: 'POST',
      url: `/public/teacher/sessions/${fixture.session.id}/feedbacks`,
      headers: { authorization: `Bearer ${teacherToken}` },
      payload: {
        items: [
          {
            studentId: fixture.student.id,
            content: '课堂专注度很好，横画稳定性继续保持。',
            imageUrls: ['https://cdn.example.com/feedback/sample.jpg'],
          },
        ],
      },
    });
    assert.equal(feedback.statusCode, 200, feedback.body);
    assert.equal(feedback.json().lessonFeedbacks.length, 1);
    assert.equal(feedback.json().lessonFeedbacks[0].teacher.id, fixture.teacher.id);

    const teacherFeedbackList = await app.inject({
      method: 'GET',
      url: '/public/teacher/lesson-feedbacks',
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(teacherFeedbackList.statusCode, 200, teacherFeedbackList.body);
    assert.ok(
      teacherFeedbackList
        .json()
        .lessonFeedbacks.some(
          (item: { classSessionId: string; student: { id: string } }) =>
            item.classSessionId === fixture.session.id && item.student.id === fixture.student.id,
        ),
    );

    const homeworkList = await app.inject({
      method: 'GET',
      url: '/public/me/homework-check-ins',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    assert.equal(homeworkList.statusCode, 200, homeworkList.body);
    assert.equal(homeworkList.json().homeworkCheckIns.length, 1);
    assert.equal(homeworkList.json().homeworkCheckIns[0].reviewStatus, 'needs_revision');
    assert.match(homeworkList.json().homeworkCheckIns[0].teacherFeedback, /第三行/);

    const parentFeedbackList = await app.inject({
      method: 'GET',
      url: '/public/me/lesson-feedbacks',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    assert.equal(parentFeedbackList.statusCode, 200, parentFeedbackList.body);
    assert.equal(parentFeedbackList.json().lessonFeedbacks.length, 1);
    assert.equal(parentFeedbackList.json().lessonFeedbacks[0].student.id, fixture.student.id);
    assert.equal(parentFeedbackList.json().lessonFeedbacks[0].class.id, fixture.classGroup.id);
    assert.match(parentFeedbackList.json().lessonFeedbacks[0].content, /横画稳定/);
  } finally {
    await app.close();
  }
});
