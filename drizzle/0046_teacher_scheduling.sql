ALTER TABLE "account_role_assignments"
  ADD COLUMN IF NOT EXISTS "teacher_permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
UPDATE "class_sessions" AS cs
SET "course_id" = c."course_id"
FROM "classes" AS c
WHERE cs."class_id" = c."id"
  AND cs."course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "class_sessions" ALTER COLUMN "course_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_sessions" ALTER COLUMN "class_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_sessions"
  ADD COLUMN IF NOT EXISTS "session_type" varchar(40) DEFAULT 'class' NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_sessions"
  ADD COLUMN IF NOT EXISTS "lesson_units" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_sessions"
  ADD COLUMN IF NOT EXISTS "created_by_account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_sessions"
    ADD CONSTRAINT "class_sessions_course_id_courses_id_fk"
    FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_sessions"
    ADD CONSTRAINT "class_sessions_created_by_account_id_accounts_id_fk"
    FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_sessions_course_idx"
  ON "class_sessions" USING btree ("course_id","starts_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_session_students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_session_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "billing_course_id" uuid NOT NULL,
  "source" varchar(40) DEFAULT 'session_only' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session_students"
    ADD CONSTRAINT "class_session_students_class_session_id_class_sessions_id_fk"
    FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session_students"
    ADD CONSTRAINT "class_session_students_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session_students"
    ADD CONSTRAINT "class_session_students_billing_course_id_courses_id_fk"
    FOREIGN KEY ("billing_course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_session_students_session_student_idx"
  ON "class_session_students" USING btree ("class_session_id","student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_session_students_session_idx"
  ON "class_session_students" USING btree ("class_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_session_students_student_idx"
  ON "class_session_students" USING btree ("student_id");
