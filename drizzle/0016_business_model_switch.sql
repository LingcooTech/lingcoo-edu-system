CREATE TYPE "public"."payment_receiver_type" AS ENUM('platform', 'provider', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('package_purchase', 'seat_reservation', 'manual_package_grant');--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "provider_institution_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "default_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "teaching_location_label" varchar(200);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "payment_receiver_type" "payment_receiver_type" DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "payment_receiver_institution_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "payment_receiver_name" varchar(160);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "trial_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "reservation_notice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "online_sales_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" "order_type" DEFAULT 'package_purchase' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_receiver_type" "payment_receiver_type" DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_receiver_institution_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_receiver_name" varchar(160);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offline_payment_note" text;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_provider_institution_id_institutions_id_fk" FOREIGN KEY ("provider_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_default_teacher_id_teachers_id_fk" FOREIGN KEY ("default_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_payment_receiver_institution_id_institutions_id_fk" FOREIGN KEY ("payment_receiver_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_receiver_institution_id_institutions_id_fk" FOREIGN KEY ("payment_receiver_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
