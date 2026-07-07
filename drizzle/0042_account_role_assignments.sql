CREATE TABLE IF NOT EXISTS "account_role_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "role" "account_role" NOT NULL,
  "guardian_id" uuid,
  "teacher_id" uuid,
  "status" "account_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "account_role_assignments"
    ADD CONSTRAINT "account_role_assignments_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "account_role_assignments"
    ADD CONSTRAINT "account_role_assignments_guardian_id_guardians_id_fk"
    FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "account_role_assignments"
    ADD CONSTRAINT "account_role_assignments_teacher_id_teachers_id_fk"
    FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_role_assignments_account_role_idx" ON "account_role_assignments" USING btree ("account_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_role_assignments_account_idx" ON "account_role_assignments" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_role_assignments_role_idx" ON "account_role_assignments" USING btree ("role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_role_assignments_guardian_idx" ON "account_role_assignments" USING btree ("guardian_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_role_assignments_teacher_idx" ON "account_role_assignments" USING btree ("teacher_id");
--> statement-breakpoint
INSERT INTO "account_role_assignments" (
  "account_id",
  "role",
  "guardian_id",
  "teacher_id",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "role",
  CASE WHEN "role" = 'parent' THEN "guardian_id" ELSE NULL END,
  CASE WHEN "role" = 'teacher' THEN "teacher_id" ELSE NULL END,
  "status",
  "created_at",
  "updated_at"
FROM "accounts"
ON CONFLICT ("account_id","role") DO NOTHING;
