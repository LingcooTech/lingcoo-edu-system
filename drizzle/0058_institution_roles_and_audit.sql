ALTER TYPE "public"."account_role" ADD VALUE IF NOT EXISTS 'institution_admin' AFTER 'admin';
--> statement-breakpoint
ALTER TABLE "account_role_assignments" ADD COLUMN "institution_id" uuid;
--> statement-breakpoint
ALTER TABLE "account_role_assignments"
ADD CONSTRAINT "account_role_assignments_institution_id_fk"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "account_role_assignments_institution_idx"
ON "account_role_assignments" ("institution_id");
--> statement-breakpoint
UPDATE "account_role_assignments" ara
SET "institution_id" = t."institution_id"
FROM "teachers" t
WHERE ara."role" = 'teacher' AND ara."teacher_id" = t."id";
--> statement-breakpoint
ALTER TABLE "course_contracts" ADD COLUMN "institution_id" uuid;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD CONSTRAINT "course_contracts_institution_id_fk"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "course_contracts_institution_idx" ON "course_contracts" ("institution_id");
--> statement-breakpoint
UPDATE "course_contracts" cc
SET "institution_id" = COALESCE(c."provider_institution_id", cc."payment_receiver_institution_id")
FROM "courses" c
WHERE c."id" = cc."course_id";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "institution_id" uuid;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "request_id" varchar(120);
--> statement-breakpoint
ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_institution_id_fk"
FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "audit_logs_institution_created_idx" ON "audit_logs" ("institution_id", "created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" ("actor_account_id", "created_at");
--> statement-breakpoint
ALTER TABLE "audit_logs"
DROP CONSTRAINT IF EXISTS "audit_logs_actor_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_actor_account_id_accounts_id_fk"
FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE "audit_logs" al
SET "institution_id" = cc."institution_id"
FROM "lesson_movements" lm
INNER JOIN "course_contracts" cc ON cc."id" = lm."course_contract_id"
WHERE al."resource_type" = 'lesson_movement'
  AND al."resource_id" = lm."id"::text
  AND al."institution_id" IS NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_immutable_trigger"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_lesson_movement_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM audit_logs al
    WHERE al.resource_type = 'lesson_movement'
      AND al.resource_id = NEW.id::text
      AND al.action = 'lesson.movement.' || NEW.type::text
  ) THEN
    RAISE EXCEPTION 'lesson movement % has no matching audit log', NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_movements_audit_required_trigger"
AFTER INSERT ON "lesson_movements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_lesson_movement_audit();
