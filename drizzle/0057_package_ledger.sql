DO $$ BEGIN
  CREATE TYPE "public"."lesson_movement_type" AS ENUM(
    'grant', 'consume', 'reversal', 'expire', 'refund', 'adjustment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "attendance_records"
ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_records"
ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD COLUMN "parent_course_contract_id" uuid;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD COLUMN "origin" varchar(40) DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD CONSTRAINT "course_contracts_parent_id_fk"
FOREIGN KEY ("parent_course_contract_id") REFERENCES "course_contracts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "course_contracts_parent_idx"
ON "course_contracts" ("parent_course_contract_id");
--> statement-breakpoint
ALTER TABLE "course_contract_gifts"
ADD COLUMN "granted_course_contract_id" uuid;
--> statement-breakpoint
ALTER TABLE "course_contract_gifts"
ADD CONSTRAINT "course_contract_gifts_granted_contract_id_fk"
FOREIGN KEY ("granted_course_contract_id") REFERENCES "course_contracts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "course_contract_gifts_granted_contract_idx"
ON "course_contract_gifts" ("granted_course_contract_id")
WHERE "granted_course_contract_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_records"
DROP CONSTRAINT IF EXISTS "attendance_records_course_contract_id_course_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_records"
ADD CONSTRAINT "attendance_records_course_contract_id_course_contracts_id_fk"
FOREIGN KEY ("course_contract_id") REFERENCES "course_contracts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "course_contract_payment_records"
DROP CONSTRAINT IF EXISTS "course_contract_payment_records_course_contract_id_course_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "course_contract_payment_records"
ADD CONSTRAINT "course_contract_payment_records_course_contract_id_course_contracts_id_fk"
FOREIGN KEY ("course_contract_id") REFERENCES "course_contracts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "course_contract_gifts"
DROP CONSTRAINT IF EXISTS "course_contract_gifts_course_contract_id_course_contracts_id_fk";
--> statement-breakpoint
ALTER TABLE "course_contract_gifts"
ADD CONSTRAINT "course_contract_gifts_course_contract_id_course_contracts_id_fk"
FOREIGN KEY ("course_contract_id") REFERENCES "course_contracts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD CONSTRAINT "course_contracts_lesson_count_nonnegative_check"
CHECK ("lesson_count" >= 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD CONSTRAINT "course_contracts_remaining_nonnegative_check"
CHECK ("remaining_lesson_count" >= 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE "course_contracts"
ADD CONSTRAINT "course_contracts_remaining_within_total_check"
CHECK ("remaining_lesson_count" <= "lesson_count") NOT VALID;
--> statement-breakpoint
ALTER TABLE "attendance_records"
ADD CONSTRAINT "attendance_records_deducted_package_required_check"
CHECK ("lesson_delta" >= 0 OR "course_contract_id" IS NOT NULL) NOT VALID;
--> statement-breakpoint
CREATE TABLE "lesson_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_contract_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "attendance_record_id" uuid,
  "operation_id" varchar(200) NOT NULL,
  "type" "lesson_movement_type" NOT NULL,
  "units" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "actor_account_id" uuid,
  "reason" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_movements_units_nonzero_check" CHECK ("units" <> 0),
  CONSTRAINT "lesson_movements_balance_before_nonnegative_check" CHECK ("balance_before" >= 0),
  CONSTRAINT "lesson_movements_balance_after_nonnegative_check" CHECK ("balance_after" >= 0),
  CONSTRAINT "lesson_movements_balance_math_check"
    CHECK ("balance_after" = "balance_before" + "units")
);
--> statement-breakpoint
ALTER TABLE "lesson_movements"
ADD CONSTRAINT "lesson_movements_course_contract_id_fk"
FOREIGN KEY ("course_contract_id") REFERENCES "course_contracts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "lesson_movements"
ADD CONSTRAINT "lesson_movements_student_id_fk"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "lesson_movements"
ADD CONSTRAINT "lesson_movements_attendance_record_id_fk"
FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "lesson_movements"
ADD CONSTRAINT "lesson_movements_actor_account_id_fk"
FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_movements_operation_idx" ON "lesson_movements" ("operation_id");
--> statement-breakpoint
CREATE INDEX "lesson_movements_contract_created_idx"
ON "lesson_movements" ("course_contract_id", "created_at");
--> statement-breakpoint
CREATE INDEX "lesson_movements_attendance_idx" ON "lesson_movements" ("attendance_record_id");
--> statement-breakpoint
CREATE INDEX "lesson_movements_student_idx" ON "lesson_movements" ("student_id", "created_at");
--> statement-breakpoint
INSERT INTO "lesson_movements" (
  "course_contract_id", "student_id", "operation_id", "type", "units",
  "balance_before", "balance_after", "occurred_at", "reason", "metadata"
)
WITH assigned_consumption AS (
  SELECT ar.course_contract_id, COALESCE(-SUM(ar.lesson_delta), 0)::integer AS consumed_units
  FROM "attendance_records" ar
  INNER JOIN "course_contracts" cc
    ON cc.id = ar.course_contract_id AND cc.student_id = ar.student_id
  WHERE ar.lesson_delta < 0
  GROUP BY ar.course_contract_id
)
SELECT cc.id, cc.student_id, 'migration:0057:opening:' || cc.id,
  'grant'::"lesson_movement_type",
  cc.remaining_lesson_count + COALESCE(ac.consumed_units, 0),
  0,
  cc.remaining_lesson_count + COALESCE(ac.consumed_units, 0),
  LEAST(cc.created_at, COALESCE(first_use.occurred_at, cc.created_at)),
  '迁移期课时包期初发放（当前余额加已归属历史消费）',
  jsonb_build_object(
    'legacyLessonCount', cc.lesson_count,
    'migration', '0057_package_ledger',
    'historicalConsumedUnits', COALESCE(ac.consumed_units, 0),
    'openingBalanceOnly', true
  )
FROM "course_contracts" cc
LEFT JOIN assigned_consumption ac ON ac.course_contract_id = cc.id
LEFT JOIN LATERAL (
  SELECT cs.starts_at AS occurred_at
  FROM "attendance_records" ar
  INNER JOIN "class_sessions" cs ON cs.id = ar.class_session_id
  WHERE ar.course_contract_id = cc.id AND ar.student_id = cc.student_id AND ar.lesson_delta < 0
  ORDER BY cs.starts_at, ar.created_at, ar.id
  LIMIT 1
) first_use ON true
WHERE cc.remaining_lesson_count + COALESCE(ac.consumed_units, 0) > 0
ON CONFLICT ("operation_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "lesson_movements" (
  "course_contract_id", "student_id", "attendance_record_id", "operation_id", "type", "units",
  "balance_before", "balance_after", "occurred_at", "reason", "metadata"
)
WITH valid_attendance AS (
  SELECT ar.id, ar.course_contract_id, ar.student_id, ar.class_session_id, ar.status,
    ar.lesson_delta, ar.created_at, cs.starts_at,
    cc.remaining_lesson_count - SUM(ar.lesson_delta) OVER (
      PARTITION BY ar.course_contract_id
    ) AS opening_balance
  FROM "attendance_records" ar
  INNER JOIN "course_contracts" cc
    ON cc.id = ar.course_contract_id AND cc.student_id = ar.student_id
  INNER JOIN "class_sessions" cs ON cs.id = ar.class_session_id
  WHERE ar.lesson_delta < 0
), sequenced AS (
  SELECT va.*,
    COALESCE(SUM(va.lesson_delta) OVER (
      PARTITION BY va.course_contract_id
      ORDER BY va.starts_at, va.created_at, va.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0)::integer AS prior_units,
    SUM(va.lesson_delta) OVER (
      PARTITION BY va.course_contract_id
      ORDER BY va.starts_at, va.created_at, va.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::integer AS cumulative_units
  FROM valid_attendance va
)
SELECT course_contract_id, student_id, id,
  'migration:0057:attendance:' || id,
  'consume'::"lesson_movement_type", lesson_delta,
  (opening_balance + prior_units)::integer,
  (opening_balance + cumulative_units)::integer,
  starts_at,
  '迁移历史签到扣课：' || status,
  jsonb_build_object(
    'migration', '0057_package_ledger',
    'classSessionId', class_session_id,
    'historicalAttendance', true
  )
FROM sequenced
ON CONFLICT ("operation_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "audit_logs" (
  "action", "resource_type", "resource_id", "summary", "meta", "created_at"
)
SELECT 'lesson.movement.' || lm.type::text, 'lesson_movement', lm.id::text,
  LEFT(lm.reason, 255),
  jsonb_build_object(
    'operationId', lm.operation_id,
    'courseContractId', lm.course_contract_id,
    'studentId', lm.student_id,
    'attendanceRecordId', lm.attendance_record_id,
    'units', lm.units,
    'balanceBefore', lm.balance_before,
    'balanceAfter', lm.balance_after,
    'occurredAt', lm.occurred_at,
    'migration', '0057_package_ledger'
  ),
  lm.created_at
FROM "lesson_movements" lm
WHERE lm.operation_id LIKE 'migration:0057:%'
  AND NOT EXISTS (
    SELECT 1 FROM "audit_logs" al
    WHERE al.resource_type = 'lesson_movement' AND al.resource_id = lm.id::text
  );
--> statement-breakpoint
CREATE TABLE "lesson_reconciliation_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "issue_type" varchar(80) NOT NULL,
  "student_id" uuid,
  "course_contract_id" uuid,
  "attendance_record_id" uuid,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolution_note" text,
  CONSTRAINT "lesson_reconciliation_issues_status_check"
    CHECK ("status" IN ('open', 'resolved', 'ignored'))
);
--> statement-breakpoint
CREATE INDEX "lesson_reconciliation_issues_status_idx"
ON "lesson_reconciliation_issues" ("status", "detected_at");
--> statement-breakpoint
INSERT INTO "lesson_reconciliation_issues" (
  "issue_type", "student_id", "attendance_record_id", "details"
)
SELECT
  'deducted_attendance_without_package',
  ar.student_id,
  ar.id,
  jsonb_build_object('classSessionId', ar.class_session_id, 'lessonDelta', ar.lesson_delta)
FROM "attendance_records" ar
WHERE ar.lesson_delta < 0 AND ar.course_contract_id IS NULL;
--> statement-breakpoint
INSERT INTO "lesson_reconciliation_issues" (
  "issue_type", "student_id", "course_contract_id", "attendance_record_id", "details"
)
SELECT
  'attendance_package_student_mismatch',
  ar.student_id,
  ar.course_contract_id,
  ar.id,
  jsonb_build_object('packageStudentId', cc.student_id, 'classSessionId', ar.class_session_id)
FROM "attendance_records" ar
INNER JOIN "course_contracts" cc ON cc.id = ar.course_contract_id
WHERE ar.student_id <> cc.student_id;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_lesson_movement_ownership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT student_id INTO owner_id
  FROM course_contracts
  WHERE id = NEW.course_contract_id;
  IF owner_id IS NULL OR owner_id <> NEW.student_id THEN
    RAISE EXCEPTION 'lesson movement student does not own course contract';
  END IF;

  IF NEW.attendance_record_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM attendance_records ar
    WHERE ar.id = NEW.attendance_record_id
      AND ar.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'lesson movement attendance student mismatch';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "lesson_movements_ownership_trigger"
BEFORE INSERT ON "lesson_movements"
FOR EACH ROW EXECUTE FUNCTION enforce_lesson_movement_ownership();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_lesson_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lesson movements are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "lesson_movements_immutable_trigger"
BEFORE UPDATE OR DELETE ON "lesson_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_lesson_movement_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reconcile_course_contract_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_contract_id uuid;
  stored_balance integer;
  ledger_balance integer;
BEGIN
  IF TG_TABLE_NAME = 'lesson_movements' THEN
    target_contract_id := NEW.course_contract_id;
  ELSE
    target_contract_id := NEW.id;
  END IF;
  SELECT remaining_lesson_count INTO stored_balance
  FROM course_contracts WHERE id = target_contract_id;
  IF stored_balance IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(units), 0) INTO ledger_balance
  FROM lesson_movements WHERE course_contract_id = target_contract_id;
  IF stored_balance <> ledger_balance THEN
    RAISE EXCEPTION 'course contract % balance % does not match ledger %',
      target_contract_id, stored_balance, ledger_balance;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "course_contract_balance_reconcile_trigger"
AFTER INSERT OR UPDATE OF remaining_lesson_count ON "course_contracts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_course_contract_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "lesson_movement_balance_reconcile_trigger"
AFTER INSERT ON "lesson_movements"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reconcile_course_contract_balance();
--> statement-breakpoint
COMMENT ON TABLE "lesson_accounts" IS
'Legacy read-only evidence after package ledger migration. Application code must not read or write this table.';
--> statement-breakpoint
COMMENT ON TABLE "lesson_transactions" IS
'Legacy read-only evidence after package ledger migration. New movements are written to lesson_movements.';
