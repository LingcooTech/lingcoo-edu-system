import { z } from 'zod';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as lessonRepo from '../../db/repositories/lesson.js';
import * as schema from '../../db/schema.js';
import { hashPassword, defaultPasswordFromPhone } from '../../lib/password.js';
import type { AppModule } from '../types.js';

const studentStatusSchema = z.enum(['active', 'inactive', 'archived']);
const studentListQuerySchema = z.object({
  scope: z.enum(['current', 'archived', 'all']).default('current'),
});

const studentSchema = z.object({
  guardianId: z.string().uuid().optional(),
  guardianName: z.string().trim().optional(),
  guardianPhone: z.string().trim().optional(),
  createParentAccount: z.boolean().default(false),
  name: z.string().min(1),
  grade: z.string().min(1),
  school: z.string().optional(),
  status: studentStatusSchema.default('active'),
});

const studentUpdateSchema = studentSchema.partial();

const guardianSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(40),
});

const guardianUpdateSchema = guardianSchema.partial();

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export const peopleModule: AppModule = {
  name: 'people',
  async register(app) {
    async function enrichStudent(student: typeof schema.students.$inferSelect) {
      const [guardian, accounts, courses] = await Promise.all([
        student.guardianId ? peopleRepo.findGuardian(app.db, student.guardianId) : null,
        lessonRepo.listLessonAccounts(app.db),
        catalogRepo.listCourses(app.db),
      ]);
      const courseById = new Map(courses.map((course) => [course.id, course]));
      return {
        ...student,
        guardian: guardian ?? undefined,
        lessonAccounts: accounts
          .filter((account) => account.studentId === student.id)
          .map((account) => ({
            ...account,
            course: courseById.get(account.courseId) ?? null,
          })),
      };
    }

    async function resolveGuardianForStudent(input: {
      currentGuardianId?: string | null;
      guardianId?: string | null;
      guardianName?: string;
      guardianPhone?: string;
    }) {
      if (input.guardianId) {
        const guardian = await peopleRepo.findGuardian(app.db, input.guardianId);
        if (!guardian) {
          throw Object.assign(new Error('家长档案不存在'), { statusCode: 404 });
        }
        return guardian;
      }

      const guardianName = input.guardianName?.trim();
      const guardianPhone = input.guardianPhone?.trim();
      if (!guardianName && !guardianPhone) {
        return input.currentGuardianId
          ? peopleRepo.findGuardian(app.db, input.currentGuardianId)
          : null;
      }
      if (!guardianName || !guardianPhone) {
        throw Object.assign(new Error('家长姓名和手机号需同时填写'), { statusCode: 422 });
      }

      const existingByPhone = await peopleRepo.findGuardianByPhone(app.db, guardianPhone);
      if (existingByPhone) {
        if (input.currentGuardianId && existingByPhone.id !== input.currentGuardianId) {
          throw Object.assign(new Error('该手机号已有家长档案'), { statusCode: 409 });
        }
        if (existingByPhone.name !== guardianName) {
          return peopleRepo.updateGuardian(app.db, existingByPhone.id, { name: guardianName });
        }
        return existingByPhone;
      }

      if (input.currentGuardianId) {
        const currentGuardian = await peopleRepo.findGuardian(app.db, input.currentGuardianId);
        if (!currentGuardian) {
          throw Object.assign(new Error('家长档案不存在'), { statusCode: 404 });
        }
        return peopleRepo.updateGuardian(app.db, currentGuardian.id, {
          name: guardianName,
          phone: guardianPhone,
        });
      }

      return peopleRepo.createGuardian(app.db, {
        name: guardianName,
        phone: guardianPhone,
      });
    }

    async function ensureParentAccount(guardian: typeof schema.guardians.$inferSelect | null) {
      if (!guardian) {
        throw Object.assign(new Error('请先填写家长姓名和手机号'), { statusCode: 422 });
      }
      const defaultPassword = defaultPasswordFromPhone(guardian.phone);
      if (!defaultPassword) {
        throw Object.assign(new Error('家长手机号至少需要 6 位才能创建账号'), { statusCode: 422 });
      }
      const existing = await accountsRepo.findByPhone(app.db, guardian.phone);
      if (existing) {
        if (existing.role !== 'parent') {
          throw Object.assign(new Error('该手机号已绑定非家长账号'), { statusCode: 409 });
        }
        if (existing.guardianId && existing.guardianId !== guardian.id) {
          throw Object.assign(new Error('该手机号已绑定其他家长账号'), { statusCode: 409 });
        }
        if (!existing.guardianId) {
          await accountsRepo.updateAccount(app.db, existing.id, { guardianId: guardian.id });
        }
        return { parentAccountCreated: false, defaultPassword: undefined };
      }

      await accountsRepo.createAccount(app.db, {
        role: 'parent',
        phone: guardian.phone,
        displayName: guardian.name,
        guardianId: guardian.id,
        passwordHash: hashPassword(defaultPassword),
        mustChangePassword: true,
      });
      return { parentAccountCreated: true, defaultPassword };
    }

    app.get('/v1/guardians', { preHandler: app.requireAdmin }, async () => {
      return { guardians: await peopleRepo.listGuardians(app.db) };
    });

    app.post('/v1/guardians', { preHandler: app.requireAdmin }, async (request) => {
      const body = guardianSchema.parse(request.body);
      const existing = await peopleRepo.findGuardianByPhone(app.db, body.phone.trim());
      if (existing) {
        throw Object.assign(new Error('该手机号已有家长档案'), { statusCode: 409 });
      }
      const guardian = await peopleRepo.createGuardian(app.db, {
        name: body.name.trim(),
        phone: body.phone.trim(),
      });
      return { guardian };
    });

    app.patch('/v1/guardians/:guardianId', { preHandler: app.requireAdmin }, async (request) => {
      const { guardianId } = request.params as { guardianId: string };
      const body = guardianUpdateSchema.parse(request.body);
      const phone = body.phone?.trim();
      if (phone) {
        const existing = await peopleRepo.findGuardianByPhone(app.db, phone);
        if (existing && existing.id !== guardianId) {
          throw Object.assign(new Error('该手机号已有家长档案'), { statusCode: 409 });
        }
      }
      const guardian = await peopleRepo.updateGuardian(app.db, guardianId, {
        name: body.name?.trim(),
        phone,
      });
      if (!guardian) throw notFound('Guardian not found');
      return { guardian };
    });

    app.get('/v1/students', { preHandler: app.requireAdmin }, async (request) => {
      const query = studentListQuerySchema.parse(request.query);
      const [students, guardians, accounts, courses] = await Promise.all([
        peopleRepo.listStudents(app.db, { scope: query.scope }),
        peopleRepo.listGuardians(app.db),
        lessonRepo.listLessonAccounts(app.db),
        catalogRepo.listCourses(app.db),
      ]);
      const guardianById = new Map(guardians.map((guardian) => [guardian.id, guardian]));
      const courseById = new Map(courses.map((course) => [course.id, course]));

      return {
        students: students.map((student) => ({
          ...student,
          guardian: student.guardianId ? guardianById.get(student.guardianId) : undefined,
          lessonAccounts: accounts
            .filter((account) => account.studentId === student.id)
            .map((account) => ({
              ...account,
              course: courseById.get(account.courseId) ?? null,
            })),
        })),
      };
    });

    app.post('/v1/students', { preHandler: app.requireAdmin }, async (request) => {
      const body = studentSchema.parse(request.body);

      const guardian = await resolveGuardianForStudent({
        guardianId: body.guardianId ?? null,
        guardianName: body.guardianName,
        guardianPhone: body.guardianPhone,
      });
      const accountResult = body.createParentAccount
        ? await ensureParentAccount(guardian)
        : { parentAccountCreated: false, defaultPassword: undefined };

      const student = await peopleRepo.createStudent(app.db, {
        guardianId: guardian?.id ?? null,
        name: body.name,
        grade: body.grade,
        school: body.school,
        status: body.status,
      });
      return { student: await enrichStudent(student), ...accountResult };
    });

    app.patch('/v1/students/:studentId', { preHandler: app.requireAdmin }, async (request) => {
      const { studentId } = request.params as { studentId: string };
      const body = studentUpdateSchema.parse(request.body);
      const current = await peopleRepo.requireStudent(app.db, studentId);
      const shouldUpdateGuardian =
        body.guardianId !== undefined ||
        body.guardianName !== undefined ||
        body.guardianPhone !== undefined;
      const guardian = shouldUpdateGuardian
        ? await resolveGuardianForStudent({
            currentGuardianId: current.guardianId,
            guardianId: body.guardianId ?? null,
            guardianName: body.guardianName,
            guardianPhone: body.guardianPhone,
          })
        : current.guardianId
          ? await peopleRepo.findGuardian(app.db, current.guardianId)
          : null;
      const accountResult = body.createParentAccount
        ? await ensureParentAccount(guardian)
        : { parentAccountCreated: false, defaultPassword: undefined };

      const student = await peopleRepo.updateStudent(app.db, studentId, {
        guardianId: shouldUpdateGuardian ? (guardian?.id ?? null) : undefined,
        name: body.name,
        grade: body.grade,
        school: body.school,
        status: body.status,
      });
      if (!student) throw notFound('Student not found');
      return { student: await enrichStudent(student), ...accountResult };
    });

    app.delete('/v1/students/:studentId', { preHandler: app.requireAdmin }, async (request) => {
      const { studentId } = request.params as { studentId: string };
      const student = await peopleRepo.archiveStudent(app.db, studentId);
      if (!student) throw notFound('Student not found');
      return { student };
    });

    app.delete(
      '/v1/students/:studentId/hard',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { studentId } = request.params as { studentId: string };
        const student = await peopleRepo.hardDeleteStudent(app.db, studentId);
        if (!student) throw notFound('Student not found');
        return { student };
      },
    );
  },
};
