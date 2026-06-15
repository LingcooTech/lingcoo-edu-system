CREATE TYPE "public"."course_series_status" AS ENUM('active', 'archived');
--> statement-breakpoint
CREATE TABLE "course_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(120) NOT NULL,
  "name" varchar(160) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "status" "course_series_status" DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "course_series_id" uuid;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "course_series_id" uuid;
--> statement-breakpoint
ALTER TABLE "course_packages" ADD COLUMN "course_series_id" uuid;
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_course_series_id_course_series_id_fk" FOREIGN KEY ("course_series_id") REFERENCES "public"."course_series"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_course_series_id_course_series_id_fk" FOREIGN KEY ("course_series_id") REFERENCES "public"."course_series"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "course_packages" ADD CONSTRAINT "course_packages_course_series_id_course_series_id_fk" FOREIGN KEY ("course_series_id") REFERENCES "public"."course_series"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "course_series_slug_idx" ON "course_series" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "course_series_status_idx" ON "course_series" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "orders_course_series_idx" ON "orders" USING btree ("course_series_id");
--> statement-breakpoint
CREATE INDEX "course_packages_course_idx" ON "course_packages" USING btree ("course_id");
--> statement-breakpoint
CREATE INDEX "course_packages_course_series_idx" ON "course_packages" USING btree ("course_series_id");
