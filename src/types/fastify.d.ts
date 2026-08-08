import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: import('fastify').preHandlerAsyncHookHandler;
    requireRole: (...roles: string[]) => import('fastify').preHandlerAsyncHookHandler;
    requireAdmin: import('fastify').preHandlerAsyncHookHandler;
    requireBackoffice: import('fastify').preHandlerAsyncHookHandler;
    requireParent: import('fastify').preHandlerAsyncHookHandler;
    db: import('../db/client.js').Database;
    appEnv: import('../lib/env.js').AppEnv;
  }

  interface FastifyRequest {
    account?: { id: string; role: string; roleAssignmentId?: string };
  }
}
