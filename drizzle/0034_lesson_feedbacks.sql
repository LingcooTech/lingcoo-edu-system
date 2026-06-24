CREATE TABLE IF NOT EXISTS "lesson_feedbacks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_session_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "teacher_id" uuid,
  "course_id" uuid,
  "class_id" uuid,
  "content" text DEFAULT '' NOT NULL,
  "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "lesson_feedbacks" ADD CONSTRAINT "lesson_feedbacks_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "lesson_feedbacks" ADD CONSTRAINT "lesson_feedbacks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "lesson_feedbacks" ADD CONSTRAINT "lesson_feedbacks_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "lesson_feedbacks" ADD CONSTRAINT "lesson_feedbacks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "lesson_feedbacks" ADD CONSTRAINT "lesson_feedbacks_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_feedbacks_session_student_idx" ON "lesson_feedbacks" USING btree ("class_session_id","student_id");
CREATE INDEX IF NOT EXISTS "lesson_feedbacks_student_idx" ON "lesson_feedbacks" USING btree ("student_id","created_at");
CREATE INDEX IF NOT EXISTS "lesson_feedbacks_teacher_idx" ON "lesson_feedbacks" USING btree ("teacher_id","created_at");
CREATE INDEX IF NOT EXISTS "lesson_feedbacks_session_idx" ON "lesson_feedbacks" USING btree ("class_session_id");
