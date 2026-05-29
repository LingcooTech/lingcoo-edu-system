import { and, desc, eq, inArray } from 'drizzle-orm';

import * as parentsRepo from '../../db/repositories/parents.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import type { AppModule } from '../types.js';

export const parentCenterModule: AppModule = {
  name: 'parent-center',
  async register(app) {
    // Resolves the students linked to the authenticated parent. A parent is
    // linked to a guardian (CRM contact); students reference that guardian.
    async function resolveChildren(parentId: string) {
      const parent = await parentsRepo.findParentById(app.db, parentId);
      if (!parent) {
        throw httpError(404, 'Parent not found');
      }
      if (!parent.guardianId) {
        return { parent, students: [] as (typeof schema.students.$inferSelect)[] };
      }
      const students = await app.db
        .select()
        .from(schema.students)
        .where(
          and(
            eq(schema.students.tenantId, parent.tenantId),
            eq(schema.students.guardianId, parent.guardianId),
          ),
        );
      return { parent, students };
    }

    app.get(
      '/public/:tenantSlug/me/children',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { students } = await resolveChildren(request.parent!.id);
        return { children: students };
      },
    );

    app.get(
      '/public/:tenantSlug/me/lesson-accounts',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { students } = await resolveChildren(request.parent!.id);
        const studentIds = students.map((s) => s.id);
        if (studentIds.length === 0) {
          return { lessonAccounts: [] };
        }
        const accounts = await app.db
          .select()
          .from(schema.lessonAccounts)
          .where(inArray(schema.lessonAccounts.studentId, studentIds));
        const studentById = new Map(students.map((s) => [s.id, s]));
        return {
          lessonAccounts: accounts.map((account) => ({
            ...account,
            student: studentById.get(account.studentId),
          })),
        };
      },
    );

    app.get(
      '/public/:tenantSlug/me/orders',
      { preHandler: app.authenticateParent },
      async (request) => {
        const orders = await app.db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.parentId, request.parent!.id))
          .orderBy(desc(schema.orders.createdAt));
        return { orders };
      },
    );

    app.get(
      '/public/:tenantSlug/me/notifications',
      { preHandler: app.authenticateParent },
      async (request) => {
        const items = await notificationsRepo.listForRecipient(app.db, {
          recipientType: 'parent',
          recipientId: request.parent!.id,
        });
        return { notifications: items };
      },
    );

    app.post(
      '/public/:tenantSlug/me/notifications/:notificationId/read',
      { preHandler: app.authenticateParent },
      async (request) => {
        const { notificationId } = request.params as { notificationId: string };
        const item = await notificationsRepo.markAsRead(
          app.db,
          notificationId,
          request.parent!.id,
        );
        if (!item) {
          throw httpError(404, 'Notification not found');
        }
        return { notification: item };
      },
    );
  },
};
