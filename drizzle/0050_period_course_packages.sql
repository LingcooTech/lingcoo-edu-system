ALTER TABLE "course_packages"
ADD COLUMN "billing_type" varchar(20) DEFAULT 'lesson' NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_packages"
ADD COLUMN "period_unit" varchar(20);
--> statement-breakpoint
ALTER TABLE "course_packages"
ADD COLUMN "period_count" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_packages"
ADD CONSTRAINT "course_packages_billing_type_check"
CHECK ("billing_type" IN ('lesson', 'period'));
--> statement-breakpoint
ALTER TABLE "course_packages"
ADD CONSTRAINT "course_packages_period_unit_check"
CHECK (
  ("billing_type" = 'lesson' AND "period_unit" IS NULL)
  OR
  ("billing_type" = 'period' AND "period_unit" IN ('week', 'month'))
);
--> statement-breakpoint
ALTER TABLE "course_packages"
ADD CONSTRAINT "course_packages_period_count_check"
CHECK ("period_count" > 0);
