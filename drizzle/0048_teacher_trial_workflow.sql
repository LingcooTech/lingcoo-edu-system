ALTER TABLE "trial_sessions"
  ADD COLUMN IF NOT EXISTS "teacher_id" uuid;
--> statement-breakpoint
ALTER TABLE "trial_sessions"
  ADD COLUMN IF NOT EXISTS "session_mode" varchar(40) DEFAULT 'public_event' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "trial_sessions"
    ADD CONSTRAINT "trial_sessions_teacher_id_teachers_id_fk"
    FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trial_sessions_teacher_starts_idx"
  ON "trial_sessions" USING btree ("teacher_id","starts_at");
