import { z } from 'zod';

import { store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authModule: AppModule = {
  name: 'auth',
  async register(app) {
    app.post('/v1/auth/login', async (request, reply) => {
      const body = loginSchema.parse(request.body);

      if (body.email !== 'admin@fd-edu.local' || body.password !== 'admin123456') {
        return reply.unauthorized('Invalid email or password');
      }

      const user = store.users[0];
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      reply.setCookie('fd_edu_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      });

      return { token, user };
    });

    app.post('/v1/auth/logout', async (_request, reply) => {
      reply.clearCookie('fd_edu_token', { path: '/' });
      return { ok: true };
    });

    app.get('/v1/me', { preHandler: app.authenticate }, async (request) => {
      const subject = (request.user as { sub: string }).sub;
      const user = store.users.find((item) => item.id === subject);
      return { user };
    });
  },
};
