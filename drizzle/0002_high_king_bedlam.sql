CREATE TYPE "public"."course_package_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."parent_security_purpose" AS ENUM('email_verify', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."parent_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "course_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lesson_count" integer NOT NULL,
	"price_amount" integer NOT NULL,
	"status" "course_package_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_security_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"purpose" "parent_security_purpose" NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(40),
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"guardian_id" uuid,
	"status" "parent_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_order_id" varchar(120),
	"provider_event_id" varchar(160) NOT NULL,
	"amount" integer NOT NULL,
	"status" varchar(40) NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" varchar(8) DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_provider" varchar(40);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_order_id" varchar(120);--> statement-breakpoint
ALTER TABLE "course_packages" ADD CONSTRAINT "course_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_packages" ADD CONSTRAINT "course_packages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_security_codes" ADD CONSTRAINT "parent_security_codes_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_packages_tenant_status_idx" ON "course_packages" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "parent_security_codes_parent_purpose_idx" ON "parent_security_codes" USING btree ("parent_id","purpose","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "parents_tenant_email_idx" ON "parents" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "payments_order_no_idx" ON "payments" USING btree ("order_no");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_course_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."course_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_parent_idx" ON "orders" USING btree ("parent_id");