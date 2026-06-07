ALTER TABLE "seat_reservations" ADD COLUMN "original_trial_session_id" uuid;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD COLUMN "reschedule_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD COLUMN "rescheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_original_trial_session_id_trial_sessions_id_fk" FOREIGN KEY ("original_trial_session_id") REFERENCES "public"."trial_sessions"("id") ON DELETE set null ON UPDATE no action;
