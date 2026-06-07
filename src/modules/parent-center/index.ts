import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as notificationsRepo from '../../db/repositories/notifications.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as seatReservationRepo from '../../db/repositories/seat-reservations.js';
import * as trialRepo from '../../db/repositories/trial.js';
import * as schema from '../../db/schema.js';
import { httpError } from '../../lib/http-error.js';
import type { AppModule } from '../types.js';

const seatReservationRescheduleSchema = z.object({
  trialSessionId: z.string(),
});

function canRescheduleSeatReservation(
  reservation: typeof schema.seatReservations.$inferSelect,
  now: Date,
) {
  return (
    reservation.paymentStatus === 'paid' &&
    reservation.reservationStatus === 'reserved' &&
    reservation.checkInStatus === 'pending' &&
    reservation.rescheduleCount < 1 &&
    (!reservation.cancelBefore || reservation.cancelBefore > now)
  );
}

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

    async function requireSeatReservationForAccount(accountId: string, seatReservationId: string) {
      const [row] = await app.db
        .select({ seatReservation: schema.seatReservations })
        .from(schema.seatReservations)
        .innerJoin(schema.orders, eq(schema.seatReservations.orderId, schema.orders.id))
        .where(
          and(
            eq(schema.seatReservations.id, seatReservationId),
            eq(schema.orders.accountId, accountId),
          ),
        )
        .limit(1);
      if (!row) {
        throw httpError(404, 'Seat reservation not found');
      }
      return row.seatReservation;
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
      const [lessonAccounts, courses] = await Promise.all([
        app.db
          .select()
          .from(schema.lessonAccounts)
          .where(inArray(schema.lessonAccounts.studentId, studentIds)),
        catalogRepo.listCourses(app.db),
      ]);
      const studentById = new Map(students.map((s) => [s.id, s]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      return {
        lessonAccounts: lessonAccounts.map((row) => ({
          ...row,
          student: studentById.get(row.studentId),
          course: courseById.get(row.courseId) ?? null,
        })),
      };
    });

    app.get('/public/me/orders', { preHandler: app.requireParent }, async (request) => {
      const [orders, students, courses, packages] = await Promise.all([
        app.db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.accountId, request.account!.id))
          .orderBy(desc(schema.orders.createdAt)),
        peopleRepo.listStudents(app.db),
        catalogRepo.listCourses(app.db),
        packagesRepo.listPackages(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const packageById = new Map(packages.map((pkg) => [pkg.id, pkg]));

      return {
        orders: orders.map((order) => ({
          ...order,
          student: order.studentId ? (studentById.get(order.studentId) ?? null) : null,
          course: order.courseId ? (courseById.get(order.courseId) ?? null) : null,
          package: order.packageId ? (packageById.get(order.packageId) ?? null) : null,
        })),
      };
    });

    app.get('/public/me/seat-reservations', { preHandler: app.requireParent }, async (request) => {
      const rows = await app.db
        .select({ seatReservation: schema.seatReservations })
        .from(schema.seatReservations)
        .innerJoin(schema.orders, eq(schema.seatReservations.orderId, schema.orders.id))
        .where(eq(schema.orders.accountId, request.account!.id))
        .orderBy(desc(schema.seatReservations.createdAt));

      if (rows.length === 0) {
        return { seatReservations: [] };
      }

      const [courses, trialSessions, campuses] = await Promise.all([
        catalogRepo.listCourses(app.db),
        trialRepo.listTrialSessions(app.db),
        organizationRepo.listCampuses(app.db),
      ]);
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const trialSessionById = new Map(trialSessions.map((session) => [session.id, session]));
      const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
      const now = new Date();

      return {
        seatReservations: rows.map(({ seatReservation }) => {
          const canReschedule = canRescheduleSeatReservation(seatReservation, now);
          const rescheduleOptions = canReschedule
            ? trialSessions
                .filter(
                  (session) =>
                    session.status === 'open' &&
                    seatReservation.courseId === session.courseId &&
                    seatReservation.trialSessionId !== session.id &&
                    session.startsAt > now &&
                    session.bookedCount < session.capacity,
                )
                .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
            : [];

          return {
            ...seatReservation,
            course: seatReservation.courseId
              ? (courseById.get(seatReservation.courseId) ?? null)
              : null,
            trialSession: seatReservation.trialSessionId
              ? (trialSessionById.get(seatReservation.trialSessionId) ?? null)
              : null,
            campus: seatReservation.campusId
              ? (campusById.get(seatReservation.campusId) ?? null)
              : null,
            canReschedule,
            rescheduleOptions,
          };
        }),
      };
    });

    app.post(
      '/public/me/seat-reservations/:seatReservationId/reschedule',
      { preHandler: app.requireParent },
      async (request) => {
        const { seatReservationId } = request.params as { seatReservationId: string };
        const body = seatReservationRescheduleSchema.parse(request.body);
        await requireSeatReservationForAccount(request.account!.id, seatReservationId);
        return seatReservationRepo.rescheduleSeatReservation(app.db, {
          reservationId: seatReservationId,
          trialSessionId: body.trialSessionId,
        });
      },
    );

    app.get('/public/me/attendance', { preHandler: app.requireParent }, async (request) => {
      const { students } = await resolveChildren(request.account!.id);
      const studentIds = students.map((s) => s.id);
      const records = await attendanceRepo.listAttendanceForStudents(app.db, studentIds);
      const studentById = new Map(students.map((s) => [s.id, s]));
      return {
        attendance: records.map((row) => ({
          ...row,
          student: studentById.get(row.studentId)
            ? { id: row.studentId, name: studentById.get(row.studentId)!.name }
            : undefined,
        })),
      };
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
        const item = await notificationsRepo.markAsRead(
          app.db,
          notificationId,
          request.account!.id,
        );
        if (!item) {
          throw httpError(404, 'Notification not found');
        }
        return { notification: item };
      },
    );
  },
};
