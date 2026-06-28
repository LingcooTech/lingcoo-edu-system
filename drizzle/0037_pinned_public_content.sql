ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "is_pinned" boolean NOT NULL DEFAULT false;
ALTER TABLE "content_items" ADD COLUMN IF NOT EXISTS "is_pinned" boolean NOT NULL DEFAULT false;
