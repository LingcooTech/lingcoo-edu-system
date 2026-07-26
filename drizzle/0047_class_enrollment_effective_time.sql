ALTER TABLE "class_enrollments"
  ADD COLUMN IF NOT EXISTS "joined_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "class_enrollments"
SET "joined_at" = "created_at"
WHERE "joined_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "class_enrollments"
  ALTER COLUMN "joined_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "class_enrollments"
  ALTER COLUMN "joined_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "class_enrollments"
  ADD COLUMN IF NOT EXISTS "left_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "class_enrollments"
SET "left_at" = "created_at"
WHERE "active" = false
  AND "left_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_enrollments_joined_at_idx"
  ON "class_enrollments" USING btree ("class_id","joined_at");
--> statement-breakpoint
INSERT INTO "class_session_students" (
  "class_session_id",
  "student_id",
  "billing_course_id",
  "source",
  "active"
)
SELECT
  session."id",
  enrollment."student_id",
  enrollment."billing_course_id",
  'enrollment',
  true
FROM "class_sessions" AS session
INNER JOIN "class_enrollments" AS enrollment
  ON enrollment."class_id" = session."class_id"
 AND enrollment."joined_at" <= session."starts_at"
 AND (enrollment."left_at" IS NULL OR enrollment."left_at" > session."starts_at")
WHERE NOT EXISTS (
  SELECT 1
  FROM "class_session_students" AS roster
  WHERE roster."class_session_id" = session."id"
)
ON CONFLICT ("class_session_id", "student_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "class_session_students" (
  "class_session_id",
  "student_id",
  "billing_course_id",
  "source",
  "active"
)
SELECT
  temporary."class_session_id",
  temporary."student_id",
  temporary."billing_course_id",
  'session_only',
  true
FROM "class_session_temporary_students" AS temporary
ON CONFLICT ("class_session_id", "student_id") DO NOTHING;
--> statement-breakpoint
UPDATE "class_session_students" AS roster
SET
  "active" = false,
  "updated_at" = now()
FROM "class_sessions" AS session
, "class_enrollments" AS enrollment
WHERE roster."class_session_id" = session."id"
  AND enrollment."class_id" = session."class_id"
  AND enrollment."student_id" = roster."student_id"
  AND roster."source" = 'enrollment'
  AND (
    enrollment."joined_at" > session."starts_at"
    OR (enrollment."left_at" IS NOT NULL AND enrollment."left_at" <= session."starts_at")
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "attendance_records" AS attendance
    WHERE attendance."class_session_id" = roster."class_session_id"
      AND attendance."student_id" = roster."student_id"
  );
