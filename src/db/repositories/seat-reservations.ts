import { desc, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import * as schema from '../schema.js';
import { httpError } from '../../lib/http-error.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbOrTx = Database | Tx;

export type SeatReservation = typeof schema.seatReservations.$inferSelect;
export type NewSeatReservation = typeof schema.seatReservations.$inferInsert;

export async function createSeatReservation(db: DbOrTx, values: NewSeatReservation) {
  const [reservation] = await db.insert(schema.seatReservations).values(values).returning();
  return reservation;
}

export async function listSeatReservations(db: Database) {
  return db.select().from(schema.seatReservations).orderBy(desc(schema.seatReservations.createdAt));
}

export async function listSeatReservationsByTrialSession(db: Database, trialSessionId: string) {
  return db
    .select()
    .from(schema.seatReservations)
    .where(eq(schema.seatReservations.trialSessionId, trialSessionId))
    .orderBy(desc(schema.seatReservations.createdAt));
}

export async function findSeatReservationByOrderNo(db: Database, orderNo: string) {
  const [reservation] = await db
    .select()
    .from(schema.seatReservations)
    .where(eq(schema.seatReservations.orderNo, orderNo))
    .limit(1);
  return reservation ?? null;
}

async function requireLockedSeatReservation(tx: Tx, reservationId: string) {
  const [reservation] = await tx
    .select()
    .from(schema.seatReservations)
    .where(eq(schema.seatReservations.id, reservationId))
    .limit(1)
    .for('update');
  if (!reservation) {
    throw httpError(404, 'Seat reservation not found');
  }
  return reservation;
}

function assertPaidReserved(reservation: SeatReservation) {
  if (reservation.reservationStatus !== 'reserved') {
    throw httpError(422, 'Only reserved seats can be operated');
  }
  if (reservation.paymentStatus !== 'paid') {
    throw httpError(422, 'Seat reservation fee is not paid');
  }
}

function cancelBeforeFor(startsAt: Date) {
  return new Date(startsAt.getTime() - 12 * 60 * 60 * 1000);
}

export async function checkInSeatReservation(db: Database, reservationId: string) {
  return db.transaction(async (tx) => {
    const reservation = await requireLockedSeatReservation(tx, reservationId);
    assertPaidReserved(reservation);

    const [seatReservation] = await tx
      .update(schema.seatReservations)
      .set({
        checkInStatus: 'checked_in',
        checkedInAt: reservation.checkedInAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.seatReservations.id, reservation.id))
      .returning();

    if (reservation.leadId) {
      await tx
        .update(schema.leads)
        .set({ status: 'trial_attended', updatedAt: new Date() })
        .where(eq(schema.leads.id, reservation.leadId));
    }

    return { seatReservation };
  });
}

export async function markSeatReservationNoShow(db: Database, reservationId: string) {
  return db.transaction(async (tx) => {
    const reservation = await requireLockedSeatReservation(tx, reservationId);
    assertPaidReserved(reservation);
    if (reservation.checkInStatus === 'checked_in') {
      throw httpError(422, 'Checked-in seat reservations cannot be marked no-show');
    }

    const [seatReservation] = await tx
      .update(schema.seatReservations)
      .set({
        checkInStatus: 'no_show',
        checkedInAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.seatReservations.id, reservation.id))
      .returning();

    if (reservation.leadId) {
      await tx
        .update(schema.leads)
        .set({ status: 'follow_up', updatedAt: new Date() })
        .where(eq(schema.leads.id, reservation.leadId));
    }

    return { seatReservation };
  });
}

export async function cancelSeatReservation(db: Database, reservationId: string) {
  return db.transaction(async (tx) => {
    const reservation = await requireLockedSeatReservation(tx, reservationId);
    if (reservation.checkInStatus === 'checked_in') {
      throw httpError(422, 'Checked-in seat reservations cannot be cancelled');
    }

    const wasReserved = reservation.reservationStatus === 'reserved';
    const [seatReservation] = await tx
      .update(schema.seatReservations)
      .set({
        reservationStatus: 'cancelled',
        checkInStatus: 'pending',
        checkedInAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.seatReservations.id, reservation.id))
      .returning();

    let trialSession: typeof schema.trialSessions.$inferSelect | null = null;
    if (wasReserved && reservation.trialSessionId) {
      const [current] = await tx
        .select()
        .from(schema.trialSessions)
        .where(eq(schema.trialSessions.id, reservation.trialSessionId))
        .limit(1)
        .for('update');

      if (current) {
        const [updated] = await tx
          .update(schema.trialSessions)
          .set({
            bookedCount: Math.max(0, current.bookedCount - 1),
            updatedAt: new Date(),
          })
          .where(eq(schema.trialSessions.id, current.id))
          .returning();
        trialSession = updated ?? null;
      }
    }

    if (wasReserved && reservation.leadId) {
      await tx
        .update(schema.leads)
        .set({ status: 'follow_up', updatedAt: new Date() })
        .where(eq(schema.leads.id, reservation.leadId));
    }

    return { seatReservation, trialSession };
  });
}

export async function rescheduleSeatReservation(
  db: Database,
  input: {
    reservationId: string;
    trialSessionId: string;
    now?: Date;
  },
) {
  return db.transaction(async (tx) => {
    const now = input.now ?? new Date();
    const reservation = await requireLockedSeatReservation(tx, input.reservationId);
    assertPaidReserved(reservation);

    if (reservation.checkInStatus !== 'pending') {
      throw httpError(422, 'Only pending seat reservations can be rescheduled');
    }
    if (reservation.rescheduleCount >= 1) {
      throw httpError(422, 'Seat reservation can only be rescheduled once');
    }
    if (!reservation.trialSessionId) {
      throw httpError(422, 'Seat reservation has no trial session');
    }
    if (reservation.trialSessionId === input.trialSessionId) {
      throw httpError(422, 'Please choose another trial session');
    }
    if (reservation.cancelBefore && now >= reservation.cancelBefore) {
      throw httpError(422, 'Seat reservation can no longer be rescheduled');
    }

    const [currentSession] = await tx
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, reservation.trialSessionId))
      .limit(1)
      .for('update');

    const [targetSession] = await tx
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.id, input.trialSessionId))
      .limit(1)
      .for('update');

    if (!targetSession) {
      throw httpError(404, 'Target trial session not found');
    }
    if (targetSession.status !== 'open') {
      throw httpError(422, 'Target trial session is not open');
    }
    if (targetSession.startsAt <= now) {
      throw httpError(422, 'Target trial session has already started');
    }
    if (targetSession.bookedCount >= targetSession.capacity) {
      throw httpError(422, 'Target trial session is full');
    }
    if (reservation.courseId && targetSession.courseId !== reservation.courseId) {
      throw httpError(422, 'Seat reservation can only be rescheduled within the same course');
    }

    let previousTrialSession: typeof schema.trialSessions.$inferSelect | null = null;
    if (currentSession) {
      const [updatedPrevious] = await tx
        .update(schema.trialSessions)
        .set({
          bookedCount: Math.max(0, currentSession.bookedCount - 1),
          updatedAt: new Date(),
        })
        .where(eq(schema.trialSessions.id, currentSession.id))
        .returning();
      previousTrialSession = updatedPrevious ?? null;
    }

    const [trialSession] = await tx
      .update(schema.trialSessions)
      .set({
        bookedCount: targetSession.bookedCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.trialSessions.id, targetSession.id))
      .returning();

    const [seatReservation] = await tx
      .update(schema.seatReservations)
      .set({
        campusId: targetSession.campusId,
        courseId: targetSession.courseId,
        trialSessionId: targetSession.id,
        originalTrialSessionId: reservation.originalTrialSessionId ?? reservation.trialSessionId,
        cancelBefore: cancelBeforeFor(targetSession.startsAt),
        rescheduleCount: reservation.rescheduleCount + 1,
        rescheduledAt: now,
        updatedAt: new Date(),
      })
      .where(eq(schema.seatReservations.id, reservation.id))
      .returning();

    if (reservation.leadId) {
      await tx
        .update(schema.leads)
        .set({
          campusId: targetSession.campusId,
          courseId: targetSession.courseId,
          trialSessionId: targetSession.id,
          status: 'trial_booked',
          updatedAt: new Date(),
        })
        .where(eq(schema.leads.id, reservation.leadId));
    }

    return { seatReservation, previousTrialSession, trialSession };
  });
}
