ALTER TABLE "teachers" ADD COLUMN "teaching_years" varchar(40);--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "student_count" varchar(40);--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "retention_rate" varchar(40);--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "teaching_philosophy" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "class_photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "student_work_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "parent_testimonials" jsonb DEFAULT '[]'::jsonb NOT NULL;