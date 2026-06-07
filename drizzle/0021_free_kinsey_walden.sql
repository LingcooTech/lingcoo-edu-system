CREATE TABLE "homework_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"student_id" uuid NOT NULL,
	"course_id" uuid,
	"class_session_id" uuid,
	"title" varchar(160) DEFAULT '作业打卡' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD CONSTRAINT "homework_checkins_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD CONSTRAINT "homework_checkins_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD CONSTRAINT "homework_checkins_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "homework_checkins" ADD CONSTRAINT "homework_checkins_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "homework_checkins_student_idx" ON "homework_checkins" USING btree ("student_id","created_at");
--> statement-breakpoint
CREATE INDEX "homework_checkins_course_idx" ON "homework_checkins" USING btree ("course_id","created_at");
--> statement-breakpoint
CREATE INDEX "homework_checkins_session_idx" ON "homework_checkins" USING btree ("class_session_id");
