ALTER TYPE "public"."lead_status" ADD VALUE 'course_delivery' BEFORE 'invalid';--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "title" varchar(120);--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "avatar_url" varchar(500);--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "bio" text DEFAULT '' NOT NULL;