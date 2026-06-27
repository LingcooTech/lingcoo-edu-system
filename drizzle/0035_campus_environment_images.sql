ALTER TABLE "campuses" ADD COLUMN IF NOT EXISTS "environment_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;
