ALTER TABLE "courses" ADD COLUMN "default_teacher_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "courses"
SET "default_teacher_ids" = jsonb_build_array("default_teacher_id")
WHERE "default_teacher_id" IS NOT NULL
  AND "default_teacher_ids" = '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "classroom_id" uuid;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_packages" ADD COLUMN "gifted_lesson_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_packages" ADD COLUMN "discount_price_amount" integer;
