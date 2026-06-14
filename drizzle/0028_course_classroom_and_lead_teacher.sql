ALTER TABLE "courses" ADD COLUMN "classroom_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "courses"
SET "classroom_ids" = jsonb_build_array("classroom_id")
WHERE "classroom_id" IS NOT NULL
  AND "classroom_ids" = '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "preferred_teacher_id" uuid;
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_preferred_teacher_id_teachers_id_fk" FOREIGN KEY ("preferred_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
