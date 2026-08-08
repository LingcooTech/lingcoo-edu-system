import { createHash, randomInt } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as auditRepo from '../../db/repositories/audit.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import { httpError } from '../../lib/http-error.js';
import { hashPassword, verifyPassword, defaultPasswordFromPhone } from '../../lib/password.js';
import { SmtpSettingsService } from '../../lib/smtp-settings.js';
import { exchangeWechatMiniCode, getWechatMiniPhoneNumber } from '../../lib/wechat-mini.js';
import {
  ALL_TEACHER_PERMISSIONS,
  normalizeTeacherPermissions,
} from '../../lib/teacher-permissions.js';
import type { AppModule } from '../types.js';

const AUTH_COOKIE = 'fd_edu_token';
const TOKEN_TTL = '14d';

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  role: z.enum(['admin', 'institution_admin', 'teacher', 'parent']).optional(),
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

const wechatMiniLoginSchema = z.object({
  code: z.string().min(1),
});

const wechatMiniBindPhoneSchema = z
  .object({
    bindToken: z.string().min(1),
    phoneCode: z.string().optional(),
    phone: z.string().optional(),
    displayName: z.string().optional(),
  })
  .refine((value) => Boolean(value.phoneCode || value.phone), {
    message: 'phoneCode 或 phone 至少提供一个',
  });

const accountRoleSchema = z.enum(['admin', 'institution_admin', 'teacher', 'parent']);
const workRoleSchema = z.enum(['admin', 'institution_admin', 'teacher']);
const teacherPermissionsSchema = z.object({
  createClassSession: z.boolean().optional(),
  createAdHocSession: z.boolean().optional(),
  manageSessionRoster: z.boolean().optional(),
  enrollStudents: z.boolean().optional(),
  viewAllStudents: z.boolean().optional(),
  setLessonUnits: z.boolean().optional(),
  manageClasses: z.boolean().optional(),
});

const adminAccountCreateSchema = z.object({
  role: accountRoleSchema,
  roles: z.array(accountRoleSchema).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  displayName: z.string().min(1),
  status: z.enum(['active', 'suspended']).default('active'),
  guardianId: z.string().uuid().optional().nullable(),
  teacherId: z.string().uuid().optional().nullable(),
  institutionId: z.string().uuid().optional().nullable(),
  teacherPermissions: teacherPermissionsSchema.optional(),
  password: z.string().min(6).optional(),
});

const adminAccountUpdateSchema = adminAccountCreateSchema.omit({ password: true }).partial();
const switchWorkRoleSchema = z.object({ role: workRoleSchema });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeOptionalEmail(email: string | null | undefined) {
  const value = email?.trim();
  return value ? normalizeEmail(value) : null;
}

function normalizeOptionalPhone(phone: string | null | undefined) {
  const value = phone?.trim();
  return value || null;
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

function generateDefaultPassword(phone: string | null | undefined) {
  return defaultPasswordFromPhone(phone) ?? String(randomInt(10_000_000, 100_000_000));
}

type PublicRoleAssignment = {
  id: string;
  role: accountsRepo.AccountRole;
  status: accountsRepo.AccountStatus;
  guardianId: string | null;
  teacherId: string | null;
  institutionId: string | null;
  teacherPermissions: ReturnType<typeof normalizeTeacherPermissions>;
};

function legacyRoleAssignment(account: accountsRepo.Account): PublicRoleAssignment {
  return {
    id: `${account.id}:${account.role}`,
    role: account.role,
    status: account.status,
    guardianId: account.role === 'parent' ? (account.guardianId ?? null) : null,
    teacherId: account.role === 'teacher' ? (account.teacherId ?? null) : null,
    institutionId: null,
    teacherPermissions: normalizeTeacherPermissions(),
  };
}

function toPublicRoleAssignments(
  account: accountsRepo.Account,
  assignments: accountsRepo.AccountRoleAssignment[],
): PublicRoleAssignment[] {
  const source = assignments.length ? assignments : [legacyRoleAssignment(account)];
  return source.map((assignment) => ({
    id: assignment.id,
    role: assignment.role,
    status: assignment.status,
    guardianId: assignment.role === 'parent' ? (assignment.guardianId ?? null) : null,
    teacherId: assignment.role === 'teacher' ? (assignment.teacherId ?? null) : null,
    institutionId:
      assignment.role === 'institution_admin' || assignment.role === 'teacher'
        ? (assignment.institutionId ?? null)
        : null,
    teacherPermissions: normalizeTeacherPermissions(
      assignment.role === 'teacher' ? assignment.teacherPermissions : {},
    ),
  }));
}

function selectActiveRole(
  account: accountsRepo.Account,
  roles: PublicRoleAssignment[],
  preferredRole?: accountsRepo.AccountRole,
) {
  const activeRoles = roles.filter((role) => role.status === 'active');
  return (
    (preferredRole ? activeRoles.find((role) => role.role === preferredRole) : null) ??
    activeRoles.find((role) => role.role === account.role) ??
    activeRoles[0] ??
    null
  );
}

function publicAccount(
  account: accountsRepo.Account,
  input: {
    roles?: PublicRoleAssignment[];
    activeRole?: accountsRepo.AccountRole;
  } = {},
) {
  const roles = input.roles ?? [legacyRoleAssignment(account)];
  const activeRole = input.activeRole ?? account.role;
  const activeAssignment =
    roles.find((assignment) => assignment.role === activeRole) ?? legacyRoleAssignment(account);
  return {
    id: account.id,
    role: activeRole,
    activeRole,
    roles,
    email: account.email,
    phone: account.phone,
    displayName: account.displayName,
    emailVerified: Boolean(account.emailVerifiedAt),
    mustChangePassword: account.mustChangePassword,
    guardianId: activeAssignment.guardianId,
    teacherId: activeAssignment.teacherId,
    institutionId: activeAssignment.institutionId,
  };
}

interface WechatMiniBindToken {
  purpose: 'wechat_mini_bind';
  appId: string;
  openid: string;
  unionid?: string | null;
}

function isWechatMiniBindToken(value: unknown): value is WechatMiniBindToken {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<WechatMiniBindToken>;
  return (
    payload.purpose === 'wechat_mini_bind' &&
    typeof payload.appId === 'string' &&
    typeof payload.openid === 'string'
  );
}

function adminAccount(
  account: accountsRepo.Account,
  assignments: accountsRepo.AccountRoleAssignment[] = [],
) {
  const roles = toPublicRoleAssignments(account, assignments);
  return {
    ...publicAccount(account, { roles, activeRole: account.role }),
    status: account.status,
    guardianId: account.guardianId,
    teacherId: account.teacherId,
    roleAssignments: roles,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
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

    async function loadPublicAccountForRole(
      account: accountsRepo.Account,
      preferredRole?: accountsRepo.AccountRole,
      strict = false,
    ) {
      if (account.status !== 'active') {
        throw httpError(403, '账号已停用');
      }
      const assignments = await accountsRepo.listRoleAssignmentsForAccount(app.db, account.id);
      const roles = toPublicRoleAssignments(account, assignments);
      const activeRoleAssignment = selectActiveRole(account, roles, preferredRole);
      if (
        !activeRoleAssignment ||
        (strict && preferredRole && activeRoleAssignment.role !== preferredRole)
      ) {
        throw httpError(403, '当前账号没有可用的该身份');
      }
      return {
        activeRoleAssignment,
        account: publicAccount(account, {
          roles,
          activeRole: activeRoleAssignment.role,
        }),
      };
    }

    async function signIn(
      reply: FastifyReply,
      account: accountsRepo.Account,
      preferredRole?: accountsRepo.AccountRole,
      strict = false,
    ) {
      const resolved = await loadPublicAccountForRole(account, preferredRole, strict);
      const token = await reply.jwtSign(
        {
          sub: account.id,
          role: resolved.activeRoleAssignment.role,
          roleAssignmentId: resolved.activeRoleAssignment.id,
        },
        { expiresIn: TOKEN_TTL },
      );
      reply.setCookie(AUTH_COOKIE, token, cookieOptions());
      return { token, account: resolved.account };
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
      const account = await accountsRepo.findByIdentifier(
        app.db,
        normalizeIdentifier(body.identifier),
      );
      if (
        !account ||
        account.status !== 'active' ||
        !verifyPassword(body.password, account.passwordHash)
      ) {
        return reply.unauthorized('账号或密码不正确');
      }

      return signIn(reply, account, body.role, Boolean(body.role));
    });

    app.post('/auth/wechat-mini/login', async (request, reply) => {
      const body = wechatMiniLoginSchema.parse(request.body);
      const identity = await exchangeWechatMiniCode(app.appEnv, body.code);
      const account = await accountsRepo.findAccountByWechatIdentity(
        app.db,
        identity.appId,
        identity.openid,
      );

      if (account) {
        if (account.status !== 'active') {
          throw httpError(403, '账号已停用');
        }
        const result = await signIn(reply, account);
        return { bound: true, ...result };
      }

      const bindToken = await reply.jwtSign(
        {
          purpose: 'wechat_mini_bind',
          appId: identity.appId,
          openid: identity.openid,
          unionid: identity.unionid,
        },
        { expiresIn: '10m' },
      );
      return { bound: false, bindToken };
    });

    app.post('/auth/wechat-mini/bind-phone', async (request, reply) => {
      const body = wechatMiniBindPhoneSchema.parse(request.body);
      let tokenPayload: unknown;
      try {
        tokenPayload = await app.jwt.verify(body.bindToken);
      } catch {
        throw httpError(401, '微信绑定凭证无效或已过期');
      }
      if (!isWechatMiniBindToken(tokenPayload)) {
        throw httpError(401, '微信绑定凭证无效');
      }

      const rawPhone = body.phoneCode
        ? await getWechatMiniPhoneNumber(app.appEnv, body.phoneCode)
        : body.phone;
      if (!body.phoneCode && app.appEnv.NODE_ENV === 'production') {
        throw httpError(422, '生产环境必须使用微信手机号授权');
      }
      const phone = normalizeOptionalPhone(rawPhone);
      if (!phone) {
        throw httpError(422, '手机号不能为空');
      }

      const guardian = await peopleRepo.findGuardianByPhone(app.db, phone);
      const existingIdentity = await accountsRepo.findWechatIdentity(
        app.db,
        tokenPayload.appId,
        tokenPayload.openid,
      );
      let account = await accountsRepo.findByPhone(app.db, phone);

      if (account && account.status !== 'active') {
        throw httpError(403, '账号已停用');
      }

      let accountCreated = false;
      let defaultPassword: string | null = null;
      if (!account) {
        defaultPassword = generateDefaultPassword(phone);
        account = await accountsRepo.createAccount(app.db, {
          role: 'parent',
          phone,
          displayName: body.displayName?.trim() || `微信家长${phone.slice(-4)}`,
          passwordHash: hashPassword(defaultPassword),
          guardianId: guardian?.id ?? null,
          mustChangePassword: true,
        });
        accountCreated = true;
      } else if (account.role === 'parent' && !account.guardianId && guardian) {
        account =
          (await accountsRepo.updateAccount(app.db, account.id, {
            guardianId: guardian.id,
          })) ?? account;
      }

      if (existingIdentity && existingIdentity.accountId !== account.id) {
        throw httpError(409, '该微信已绑定其他账号');
      }
      if (existingIdentity) {
        await accountsRepo.updateWechatIdentity(app.db, existingIdentity.id, {
          unionid: tokenPayload.unionid ?? null,
        });
      } else {
        await accountsRepo.createWechatIdentity(app.db, {
          accountId: account.id,
          appId: tokenPayload.appId,
          openid: tokenPayload.openid,
          unionid: tokenPayload.unionid ?? null,
        });
      }

      const result = await signIn(reply, account);
      return {
        ...result,
        accountCreated,
        defaultPassword,
      };
    });

    app.post('/auth/logout', async (_request, reply) => {
      reply.clearCookie(AUTH_COOKIE, { path: '/' });
      return { ok: true };
    });

    app.get('/auth/me', { preHandler: app.authenticate }, async (request) => {
      const account = await accountsRepo.findById(app.db, request.account!.id);
      if (!account) {
        return { account: null };
      }
      const resolved = await loadPublicAccountForRole(
        account,
        request.account!.role as accountsRepo.AccountRole,
      );
      return { account: resolved.account };
    });

    app.post('/auth/switch-work-role', { preHandler: app.authenticate }, async (request, reply) => {
      const body = switchWorkRoleSchema.parse(request.body);
      const account = await accountsRepo.findById(app.db, request.account!.id);
      if (!account) {
        throw httpError(404, '账号不存在');
      }
      return signIn(reply, account, body.role, true);
    });

    // --- Admin account management ---

    async function ensureUniqueIdentifiers(input: {
      email?: string | null;
      phone?: string | null;
      ignoreAccountId?: string;
    }) {
      if (input.email) {
        const existing = await accountsRepo.findByEmail(app.db, input.email);
        if (existing && existing.id !== input.ignoreAccountId) {
          throw httpError(409, '该邮箱已被其他账号使用');
        }
      }
      if (input.phone) {
        const existing = await accountsRepo.findByPhone(app.db, input.phone);
        if (existing && existing.id !== input.ignoreAccountId) {
          throw httpError(409, '该手机号已被其他账号使用');
        }
      }
    }

    function resolveSubmittedRoles(input: {
      role: accountsRepo.AccountRole;
      roles?: accountsRepo.AccountRole[];
    }) {
      const roles = Array.from(new Set([input.role, ...(input.roles ?? [])]));
      if (roles.includes('parent') && roles.length > 1) {
        throw httpError(422, '家长身份暂不支持叠加管理员或老师身份');
      }
      return roles;
    }

    function rolesFromAssignments(
      account: accountsRepo.Account,
      assignments: accountsRepo.AccountRoleAssignment[],
    ) {
      const roles = assignments.length ? assignments.map((assignment) => assignment.role) : [];
      return roles.length ? roles : [account.role];
    }

    function accountAuditSnapshot(
      account: accountsRepo.Account,
      assignments: accountsRepo.AccountRoleAssignment[],
    ) {
      return {
        role: account.role,
        roles: assignments.map((assignment) => ({
          role: assignment.role,
          status: assignment.status,
          institutionId: assignment.institutionId,
          teacherId: assignment.teacherId,
          guardianId: assignment.guardianId,
          teacherPermissions: assignment.teacherPermissions,
        })),
        displayName: account.displayName,
        email: account.email,
        phone: account.phone,
        status: account.status,
        guardianId: account.guardianId,
        teacherId: account.teacherId,
        mustChangePassword: account.mustChangePassword,
      };
    }

    function auditInstitutionId(assignments: accountsRepo.AccountRoleAssignment[]) {
      return (
        assignments.find((assignment) => assignment.role === 'institution_admin')
          ?.institutionId ??
        assignments.find((assignment) => assignment.role === 'teacher')?.institutionId ??
        null
      );
    }

    async function validateProfileLinks(input: {
      roles: accountsRepo.AccountRole[];
      guardianId?: string | null;
      teacherId?: string | null;
      institutionId?: string | null;
    }) {
      if (input.roles.includes('institution_admin')) {
        if (!input.institutionId) {
          throw httpError(422, '机构负责人账号必须绑定机构');
        }
        const institution = await teachingRepo.findInstitution(app.db, input.institutionId);
        if (!institution || institution.status !== 'active') {
          throw httpError(422, '所选机构不存在或已停用');
        }
      }
      if (input.roles.includes('teacher')) {
        if (!input.teacherId) {
          throw httpError(422, '老师账号必须关联老师档案');
        }
        const teacher = await teachingRepo.findTeacher(app.db, input.teacherId);
        if (!teacher) {
          throw httpError(404, '老师档案不存在');
        }
        if (!teacher.institutionId) {
          throw httpError(422, '老师档案必须先绑定机构');
        }
        if (input.institutionId && input.institutionId !== teacher.institutionId) {
          throw httpError(422, '账号机构与老师所属机构不一致');
        }
      }
      if (input.roles.includes('parent') && input.guardianId) {
        const guardian = await peopleRepo.findGuardian(app.db, input.guardianId);
        if (!guardian) {
          throw httpError(404, '家长档案不存在');
        }
      }
    }

    app.get('/v1/accounts', { preHandler: app.requireAdmin }, async () => {
      const [accounts, guardians, teachers, wechatIdentities] = await Promise.all([
        accountsRepo.listAccounts(app.db),
        peopleRepo.listGuardians(app.db),
        teachingRepo.listTeachers(app.db),
        accountsRepo.listWechatIdentities(app.db),
      ]);
      const roleAssignments = await accountsRepo.listRoleAssignments(app.db);
      const guardianById = new Map(guardians.map((guardian) => [guardian.id, guardian]));
      const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
      const wechatIdentitiesByAccountId = new Map<string, typeof wechatIdentities>();
      const roleAssignmentsByAccountId = new Map<string, accountsRepo.AccountRoleAssignment[]>();
      for (const identity of wechatIdentities) {
        wechatIdentitiesByAccountId.set(identity.accountId, [
          ...(wechatIdentitiesByAccountId.get(identity.accountId) ?? []),
          identity,
        ]);
      }
      for (const assignment of roleAssignments) {
        roleAssignmentsByAccountId.set(assignment.accountId, [
          ...(roleAssignmentsByAccountId.get(assignment.accountId) ?? []),
          assignment,
        ]);
      }

      return {
        accounts: accounts.map((account) => ({
          ...adminAccount(account, roleAssignmentsByAccountId.get(account.id) ?? []),
          guardian: account.guardianId ? guardianById.get(account.guardianId) : undefined,
          teacher: account.teacherId ? teacherById.get(account.teacherId) : undefined,
          wechatIdentities: wechatIdentitiesByAccountId.get(account.id) ?? [],
        })),
      };
    });

    app.post('/v1/accounts', { preHandler: app.requireAdmin }, async (request) => {
      const body = adminAccountCreateSchema.parse(request.body);
      const email = normalizeOptionalEmail(body.email);
      const phone = normalizeOptionalPhone(body.phone);
      if (!email && !phone) {
        throw httpError(422, '邮箱和手机号至少填写一个');
      }

      await ensureUniqueIdentifiers({ email, phone });
      const roles = resolveSubmittedRoles({ role: body.role, roles: body.roles });
      const guardianId = roles.includes('parent') ? (body.guardianId ?? null) : null;
      const teacherId = roles.includes('teacher') ? (body.teacherId ?? null) : null;
      const teacher = teacherId ? await teachingRepo.findTeacher(app.db, teacherId) : null;
      const institutionId = roles.includes('institution_admin')
        ? (body.institutionId ?? null)
        : roles.includes('teacher')
          ? (teacher?.institutionId ?? null)
          : null;
      await validateProfileLinks({
        roles,
        guardianId,
        teacherId,
        institutionId,
      });

      const defaultPassword = body.password ?? generateDefaultPassword(phone);
      const { account, assignments } = await app.db.transaction(async (tx) => {
        const account = await accountsRepo.createAccount(tx, {
          role: body.role,
          email,
          phone,
          displayName: body.displayName.trim(),
          status: body.status,
          guardianId,
          teacherId,
          passwordHash: hashPassword(defaultPassword),
          mustChangePassword: true,
        });
        const assignments = await accountsRepo.replaceRoleAssignmentsForAccount(
          tx,
          account.id,
          roles.map((role) => ({
            role,
            guardianId,
            teacherId,
            institutionId,
            teacherPermissions:
              role === 'teacher'
                ? roles.includes('admin') || roles.includes('institution_admin')
                  ? ALL_TEACHER_PERMISSIONS
                  : normalizeTeacherPermissions(body.teacherPermissions)
                : {},
            status: body.status,
          })),
        );
        await auditRepo.createAuditLog(tx, {
          actorAccountId: request.account!.id,
          institutionId: auditInstitutionId(assignments),
          requestId: request.id,
          action: 'account.created',
          resourceType: 'account',
          resourceId: account.id,
          summary: `创建账号：${account.displayName}`,
          meta: { after: accountAuditSnapshot(account, assignments) },
        });
        return { account, assignments };
      });

      return { account: adminAccount(account, assignments), defaultPassword };
    });

    app.patch('/v1/accounts/:accountId', { preHandler: app.requireAdmin }, async (request) => {
      const { accountId } = request.params as { accountId: string };
      const current = await accountsRepo.findById(app.db, accountId);
      if (!current) {
        throw httpError(404, '账号不存在');
      }
      const currentAssignments = await accountsRepo.listRoleAssignmentsForAccount(
        app.db,
        current.id,
      );
      const body = adminAccountUpdateSchema.parse(request.body);
      const nextRole = body.role ?? current.role;
      const nextRoles =
        body.roles === undefined && body.role === undefined
          ? rolesFromAssignments(current, currentAssignments)
          : resolveSubmittedRoles({ role: nextRole, roles: body.roles });
      const email = body.email === undefined ? current.email : normalizeOptionalEmail(body.email);
      const phone = body.phone === undefined ? current.phone : normalizeOptionalPhone(body.phone);
      if (!email && !phone) {
        throw httpError(422, '邮箱和手机号至少填写一个');
      }

      const guardianId = nextRoles.includes('parent')
        ? body.guardianId === undefined
          ? current.guardianId
          : body.guardianId
        : null;
      const teacherId = nextRoles.includes('teacher')
        ? body.teacherId === undefined
          ? current.teacherId
          : body.teacherId
        : null;
      const teacher = teacherId ? await teachingRepo.findTeacher(app.db, teacherId) : null;
      const currentInstitutionId = currentAssignments.find(
        (assignment) => assignment.role === 'institution_admin',
      )?.institutionId;
      const institutionId = nextRoles.includes('institution_admin')
        ? body.institutionId === undefined
          ? (currentInstitutionId ?? null)
          : body.institutionId
        : nextRoles.includes('teacher')
          ? (teacher?.institutionId ?? null)
          : null;
      const currentTeacherPermissions = currentAssignments.find(
        (assignment) => assignment.role === 'teacher',
      )?.teacherPermissions;
      const teacherPermissions =
        nextRoles.includes('admin') || nextRoles.includes('institution_admin')
        ? ALL_TEACHER_PERMISSIONS
        : normalizeTeacherPermissions(body.teacherPermissions ?? currentTeacherPermissions);

      await ensureUniqueIdentifiers({ email, phone, ignoreAccountId: accountId });
      await validateProfileLinks({ roles: nextRoles, guardianId, teacherId, institutionId });

      const { updated, assignments } = await app.db.transaction(async (tx) => {
        const updated = await accountsRepo.updateAccount(tx, accountId, {
          role: nextRole,
          email,
          phone,
          displayName: body.displayName?.trim() ?? current.displayName,
          status: body.status ?? current.status,
          guardianId,
          teacherId,
        });
        const assignments = await accountsRepo.replaceRoleAssignmentsForAccount(
          tx,
          accountId,
          nextRoles.map((role) => ({
            role,
            guardianId,
            teacherId,
            institutionId,
            teacherPermissions: role === 'teacher' ? teacherPermissions : {},
            status: body.status ?? current.status,
          })),
        );
        await auditRepo.createAuditLog(tx, {
          actorAccountId: request.account!.id,
          institutionId: auditInstitutionId(assignments),
          requestId: request.id,
          action: 'account.updated',
          resourceType: 'account',
          resourceId: accountId,
          summary: `修改账号：${updated!.displayName}`,
          meta: {
            before: accountAuditSnapshot(current, currentAssignments),
            after: accountAuditSnapshot(updated!, assignments),
          },
        });
        return { updated: updated!, assignments };
      });

      return { account: adminAccount(updated!, assignments) };
    });

    app.post(
      '/v1/accounts/:accountId/reset-password',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { accountId } = request.params as { accountId: string };
        const account = await accountsRepo.findById(app.db, accountId);
        if (!account) {
          throw httpError(404, '账号不存在');
        }
        const defaultPassword = generateDefaultPassword(account.phone);
        const { updated, assignments } = await app.db.transaction(async (tx) => {
          const updated = await accountsRepo.updateAccount(tx, accountId, {
            passwordHash: hashPassword(defaultPassword),
            mustChangePassword: true,
          });
          const assignments = await accountsRepo.listRoleAssignmentsForAccount(tx, accountId);
          await auditRepo.createAuditLog(tx, {
            actorAccountId: request.account!.id,
            institutionId: auditInstitutionId(assignments),
            requestId: request.id,
            action: 'account.password_reset',
            resourceType: 'account',
            resourceId: accountId,
            summary: `重置账号密码：${account.displayName}`,
            meta: { mustChangePassword: true },
          });
          return { updated: updated!, assignments };
        });
        return { account: adminAccount(updated!, assignments), defaultPassword };
      },
    );

    app.delete('/v1/accounts/:accountId', { preHandler: app.requireAdmin }, async (request) => {
      const { accountId } = request.params as { accountId: string };
      if (request.account?.id === accountId) {
        throw httpError(422, '不能删除当前登录账号');
      }
      const existing = await accountsRepo.findById(app.db, accountId);
      if (!existing) {
        throw httpError(404, '账号不存在');
      }
      const currentAssignments = await accountsRepo.listRoleAssignmentsForAccount(app.db, accountId);
      const { account, assignments } = await app.db.transaction(async (tx) => {
        const account = await accountsRepo.updateAccount(tx, accountId, {
          status: 'suspended',
        });
        const assignments = await accountsRepo.replaceRoleAssignmentsForAccount(
          tx,
          accountId,
          currentAssignments.map((assignment) => ({
            role: assignment.role,
            guardianId: assignment.guardianId,
            teacherId: assignment.teacherId,
            institutionId: assignment.institutionId,
            teacherPermissions: assignment.teacherPermissions,
            status: 'suspended',
          })),
        );
        await auditRepo.createAuditLog(tx, {
          actorAccountId: request.account!.id,
          institutionId: auditInstitutionId(currentAssignments),
          requestId: request.id,
          action: 'account.suspended',
          resourceType: 'account',
          resourceId: accountId,
          summary: `停用账号：${existing.displayName}`,
          meta: {
            before: accountAuditSnapshot(existing, currentAssignments),
            after: accountAuditSnapshot(account!, assignments),
          },
        });
        return { account: account!, assignments };
      });
      return { account: adminAccount(account, assignments), guardianDeleted: null };
    });

    app.delete(
      '/v1/accounts/:accountId/wechat-identities/:identityId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { accountId, identityId } = request.params as {
          accountId: string;
          identityId: string;
        };
        const account = await accountsRepo.findById(app.db, accountId);
        if (!account) {
          throw httpError(404, '账号不存在');
        }
        const assignments = await accountsRepo.listRoleAssignmentsForAccount(app.db, accountId);
        const identity = await app.db.transaction(async (tx) => {
          const identity = await accountsRepo.deleteWechatIdentityForAccount(tx, {
            accountId,
            identityId,
          });
          if (!identity) return null;
          await auditRepo.createAuditLog(tx, {
            actorAccountId: request.account!.id,
            institutionId: auditInstitutionId(assignments),
            requestId: request.id,
            action: 'account.wechat_unbound',
            resourceType: 'account',
            resourceId: accountId,
            summary: `解绑微信：${account.displayName}`,
            meta: { identityId: identity.id, appId: identity.appId },
          });
          return identity;
        });
        if (!identity) {
          throw httpError(404, '微信绑定不存在');
        }
        return { identity };
      },
    );

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
      const result = await signIn(reply, account);
      return { ...result, verificationSent: codeResult.sent };
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

    app.post('/auth/resend-verification', { preHandler: app.authenticate }, async (request) => {
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
    });

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
      const resolved = await loadPublicAccountForRole(
        updated!,
        request.account!.role as accountsRepo.AccountRole,
      );
      return { account: resolved.account };
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
