import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';

import * as accountsRepo from '../../db/repositories/accounts.js';
import { httpError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { SmtpSettingsService } from '../../lib/smtp-settings.js';
import type { AppModule } from '../types.js';

const AUTH_COOKIE = 'fd_edu_token';
const TOKEN_TTL = '14d';

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
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

// One login field accepts both: emails are lowercased, phone numbers are kept verbatim.
function normalizeIdentifier(raw: string) {
  const value = raw.trim();
  return value.includes('@') ? value.toLowerCase() : value;
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function publicAccount(account: accountsRepo.Account) {
  return {
    id: account.id,
    role: account.role,
    email: account.email,
    phone: account.phone,
    displayName: account.displayName,
    emailVerified: Boolean(account.emailVerifiedAt),
    mustChangePassword: account.mustChangePassword,
  };
}

export const authModule: AppModule = {
  name: 'auth',
  async register(app) {
    function cookieOptions() {
      return {
        path: '/',
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: app.appEnv.NODE_ENV === 'production',
      };
    }

    // Issues an email verification / password reset code, throttled to one per
    // minute. Silently succeeds (sent:false) when there is no email on file or
    // SMTP is not configured, so the flow still works in dev / phone-only accounts.
    async function sendCode(
      account: accountsRepo.Account,
      purpose: 'email_verify' | 'password_reset',
    ) {
      if (!account.email) {
        return { sent: false };
      }
      const latest = await accountsRepo.findLatestSecurityCode(app.db, account.id, purpose);
      if (latest && Date.now() - latest.createdAt.getTime() < 60_000) {
        throw httpError(429, '请稍后再请求新的验证码');
      }

      const mailer = await new SmtpSettingsService(app.db, app.appEnv).createMailer();
      const code = generateCode();
      await accountsRepo.createSecurityCode(app.db, {
        accountId: account.id,
        purpose,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      if (!mailer.isConfigured) {
        return { sent: false };
      }
      const subject = purpose === 'email_verify' ? '邮箱验证码' : '密码重置验证码';
      await mailer.send({
        to: account.email,
        subject,
        text: `你的${subject}是：${code}\n\n验证码 10 分钟内有效。`,
        html: `<p>你的${subject}是：<strong>${code}</strong></p><p>验证码 10 分钟内有效。</p>`,
      });
      return { sent: true };
    }

    // --- Unified login (admin / teacher / parent all enter here) ---

    app.post('/auth/login', async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const account = await accountsRepo.findByIdentifier(app.db, normalizeIdentifier(body.identifier));
      if (
        !account ||
        account.status !== 'active' ||
        !verifyPassword(body.password, account.passwordHash)
      ) {
        return reply.unauthorized('账号或密码不正确');
      }

      const token = await reply.jwtSign(
        { sub: account.id, role: account.role },
        { expiresIn: TOKEN_TTL },
      );
      reply.setCookie(AUTH_COOKIE, token, cookieOptions());
      return { token, account: publicAccount(account) };
    });

    app.post('/auth/logout', async (_request, reply) => {
      reply.clearCookie(AUTH_COOKIE, { path: '/' });
      return { ok: true };
    });

    app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
      const account = await accountsRepo.findById(app.db, request.account!.id);
      return { account: account ? publicAccount(account) : null };
    });

    // --- Parent self-registration ---

    app.post('/auth/register', async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const email = normalizeEmail(body.email);

      if (await accountsRepo.findByEmail(app.db, email)) {
        throw httpError(409, '该邮箱已注册');
      }
      if (body.phone && (await accountsRepo.findByPhone(app.db, body.phone))) {
        throw httpError(409, '该手机号已注册');
      }

      const account = await accountsRepo.createAccount(app.db, {
        role: 'parent',
        email,
        phone: body.phone,
        passwordHash: hashPassword(body.password),
        displayName: body.displayName,
      });

      const codeResult = await sendCode(account, 'email_verify');
      const token = await reply.jwtSign(
        { sub: account.id, role: account.role },
        { expiresIn: TOKEN_TTL },
      );
      reply.setCookie(AUTH_COOKIE, token, cookieOptions());
      return { token, account: publicAccount(account), verificationSent: codeResult.sent };
    });

    // --- Change password (clears the must-change flag set on provisioning) ---

    app.post('/auth/change-password', { preHandler: app.authenticate }, async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      const account = await accountsRepo.findById(app.db, request.account!.id);
      if (!account) {
        throw httpError(404, 'Account not found');
      }
      if (!verifyPassword(body.currentPassword, account.passwordHash)) {
        return reply.unauthorized('当前密码不正确');
      }
      await accountsRepo.updateAccount(app.db, account.id, {
        passwordHash: hashPassword(body.newPassword),
        mustChangePassword: false,
      });
      return { ok: true };
    });

    // --- Email verification ---

    app.post(
      '/auth/resend-verification',
      { preHandler: app.authenticate },
      async (request) => {
        const account = await accountsRepo.findById(app.db, request.account!.id);
        if (!account) {
          throw httpError(404, 'Account not found');
        }
        if (account.emailVerifiedAt) {
          return { sent: false, alreadyVerified: true };
        }
        if (!account.email) {
          throw httpError(400, '该账号未绑定邮箱');
        }
        const result = await sendCode(account, 'email_verify');
        return { sent: result.sent };
      },
    );

    app.post('/auth/verify-email', { preHandler: app.authenticate }, async (request) => {
      const body = verifyEmailSchema.parse(request.body);
      const account = await accountsRepo.findById(app.db, request.account!.id);
      if (!account) {
        throw httpError(404, 'Account not found');
      }
      const code = await accountsRepo.findValidSecurityCode(
        app.db,
        account.id,
        'email_verify',
        hashCode(body.code),
      );
      if (!code) {
        throw httpError(400, '验证码无效或已过期');
      }
      await accountsRepo.consumeSecurityCode(app.db, code.id);
      const updated = await accountsRepo.updateAccount(app.db, account.id, {
        emailVerifiedAt: new Date(),
      });
      return { account: publicAccount(updated!) };
    });

    // --- Forgot / reset password (email channel) ---

    app.post('/auth/forgot-password', async (request) => {
      const body = forgotPasswordSchema.parse(request.body);
      const account = await accountsRepo.findByEmail(app.db, normalizeEmail(body.email));
      // Always return ok to avoid leaking which emails are registered.
      if (account) {
        await sendCode(account, 'password_reset');
      }
      return { ok: true };
    });

    app.post('/auth/reset-password', async (request) => {
      const body = resetPasswordSchema.parse(request.body);
      const account = await accountsRepo.findByEmail(app.db, normalizeEmail(body.email));
      if (!account) {
        throw httpError(400, '验证码无效或已过期');
      }
      const code = await accountsRepo.findValidSecurityCode(
        app.db,
        account.id,
        'password_reset',
        hashCode(body.code),
      );
      if (!code) {
        throw httpError(400, '验证码无效或已过期');
      }
      await accountsRepo.consumeSecurityCode(app.db, code.id);
      await accountsRepo.updateAccount(app.db, account.id, {
        passwordHash: hashPassword(body.password),
        mustChangePassword: false,
      });
      return { ok: true };
    });
  },
};
