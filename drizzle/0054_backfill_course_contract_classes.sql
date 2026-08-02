WITH ranked_enrollments AS (
  SELECT
    cc.id AS course_contract_id,
    ce.class_id,
    ROW_NUMBER() OVER (
      PARTITION BY cc.id
      ORDER BY ce.joined_at DESC, ce.created_at DESC, ce.id DESC
    ) AS position
  FROM course_contracts cc
  INNER JOIN class_enrollments ce
    ON ce.student_id = cc.student_id
    AND ce.billing_course_id = cc.course_id
    AND ce.active = true
  INNER JOIN classes c
    ON c.id = ce.class_id
    AND c.course_id = cc.course_id
  WHERE cc.status = 'active'
    AND cc.class_id IS NULL
)
UPDATE course_contracts cc
SET
  class_id = ranked.class_id,
  updated_at = now()
FROM ranked_enrollments ranked
WHERE cc.id = ranked.course_contract_id
  AND ranked.position = 1;
