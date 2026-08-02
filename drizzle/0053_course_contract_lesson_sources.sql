ALTER TABLE "course_contracts"
ADD COLUMN "remaining_lesson_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_records"
ADD COLUMN "course_contract_id" uuid REFERENCES "course_contracts"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "lesson_transactions"
ADD COLUMN "course_contract_id" uuid REFERENCES "course_contracts"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "attendance_records_course_contract_idx"
ON "attendance_records" ("course_contract_id");
--> statement-breakpoint
CREATE INDEX "lesson_transactions_course_contract_idx"
ON "lesson_transactions" ("course_contract_id");
--> statement-breakpoint
WITH ranked_contracts AS (
  SELECT
    cc.id,
    cc.lesson_count,
    GREATEST(COALESCE(la.balance, 0), 0) AS account_balance,
    COALESCE(
      SUM(cc.lesson_count) OVER (
        PARTITION BY cc.student_id, cc.course_id
        ORDER BY
          CASE WHEN cp.billing_type = 'period' THEN 1 ELSE 0 END,
          cc.created_at DESC,
          cc.id DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS allocated_before
  FROM course_contracts cc
  LEFT JOIN course_packages cp ON cp.id = cc.package_id
  LEFT JOIN lesson_accounts la
    ON la.student_id = cc.student_id AND la.course_id = cc.course_id
  WHERE cc.status = 'active'
    AND (
      COALESCE(cp.billing_type, 'lesson') <> 'period'
      OR cc.ends_at IS NULL
      OR cc.ends_at >= now()
    )
)
UPDATE course_contracts cc
SET remaining_lesson_count = GREATEST(
  LEAST(rc.lesson_count, rc.account_balance - rc.allocated_before),
  0
)
FROM ranked_contracts rc
WHERE cc.id = rc.id;
