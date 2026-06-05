import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';

import { appModules } from './modules/index.js';
import { parseCorsOrigin } from './lib/http.js';
import { createDb } from './db/client.js';
import type { AppEnv } from './lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_UPLOAD_BODY_LIMIT = 15 * 1024 * 1024;

function resolveRuntimePath(...segments: string[]): string {
  return path.resolve(__dirname, '..', ...segments);
}

export async function buildApp(env: AppEnv) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    trustProxy: true,
  });

  const { db, pool } = createDb(env.DATABASE_URL);
  app.decorate('db', db);
  app.decorate('appEnv', env);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: parseCorsOrigin(env.CORS_ORIGIN),
    credentials: true,
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'fd_edu_token',
      signed: false,
    },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: env.APP_NAME,
        version: '0.1.0',
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/api-docs',
  });

  // Payment provider callbacks arrive as XML (WeChat) or form-urlencoded
  // (Alipay); deliver them as raw strings so the adapters can verify the
  // original signed payload byte-for-byte.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, payload, done) => {
      done(null, payload);
    },
  );
  app.addContentTypeParser('text/xml', { parseAs: 'string' }, (_request, payload, done) => {
    done(null, payload);
  });
  app.addContentTypeParser('application/xml', { parseAs: 'string' }, (_request, payload, done) => {
    done(null, payload);
  });
  app.addContentTypeParser(
    /^image\/[a-zA-Z0-9.+-]+$/,
    { parseAs: 'buffer', bodyLimit: IMAGE_UPLOAD_BODY_LIMIT },
    (_request, payload, done) => {
      done(null, payload);
    },
  );
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: IMAGE_UPLOAD_BODY_LIMIT },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  // Unified auth: the JWT (cookie `fd_edu_token` or Bearer) carries { sub, role }.
  // `authenticate` verifies the token and exposes request.account; `requireRole`
  // additionally gates on role. One token, one cookie, for every role.
  function attachAccount(request: FastifyRequest) {
    const payload = request.user as { sub: string; role: string };
    request.account = { id: payload.sub, role: payload.role };
    return payload;
  }

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.unauthorized('Invalid or expired access token');
    }
    attachAccount(request);
  });

  app.decorate('requireRole', (...roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.unauthorized('Invalid or expired access token');
      }
      const payload = attachAccount(request);
      if (!roles.includes(payload.role)) {
        return reply.forbidden('权限不足');
      }
    };
  });

  app.decorate('requireAdmin', app.requireRole('admin'));
  app.decorate('requireParent', app.requireRole('parent'));

  for (const module of appModules) {
    await app.register(module.register);
  }

  const adminDist = resolveRuntimePath('admin-ui/dist');
  if (existsSync(adminDist)) {
    await app.register(fastifyStatic, {
      root: adminDist,
      prefix: '/admin/',
      decorateReply: false,
    });
  }

  const publicDist = resolveRuntimePath('public-web/dist');
  if (existsSync(publicDist)) {
    await app.register(fastifyStatic, {
      root: publicDist,
      prefix: '/',
    });
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'ValidationError',
        details: error.flatten(),
      });
    }

    const statusCode =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;

    const normalizedError = error instanceof Error ? error : new Error('Internal Server Error');

    return reply.status(statusCode).send({
      error: normalizedError.name || 'Error',
      message: normalizedError.message || 'Internal Server Error',
    });
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET') {
      return reply.notFound();
    }

    if (request.url.startsWith('/admin') && existsSync(adminDist)) {
      return reply.sendFile('index.html', adminDist);
    }

    const apiPrefixes = ['/v1/', '/public/', '/auth/', '/api-docs', '/health', '/ready'];
    if (apiPrefixes.some((prefix) => request.url.startsWith(prefix))) {
      return reply.notFound();
    }

    if (existsSync(publicDist)) {
      return reply.sendFile('index.html', publicDist);
    }

    return reply.notFound();
  });

  return app;
}
