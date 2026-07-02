ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "cover_thumb_url" varchar(500);
ALTER TABLE "trial_sessions" ADD COLUMN IF NOT EXISTS "cover_thumb_url" varchar(500);
ALTER TABLE "content_items" ADD COLUMN IF NOT EXISTS "cover_thumb_url" varchar(500);
