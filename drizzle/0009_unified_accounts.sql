-- Unified identity migration. The application now uses accounts for staff,
-- teachers, and parents; older deployments may still have users/parents.
DO $$ BEGIN
  CREATE TYPE "public"."account_role" AS ENUM('admin', 'teacher', 'parent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."account_security_purpose" AS ENUM('email_verify', 'password_reset');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role" "account_role" NOT NULL,
  "email" varchar(255),
  "phone" varchar(40),
  "password_hash" varchar(255) NOT NULL,
  "display_name" varchar(120) NOT NULL,
  "status" "account_status" DEFAULT 'active' NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "email_verified_at" timestamp with time zone,
  "guardian_id" uuid,
  "teacher_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_guardian_id_guardians_id_fk"
    FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_teacher_id_teachers_id_fk"
    FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    INSERT INTO "accounts" (
      "id",
      "role",
      "email",
      "password_hash",
      "display_name",
      "status",
      "created_at",
      "updated_at"
    )
    SELECT
      "id",
      'admin'::"account_role",
      "email",
      COALESCE("password_hash", ''),
      "display_name",
      "status"::text::"account_status",
      "created_at",
      "updated_at"
    FROM "users"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.parents') IS NOT NULL THEN
    INSERT INTO "accounts" (
      "id",
      "role",
      "email",
      "phone",
      "password_hash",
      "display_name",
      "status",
      "must_change_password",
      "email_verified_at",
      "guardian_id",
      "created_at",
      "updated_at"
    )
    SELECT
      "id",
      'parent'::"account_role",
      "email",
      "phone",
      "password_hash",
      "display_name",
      "status"::text::"account_status",
      false,
      "email_verified_at",
      "guardian_id",
      "created_at",
      "updated_at"
    FROM "parents"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_idx" ON "accounts" USING btree ("email") WHERE "email" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_phone_idx" ON "accounts" USING btree ("phone") WHERE "phone" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_role_idx" ON "accounts" USING btree ("role");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_security_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "purpose" "account_security_purpose" NOT NULL,
  "code_hash" varchar(255) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "account_security_codes"
    ADD CONSTRAINT "account_security_codes_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_security_codes_account_purpose_idx" ON "account_security_codes" USING btree ("account_id","purpose","created_at");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.parents') IS NOT NULL THEN
    UPDATE "orders"
    SET "account_id" = "parent_id"
    WHERE "account_id" IS NULL
      AND EXISTS (SELECT 1 FROM "accounts" WHERE "accounts"."id" = "orders"."parent_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_account_idx" ON "orders" USING btree ("account_id");
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actor_account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE "audit_logs"
    SET "actor_account_id" = "actor_user_id"
    WHERE "actor_account_id" IS NULL
      AND EXISTS (SELECT 1 FROM "accounts" WHERE "accounts"."id" = "audit_logs"."actor_user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actor_account_id_accounts_id_fk"
    FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");
