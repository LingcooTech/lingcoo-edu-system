import { desc, eq, inArray } from 'drizzle-orm';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import type { AppModule } from '../types.js';

export const parentCenterModule: AppModule = {
  name: 'parent-center',
  async register(app) {
    // Resolves the students linked to the authenticated parent account. A parent
    // account links to a guardian (CRM contact); students reference that guardian.
    async function resolveChildren(accountId: string) {
      const account = await accountsRepo.findById(app.db, accountId);
      if (!account) {
        throw httpError(404, 'Account not found');
      }
      if (!account.guardianId) {
        return { account, students: [] as (typeof schema.students.$inferSelect)[] };
      }
      const students = await app.db
        .select()
        .from(schema.students)
        .where(eq(schema.students.guardianId, account.guardianId));
      return { account, students };
    }

    app.get('/public/me/children', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      return { children: students };
    });

    app.get('/public/me/lesson-accounts', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((s) => s.id);
      if (studentIds.length === 0) {
        return { lessonAccounts: [] };
      }
      const lessonAccounts = await app.db
        .select()
        .from(schema.lessonAccounts)
        .where(inArray(schema.lessonAccounts.studentId, studentIds));
      const studentById = new Map(students.map((s) => [s.id, s]));
      return {
        lessonAccounts: lessonAccounts.map((row) => ({
          ...row,
          student: studentById.get(row.studentId),
        })),
      };
    });

    app.get('/public/me/orders', { preHandler: app.requireParent }, async (request) => {
      const orders = await app.db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.accountId, request.account!.id))
        .orderBy(desc(schema.orders.createdAt));
      return { orders };
    });

    app.get('/public/me/notifications', { preHandler: app.requireParent }, async (request) => {
      const items = await notificationsRepo.listForRecipient(app.db, {
        recipientType: 'parent',
        recipientId: request.account!.id,
      });
      return { notifications: items };
    });

    app.post(
      '/public/me/notifications/:notificationId/read',
      { preHandler: app.requireParent },
      async (request) => {
        const { notificationId } = request.params as { notificationId: string };
        const item = await notificationsRepo.markAsRead(app.db, notificationId, request.account!.id);
        if (!item) {
          throw httpError(404, 'Notification not found');
        }
        return { notification: item };
      },
    );
  },
};
