CREATE TYPE "public"."attendance_status" AS ENUM('present', 'leave', 'absent', 'makeup', 'trial');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."class_session_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('recruiting', 'active', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'trial_booked', 'trial_attended', 'paid', 'follow_up', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."lesson_transaction_type" AS ENUM('purchase', 'consume', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'advisor', 'academic', 'teacher', 'finance');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."trial_session_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"lesson_delta" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"action" varchar(160) NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"resource_id" varchar(120),
	"outcome" "audit_outcome" DEFAULT 'succeeded' NOT NULL,
	"summary" varchar(255),
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"topic" varchar(200) NOT NULL,
	"status" "class_session_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campus_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"capacity" integer DEFAULT 8 NOT NULL,
	"status" "class_status" DEFAULT 'recruiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campus_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"capacity" integer DEFAULT 8 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campus_id" uuid,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"category" varchar(80) NOT NULL,
	"age_range" varchar(120) NOT NULL,
	"lesson_count" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"price_amount" integer DEFAULT 0 NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"content" text NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campus_id" uuid,
	"course_id" uuid,
	"trial_session_id" uuid,
	"guardian_name" varchar(120) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"student_name" varchar(120) NOT NULL,
	"grade" varchar(80) NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" varchar(80) DEFAULT 'unknown' NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"converted_student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lesson_account_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"type" "lesson_transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"related_entity_type" varchar(80),
	"related_entity_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"lesson_count" integer DEFAULT 0 NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relation" varchar(40) DEFAULT 'guardian' NOT NULL,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guardian_id" uuid,
	"name" varchar(120) NOT NULL,
	"grade" varchar(80) NOT NULL,
	"school" varchar(160),
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(40),
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"brand_name" varchar(160) NOT NULL,
	"phone" varchar(40),
	"address" varchar(255),
	"status" "tenant_status" DEFAULT 'trialing' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "trial_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campus_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer DEFAULT 8 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"status" "trial_session_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"password_hash" varchar(255),
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_records" ADD CONSTRAINT "follow_up_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_records" ADD CONSTRAINT "follow_up_records_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_trial_session_id_trial_sessions_id_fk" FOREIGN KEY ("trial_session_id") REFERENCES "public"."trial_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_student_id_students_id_fk" FOREIGN KEY ("converted_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_accounts" ADD CONSTRAINT "lesson_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_accounts" ADD CONSTRAINT "lesson_accounts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_accounts" ADD CONSTRAINT "lesson_accounts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_transactions" ADD CONSTRAINT "lesson_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_transactions" ADD CONSTRAINT "lesson_transactions_lesson_account_id_lesson_accounts_id_fk" FOREIGN KEY ("lesson_account_id") REFERENCES "public"."lesson_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_transactions" ADD CONSTRAINT "lesson_transactions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_student_idx" ON "attendance_records" USING btree ("class_session_id","student_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_action_idx" ON "audit_logs" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX "campuses_tenant_idx" ON "campuses" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_tenant_code_idx" ON "channels" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "class_enrollments_class_student_idx" ON "class_enrollments" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "class_sessions_classroom_time_idx" ON "class_sessions" USING btree ("tenant_id","classroom_id","starts_at");--> statement-breakpoint
CREATE INDEX "class_sessions_teacher_time_idx" ON "class_sessions" USING btree ("tenant_id","teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX "classes_tenant_status_idx" ON "classes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "classrooms_tenant_campus_idx" ON "classrooms" USING btree ("tenant_id","campus_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_tenant_slug_idx" ON "courses" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "courses_tenant_status_idx" ON "courses" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "follow_up_records_lead_created_idx" ON "follow_up_records" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "guardians_tenant_phone_idx" ON "guardians" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "leads_tenant_status_idx" ON "leads" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "leads_tenant_source_idx" ON "leads" USING btree ("tenant_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_accounts_student_course_idx" ON "lesson_accounts" USING btree ("student_id","course_id");--> statement-breakpoint
CREATE INDEX "lesson_transactions_account_created_idx" ON "lesson_transactions" USING btree ("lesson_account_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_idx" ON "orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "students_tenant_status_idx" ON "students" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "teachers_tenant_idx" ON "teachers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_memberships_tenant_user_idx" ON "tenant_memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "trial_sessions_tenant_starts_idx" ON "trial_sessions" USING btree ("tenant_id","starts_at");