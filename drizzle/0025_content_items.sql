DO $$ BEGIN
  CREATE TYPE "content_source" AS ENUM ('manual', 'wordpress', 'notion', 'wechat');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "content_status" AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "content_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(160) NOT NULL,
  "title" varchar(200) NOT NULL,
  "excerpt" text,
  "content" text DEFAULT '' NOT NULL,
  "cover_url" varchar(500),
  "author_name" varchar(120),
  "source_type" "content_source" DEFAULT 'manual' NOT NULL,
  "source_id" varchar(255),
  "source_url" varchar(2048),
  "status" "content_status" DEFAULT 'draft' NOT NULL,
  "published_at" timestamp with time zone,
  "imported_at" timestamp with time zone,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "content_items_source_type_source_id_idx" ON "content_items" USING btree ("source_type","source_id");
--> statement-breakpoint
CREATE INDEX "content_items_status_published_at_idx" ON "content_items" USING btree ("status","published_at");
--> statement-breakpoint
CREATE INDEX "content_items_source_url_idx" ON "content_items" USING btree ("source_url");
