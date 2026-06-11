ALTER TABLE "institutions" ADD COLUMN "qualification_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "outcome_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
