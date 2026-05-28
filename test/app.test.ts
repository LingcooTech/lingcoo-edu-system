import assert from 'node:assert/strict';
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
};

test('serves health and readiness probes', async () => {
  const app = await buildApp(testEnv);

  try {
    const health = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { ok: true });

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { ok: true, checks: { api: true } });
  } finally {
    await app.close();
  }
});

test('exposes the public tenant home payload', async () => {
  const app = await buildApp(testEnv);

  try {
    const response = await app.inject({ method: 'GET', url: '/public/meizhi/home' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().tenant.slug, 'meizhi');
    assert.ok(Array.isArray(response.json().featuredCourses));
  } finally {
    await app.close();
  }
});
