CREATE TABLE "class_course_associations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE RESTRICT,
  "source" varchar(40) DEFAULT 'enrollment' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "class_course_associations_class_course_idx"
ON "class_course_associations" ("class_id", "course_id");
--> statement-breakpoint
CREATE INDEX "class_course_associations_class_idx"
ON "class_course_associations" ("class_id");
--> statement-breakpoint
CREATE INDEX "class_course_associations_course_idx"
ON "class_course_associations" ("course_id");
--> statement-breakpoint
INSERT INTO "class_course_associations" ("class_id", "course_id", "source", "is_primary")
SELECT id, course_id, 'primary', true
FROM classes
ON CONFLICT ("class_id", "course_id") DO UPDATE
SET "is_primary" = true, "source" = 'primary', "updated_at" = now();
--> statement-breakpoint
INSERT INTO "class_course_associations" ("class_id", "course_id", "source", "is_primary")
SELECT DISTINCT class_id, billing_course_id, 'enrollment', false
FROM class_enrollments
WHERE active = true
ON CONFLICT ("class_id", "course_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "class_course_associations" ("class_id", "course_id", "source", "is_primary")
SELECT DISTINCT class_id, course_id, 'session', false
FROM class_sessions
WHERE class_id IS NOT NULL
ON CONFLICT ("class_id", "course_id") DO NOTHING;
--> statement-breakpoint
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
  WHERE cc.status = 'active'
    AND cc.class_id IS NULL
)
UPDATE course_contracts cc
SET class_id = ranked.class_id, updated_at = now()
FROM ranked_enrollments ranked
WHERE cc.id = ranked.course_contract_id
  AND ranked.position = 1;
