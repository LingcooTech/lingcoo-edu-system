import { eq } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../../db/schema.js';
import { verifyPassword } from '../../lib/password.js';
import type { AppModule } from '../types.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function findUserByEmail(app: Parameters<AppModule['register']>[0], email: string) {
  const [user] = await app.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return user ?? null;
}

async function findUserById(app: Parameters<AppModule['register']>[0], id: string) {
  const [user] = await app.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return user ?? null;
}

function toPublicUser(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
  };
}

export const authModule: AppModule = {
  name: 'auth',
  async register(app) {
    app.post('/v1/auth/login', async (request, reply) => {
      const body = loginSchema.parse(request.body);

      const user = await findUserByEmail(app, body.email);
      if (!user || user.status !== 'active' || !verifyPassword(body.password, user.passwordHash)) {
        return reply.unauthorized('Invalid email or password');
      }

      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        role: 'platform_admin',
      });

      reply.setCookie('fd_edu_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: app.appEnv.NODE_ENV === 'production',
      });

      return { token, user: toPublicUser(user) };
    });

    app.post('/v1/auth/logout', async (_request, reply) => {
      reply.clearCookie('fd_edu_token', { path: '/' });
      return { ok: true };
    });

    app.get('/v1/me', { preHandler: app.authenticate }, async (request) => {
      const subject = (request.user as { sub: string }).sub;
      const user = await findUserById(app, subject);
      return { user: user ? toPublicUser(user) : null };
    });
  },
};
