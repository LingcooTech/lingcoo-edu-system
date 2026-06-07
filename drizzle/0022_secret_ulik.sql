ALTER TABLE "homework_checkins" ADD COLUMN "review_status" varchar(40) DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD COLUMN "teacher_feedback" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD COLUMN "reviewed_by_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD CONSTRAINT "homework_checkins_reviewed_by_teacher_id_teachers_id_fk" FOREIGN KEY ("reviewed_by_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;