CREATE TABLE IF NOT EXISTS "student_works" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid,
  "student_id" uuid NOT NULL,
  "course_id" uuid,
  "class_id" uuid,
  "class_session_id" uuid,
  "teacher_id" uuid,
  "title" varchar(160) DEFAULT '作品展示' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "frame_style" varchar(40) DEFAULT 'classic' NOT NULL,
  "source" varchar(40) DEFAULT 'parent' NOT NULL,
  "status" varchar(40) DEFAULT 'published' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "student_works" ADD CONSTRAINT "student_works_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "student_works" ADD CONSTRAINT "student_works_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "student_works" ADD CONSTRAINT "student_works_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "student_works" ADD CONSTRAINT "student_works_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "student_works" ADD CONSTRAINT "student_works_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "student_works" ADD CONSTRAINT "student_works_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "student_works_student_idx" ON "student_works" USING btree ("student_id","created_at");
CREATE INDEX IF NOT EXISTS "student_works_course_idx" ON "student_works" USING btree ("course_id","created_at");
CREATE INDEX IF NOT EXISTS "student_works_class_idx" ON "student_works" USING btree ("class_id","created_at");
CREATE INDEX IF NOT EXISTS "student_works_session_idx" ON "student_works" USING btree ("class_session_id");
CREATE INDEX IF NOT EXISTS "student_works_teacher_idx" ON "student_works" USING btree ("teacher_id","created_at");
