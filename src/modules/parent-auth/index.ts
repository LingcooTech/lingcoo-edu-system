import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';

import * as parentsRepo from '../../db/repositories/parents.js';
import { httpError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { issueParentToken } from '../../lib/parent-token.js';
import { SmtpSettingsService } from '../../lib/smtp-settings.js';
import type { AppModule } from '../types.js';

const PARENT_COOKIE = 'fd_edu_parent_token';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({ code: z.string().min(4) });
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  password: z.string().min(8),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function tokenSecret(env: { PARENT_TOKEN_SECRET?: string; JWT_SECRET: string }) {
  return env.PARENT_TOKEN_SECRET?.trim() || env.JWT_SECRET;
}

function publicParent(parent: parentsRepo.Parent) {
  return {
    id: parent.id,
    email: parent.email,
    displayName: parent.displayName,
    phone: parent.phone,
    emailVerified: Boolean(parent.emailVerifiedAt),
  };
}

export const parentAuthModule: AppModule = {
  name: 'parent-auth',
  async register(app) {
    const secret = tokenSecret(app.appEnv);

    // Issues an email verification / password reset code, throttled to one per
    // minute. Silently succeeds (sent:false) when SMTP is not configured so the
    // flow still works in dev.
    async function sendCode(parent: parentsRepo.Parent, purpose: 'email_verify' | 'password_reset') {
      const latest = await parentsRepo.findLatestSecurityCode(app.db, parent.id, purpose);
      if (latest && Date.now() - latest.createdAt.getTime() < 60_000) {
        throw httpError(429, '请稍后再请求新的验证码');
      }

      const mailer = await new SmtpSettingsService(app.db, app.appEnv).createMailer();
      const code = generateCode();
      await parentsRepo.createSecurityCode(app.db, {
        parentId: parent.id,
        purpose,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      if (!mailer.isConfigured) {
        return { sent: false };
      }
      const subject = purpose === 'email_verify' ? '邮箱验证码' : '密码重置验证码';
      await mailer.send({
        to: parent.email,
        subject,
        text: `你的${subject}是：${code}\n\n验证码 10 分钟内有效。`,
        html: `<p>你的${subject}是：<strong>${code}</strong></p><p>验证码 10 分钟内有效。</p>`,
      });
      return { sent: true };
    }

    app.post('/public/auth/register', async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const email = normalizeEmail(body.email);

      const existing = await parentsRepo.findParentByEmail(app.db, email);
      if (existing) {
        throw httpError(409, '该邮箱已注册');
      }

      const parent = await parentsRepo.createParent(app.db, {
        email,
        phone: body.phone,
        passwordHash: hashPassword(body.password),
        displayName: body.displayName,
      });

      const codeResult = await sendCode(parent, 'email_verify');
      const token = issueParentToken(parent.id, secret);
      reply.setCookie(PARENT_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: app.appEnv.NODE_ENV === 'production',
      });
      return { token, parent: publicParent(parent), verificationSent: codeResult.sent };
    });

    app.post('/public/auth/login', async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const email = normalizeEmail(body.email);

      const parent = await parentsRepo.findParentByEmail(app.db, email);
      if (!parent || parent.status !== 'active' || !verifyPassword(body.password, parent.passwordHash)) {
        return reply.unauthorized('邮箱或密码不正确');
      }

      const token = issueParentToken(parent.id, secret);
      reply.setCookie(PARENT_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: app.appEnv.NODE_ENV === 'production',
      });
      return { token, parent: publicParent(parent) };
    });

    app.post('/public/auth/logout', async (_request, reply) => {
      reply.clearCookie(PARENT_COOKIE, { path: '/' });
      return { ok: true };
    });

    app.get(
      '/public/auth/me',
      { preHandler: app.authenticateParent },
      async (request) => {
        const parent = await parentsRepo.findParentById(app.db, request.parent!.id);
        return { parent: parent ? publicParent(parent) : null };
      },
    );

    app.post(
      '/public/auth/resend-verification',
      { preHandler: app.authenticateParent },
      async (request) => {
        const parent = await parentsRepo.findParentById(app.db, request.parent!.id);
        if (!parent) {
          throw httpError(404, 'Parent not found');
        }
        if (parent.emailVerifiedAt) {
          return { sent: false, alreadyVerified: true };
        }
        const result = await sendCode(parent, 'email_verify');
        return { sent: result.sent };
      },
    );

    app.post(
      '/public/auth/verify-email',
      { preHandler: app.authenticateParent },
      async (request) => {
        const body = verifyEmailSchema.parse(request.body);
        const parent = await parentsRepo.findParentById(app.db, request.parent!.id);
        if (!parent) {
          throw httpError(404, 'Parent not found');
        }
        const code = await parentsRepo.findValidSecurityCode(
          app.db,
          parent.id,
          'email_verify',
          hashCode(body.code),
        );
        if (!code) {
          throw httpError(400, '验证码无效或已过期');
        }
        await parentsRepo.consumeSecurityCode(app.db, code.id);
        const updated = await parentsRepo.updateParent(app.db, parent.id, {
          emailVerifiedAt: new Date(),
        });
        return { parent: publicParent(updated) };
      },
    );

    app.post('/public/auth/forgot-password', async (request) => {
      const body = forgotPasswordSchema.parse(request.body);
      const parent = await parentsRepo.findParentByEmail(app.db, normalizeEmail(body.email));
      // Always return ok to avoid leaking which emails are registered.
      if (parent) {
        await sendCode(parent, 'password_reset');
      }
      return { ok: true };
    });

    app.post('/public/auth/reset-password', async (request) => {
      const body = resetPasswordSchema.parse(request.body);
      const parent = await parentsRepo.findParentByEmail(app.db, normalizeEmail(body.email));
      if (!parent) {
        throw httpError(400, '验证码无效或已过期');
      }
      const code = await parentsRepo.findValidSecurityCode(
        app.db,
        parent.id,
        'password_reset',
        hashCode(body.code),
      );
      if (!code) {
        throw httpError(400, '验证码无效或已过期');
      }
      await parentsRepo.consumeSecurityCode(app.db, code.id);
      await parentsRepo.updateParent(app.db, parent.id, {
        passwordHash: hashPassword(body.password),
      });
      return { ok: true };
    });
  },
};
