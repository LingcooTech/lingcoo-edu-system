CREATE TYPE "public"."seat_reservation_status" AS ENUM('pending_payment', 'reserved', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."seat_reservation_payment_status" AS ENUM('unpaid', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."seat_reservation_check_in_status" AS ENUM('pending', 'checked_in', 'no_show');--> statement-breakpoint
ALTER TABLE "trial_sessions" ADD COLUMN "reservation_fee_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trial_sessions" ADD COLUMN "reservation_notice" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE "seat_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"order_no" varchar(64) NOT NULL,
	"lead_id" uuid,
	"campus_id" uuid,
	"course_id" uuid,
	"trial_session_id" uuid,
	"guardian_name" varchar(120) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"student_name" varchar(120) NOT NULL,
	"grade" varchar(80) NOT NULL,
	"reservation_fee_amount" integer DEFAULT 0 NOT NULL,
	"reservation_status" "seat_reservation_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_status" "seat_reservation_payment_status" DEFAULT 'unpaid' NOT NULL,
	"check_in_status" "seat_reservation_check_in_status" DEFAULT 'pending' NOT NULL,
	"cancel_before" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"source" varchar(80) DEFAULT 'unknown' NOT NULL,
	"channel_id" uuid,
	"campaign_id" uuid,
	"medium" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_reservations" ADD CONSTRAINT "seat_reservations_trial_session_id_trial_sessions_id_fk" FOREIGN KEY ("trial_session_id") REFERENCES "public"."trial_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seat_reservations_order_no_idx" ON "seat_reservations" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "seat_reservations_trial_session_idx" ON "seat_reservations" USING btree ("trial_session_id");--> statement-breakpoint
CREATE INDEX "seat_reservations_phone_idx" ON "seat_reservations" USING btree ("phone");
