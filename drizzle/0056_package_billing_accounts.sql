ALTER TABLE "class_enrollments"
ADD COLUMN "billing_course_contract_id" uuid REFERENCES "course_contracts"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "class_session_students"
ADD COLUMN "billing_course_contract_id" uuid REFERENCES "course_contracts"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "class_session_temporary_students"
ADD COLUMN "billing_course_contract_id" uuid REFERENCES "course_contracts"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX "class_enrollments_billing_contract_idx"
ON "class_enrollments" ("billing_course_contract_id");
--> statement-breakpoint
CREATE INDEX "class_session_students_billing_contract_idx"
ON "class_session_students" ("billing_course_contract_id");
--> statement-breakpoint
CREATE INDEX "class_session_temporary_students_billing_contract_idx"
ON "class_session_temporary_students" ("billing_course_contract_id");
--> statement-breakpoint
WITH ranked_contracts AS (
  SELECT
    ce.id AS enrollment_id,
    cc.id AS course_contract_id,
    ROW_NUMBER() OVER (
      PARTITION BY ce.id
      ORDER BY
        CASE WHEN cc.status = 'active' AND cc.remaining_lesson_count > 0 THEN 0 ELSE 1 END,
        CASE WHEN cp.billing_type = 'period' THEN 0 ELSE 1 END,
        cc.ends_at ASC NULLS LAST,
        cc.created_at ASC,
        cc.id ASC
    ) AS position
  FROM class_enrollments ce
  INNER JOIN course_contracts cc
    ON cc.student_id = ce.student_id
    AND cc.course_id = ce.billing_course_id
    AND cc.status <> 'cancelled'
    AND (cc.class_id = ce.class_id OR cc.class_id IS NULL)
  LEFT JOIN course_packages cp ON cp.id = cc.package_id
)
UPDATE class_enrollments ce
SET billing_course_contract_id = ranked.course_contract_id
FROM ranked_contracts ranked
WHERE ce.id = ranked.enrollment_id
  AND ranked.position = 1;
--> statement-breakpoint
UPDATE class_session_students css
SET billing_course_contract_id = ce.billing_course_contract_id
FROM class_sessions cs, class_enrollments ce
WHERE css.class_session_id = cs.id
  AND cs.class_id = ce.class_id
  AND css.student_id = ce.student_id
  AND css.billing_course_id = ce.billing_course_id
  AND css.source = 'enrollment'
  AND ce.billing_course_contract_id IS NOT NULL;
