CREATE TABLE "class_session_teachers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_session_id" uuid NOT NULL,
  "teacher_id" uuid NOT NULL,
  "role" varchar(40) DEFAULT 'assistant' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_session_teachers"
  ADD CONSTRAINT "class_session_teachers_class_session_id_class_sessions_id_fk"
  FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_session_teachers"
  ADD CONSTRAINT "class_session_teachers_teacher_id_teachers_id_fk"
  FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "class_session_teachers_session_teacher_idx"
  ON "class_session_teachers" USING btree ("class_session_id","teacher_id");
--> statement-breakpoint
CREATE INDEX "class_session_teachers_session_idx"
  ON "class_session_teachers" USING btree ("class_session_id");
--> statement-breakpoint
CREATE INDEX "class_session_teachers_teacher_idx"
  ON "class_session_teachers" USING btree ("teacher_id");
--> statement-breakpoint
INSERT INTO "class_session_teachers" ("class_session_id", "teacher_id", "role")
SELECT "id", "teacher_id", 'primary'
FROM "class_sessions"
ON CONFLICT ("class_session_id", "teacher_id") DO NOTHING;
