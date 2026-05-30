CREATE TABLE IF NOT EXISTS "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"brand_name" varchar(160) NOT NULL,
	"phone" varchar(40),
	"address" varchar(255),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "organization" ("id", "name", "brand_name", "phone", "address", "settings", "created_at", "updated_at")
SELECT "id", "name", "brand_name", "phone", "address", "settings", "created_at", "updated_at"
FROM "tenants"
ORDER BY "created_at"
LIMIT 1;
--> statement-breakpoint
INSERT INTO "organization" ("name", "brand_name", "settings")
SELECT '机构', '机构', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "organization");
--> statement-breakpoint
DROP TABLE IF EXISTS "tenant_memberships" CASCADE;
--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "campuses" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "channels" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "class_enrollments" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "class_sessions" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "classes" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "classrooms" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "course_packages" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "follow_up_records" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "guardians" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "lesson_accounts" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "lesson_transactions" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "parents" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "teachers" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
ALTER TABLE "trial_sessions" DROP COLUMN IF EXISTS "tenant_id" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "tenants" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "tenant_status";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channels_code_idx" ON "channels" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_code_idx" ON "campaigns" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_channel_idx" ON "campaigns" USING btree ("channel_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "courses_slug_idx" ON "courses" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_status_idx" ON "courses" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trial_sessions_starts_idx" ON "trial_sessions" USING btree ("starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardians_phone_idx" ON "guardians" USING btree ("phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_status_idx" ON "students" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads" USING btree ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_channel_idx" ON "leads" USING btree ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_status_idx" ON "teachers" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classrooms_campus_idx" ON "classrooms" USING btree ("campus_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classrooms_status_idx" ON "classrooms" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_status_idx" ON "classes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_sessions_classroom_time_idx" ON "class_sessions" USING btree ("classroom_id","starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_sessions_teacher_time_idx" ON "class_sessions" USING btree ("teacher_id","starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parents_email_idx" ON "parents" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_packages_status_idx" ON "course_packages" USING btree ("status");
