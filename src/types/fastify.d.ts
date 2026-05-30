import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: import('fastify').preHandlerAsyncHookHandler;
    authenticateParent: import('fastify').preHandlerAsyncHookHandler;
    db: import('../db/client.js').Database;
    appEnv: import('../lib/env.js').AppEnv;
  }

  interface FastifyRequest {
    parent?: { id: string };
  }
}
