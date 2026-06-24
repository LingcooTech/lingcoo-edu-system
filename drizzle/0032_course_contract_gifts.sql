CREATE TABLE "course_contract_gifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_contract_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  "class_id" uuid,
  "title" varchar(200) NOT NULL,
  "lesson_count" integer NOT NULL,
  "reason" varchar(80) DEFAULT 'other' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "status" "course_contract_status" DEFAULT 'active' NOT NULL,
  "note" text,
  "created_by_account_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_contract_gifts" ADD CONSTRAINT "course_contract_gifts_course_contract_id_course_contracts_id_fk" FOREIGN KEY ("course_contract_id") REFERENCES "public"."course_contracts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_contract_gifts" ADD CONSTRAINT "course_contract_gifts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_contract_gifts" ADD CONSTRAINT "course_contract_gifts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_contract_gifts" ADD CONSTRAINT "course_contract_gifts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_contract_gifts" ADD CONSTRAINT "course_contract_gifts_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "course_contract_gifts_contract_idx" ON "course_contract_gifts" USING btree ("course_contract_id");
--> statement-breakpoint
CREATE INDEX "course_contract_gifts_student_course_idx" ON "course_contract_gifts" USING btree ("student_id","course_id");
--> statement-breakpoint
CREATE INDEX "course_contract_gifts_class_idx" ON "course_contract_gifts" USING btree ("class_id");
--> statement-breakpoint
CREATE INDEX "course_contract_gifts_status_idx" ON "course_contract_gifts" USING btree ("status");
