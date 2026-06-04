import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import type { AppEnv } from '../src/lib/env.js';

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

test('serves health and readiness probes', async () => {
  const app = await buildApp(testEnv);

  try {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { ok: true });

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

test('binds and reuses a WeChat Mini Program parent account', async () => {
  const app = await buildApp(testEnv);
  const originalFetch = globalThis.fetch;
  const openid = `openid-${randomUUID()}`;
  const phone = `139${String(Date.now()).slice(-8)}`;

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
