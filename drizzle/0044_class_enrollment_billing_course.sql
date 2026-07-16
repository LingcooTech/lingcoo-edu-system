ALTER TABLE "class_enrollments" ADD COLUMN IF NOT EXISTS "billing_course_id" uuid;
--> statement-breakpoint
UPDATE "class_enrollments" AS ce
SET "billing_course_id" = c."course_id"
FROM "classes" AS c
WHERE ce."class_id" = c."id"
  AND ce."billing_course_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "class_enrollments" ALTER COLUMN "billing_course_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_enrollments"
    ADD CONSTRAINT "class_enrollments_billing_course_id_courses_id_fk"
    FOREIGN KEY ("billing_course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_enrollments_billing_course_idx" ON "class_enrollments" USING btree ("billing_course_id");
