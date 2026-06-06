CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"logo_url" varchar(500),
	"intro" text DEFAULT '' NOT NULL,
	"contact" varchar(200),
	"status" "teaching_resource_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "tagline" varchar(200);--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "wechat_qr_url" varchar(500);--> statement-breakpoint
CREATE INDEX "institutions_status_idx" ON "institutions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teachers_institution_idx" ON "teachers" USING btree ("institution_id");