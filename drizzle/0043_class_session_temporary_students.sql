CREATE TABLE IF NOT EXISTS "class_session_temporary_students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_session_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "billing_course_id" uuid NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session_temporary_students"
    ADD CONSTRAINT "class_session_temporary_students_class_session_id_class_sessions_id_fk"
    FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session_temporary_students"
    ADD CONSTRAINT "class_session_temporary_students_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_session_temporary_students"
    ADD CONSTRAINT "class_session_temporary_students_billing_course_id_courses_id_fk"
    FOREIGN KEY ("billing_course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_session_temporary_students_session_student_idx" ON "class_session_temporary_students" USING btree ("class_session_id","student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_session_temporary_students_session_idx" ON "class_session_temporary_students" USING btree ("class_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_session_temporary_students_student_idx" ON "class_session_temporary_students" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_session_temporary_students_billing_course_idx" ON "class_session_temporary_students" USING btree ("billing_course_id");
