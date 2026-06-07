CREATE TYPE "public"."course_contract_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "course_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"class_id" uuid,
	"package_id" uuid,
	"order_id" uuid,
	"contract_no" varchar(64) NOT NULL,
	"title" varchar(200) NOT NULL,
	"lesson_count" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"payment_method" varchar(40),
	"payment_receiver_type" "payment_receiver_type" DEFAULT 'platform' NOT NULL,
	"payment_receiver_institution_id" uuid,
	"payment_receiver_name" varchar(160),
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "course_contract_status" DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_contracts_contract_no_idx" UNIQUE("contract_no")
);
--> statement-breakpoint
CREATE TABLE "course_contract_payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_contract_id" uuid NOT NULL,
	"order_id" uuid,
	"paid_amount" integer NOT NULL,
	"payment_method" varchar(40),
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_package_id_course_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."course_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_payment_receiver_institution_id_institutions_id_fk" FOREIGN KEY ("payment_receiver_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contracts" ADD CONSTRAINT "course_contracts_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contract_payment_records" ADD CONSTRAINT "course_contract_payment_records_course_contract_id_course_contracts_id_fk" FOREIGN KEY ("course_contract_id") REFERENCES "public"."course_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contract_payment_records" ADD CONSTRAINT "course_contract_payment_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_contract_payment_records" ADD CONSTRAINT "course_contract_payment_records_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_contracts_student_idx" ON "course_contracts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "course_contracts_course_idx" ON "course_contracts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_contracts_class_idx" ON "course_contracts" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "course_contracts_order_idx" ON "course_contracts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "course_contracts_status_idx" ON "course_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_contract_payment_records_contract_idx" ON "course_contract_payment_records" USING btree ("course_contract_id");--> statement-breakpoint
CREATE INDEX "course_contract_payment_records_order_idx" ON "course_contract_payment_records" USING btree ("order_id");
