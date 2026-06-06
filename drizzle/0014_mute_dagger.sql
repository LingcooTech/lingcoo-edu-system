ALTER TABLE "institutions" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "institutions_sort_idx" ON "institutions" USING btree ("sort_order");