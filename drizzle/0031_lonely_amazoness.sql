CREATE TYPE "public"."content_source" AS ENUM('manual', 'wordpress', 'notion', 'wechat');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."course_series_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."order_cancel_reason" AS ENUM('user_cancel', 'system_cancel', 'admin_invalid', 'test_order', 'duplicate', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('schedule_conflict', 'course_not_fit', 'duplicate_payment', 'service_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."student_status" ADD VALUE 'archived';--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(200) NOT NULL,
	"excerpt" text,
	"content" text DEFAULT '' NOT NULL,
	"cover_url" varchar(500),
	"author_name" varchar(120),
	"source_type" "content_source" DEFAULT 'manual' NOT NULL,
	"source_id" varchar(255),
	"source_url" varchar(2048),
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "course_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "course_series_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"account_id" uuid,
	"amount" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"status" "refund_request_status" DEFAULT 'pending' NOT NULL,
	"buyer_note" text,
	"admin_note" text,
	"decided_by_account_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_packages" ADD COLUMN "course_series_id" uuid;--> statement-breakpoint
ALTER TABLE "course_packages" ADD COLUMN "gifted_lesson_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_packages" ADD COLUMN "discount_price_amount" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "course_series_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "default_teacher_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "classroom_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "classroom_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "cover_image_url" varchar(500);--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "qualification_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "outcome_items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "preferred_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "course_series_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" "order_cancel_reason";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trial_sessions" ADD COLUMN "cover_image_url" varchar(500);--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_decided_by_account_id_accounts_id_fk" FOREIGN KEY ("decided_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_source_type_source_id_idx" ON "content_items" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "content_items_status_published_at_idx" ON "content_items" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "content_items_source_url_idx" ON "content_items" USING btree ("source_url");--> statement-breakpoint
CREATE UNIQUE INDEX "course_series_slug_idx" ON "course_series" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "course_series_status_idx" ON "course_series" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refund_requests_order_idx" ON "refund_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refund_requests_order_no_idx" ON "refund_requests" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "refund_requests_account_idx" ON "refund_requests" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "refund_requests_status_idx" ON "refund_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_open_order_idx" ON "refund_requests" USING btree ("order_id") WHERE "refund_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "course_packages" ADD CONSTRAINT "course_packages_course_series_id_course_series_id_fk" FOREIGN KEY ("course_series_id") REFERENCES "public"."course_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_course_series_id_course_series_id_fk" FOREIGN KEY ("course_series_id") REFERENCES "public"."course_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_preferred_teacher_id_teachers_id_fk" FOREIGN KEY ("preferred_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_course_series_id_course_series_id_fk" FOREIGN KEY ("course_series_id") REFERENCES "public"."course_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_admin_id_accounts_id_fk" FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_packages_course_idx" ON "course_packages" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_packages_course_series_idx" ON "course_packages" USING btree ("course_series_id");--> statement-breakpoint
CREATE INDEX "orders_course_series_idx" ON "orders" USING btree ("course_series_id");