CREATE TYPE "public"."teaching_resource_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TYPE "public"."class_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TABLE "classrooms" ADD COLUMN "status" "teaching_resource_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "status" "teaching_resource_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX "classrooms_tenant_status_idx" ON "classrooms" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "teachers_tenant_status_idx" ON "teachers" USING btree ("tenant_id","status");