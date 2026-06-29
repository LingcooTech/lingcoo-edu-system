ALTER TABLE "lesson_feedbacks" ADD COLUMN IF NOT EXISTS "rating" integer NOT NULL DEFAULT 0;
ALTER TABLE "homework_checkins" ADD COLUMN IF NOT EXISTS "rating" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "homework_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_session_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "course_id" uuid,
  "teacher_id" uuid,
  "student_id" uuid,
  "content" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "homework_assignments_session_student_idx" ON "homework_assignments" USING btree ("class_session_id","student_id");
CREATE UNIQUE INDEX IF NOT EXISTS "homework_assignments_session_class_idx" ON "homework_assignments" USING btree ("class_session_id") WHERE "student_id" is null;
CREATE INDEX IF NOT EXISTS "homework_assignments_student_idx" ON "homework_assignments" USING btree ("student_id","created_at");
CREATE INDEX IF NOT EXISTS "homework_assignments_class_idx" ON "homework_assignments" USING btree ("class_id","created_at");
CREATE INDEX IF NOT EXISTS "homework_assignments_session_idx" ON "homework_assignments" USING btree ("class_session_id");
