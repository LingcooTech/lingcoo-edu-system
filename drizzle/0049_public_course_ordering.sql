ALTER TABLE "courses"
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "teachers"
  ADD COLUMN IF NOT EXISTS "is_trial_consultant" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
WITH ranked_institutions AS (
  SELECT
    "id",
    ((ROW_NUMBER() OVER (
      ORDER BY "sort_order" ASC, "created_at" ASC, "id" ASC
    ) - 1) * 10)::integer AS "next_sort_order"
  FROM "institutions"
)
UPDATE "institutions"
SET "sort_order" = ranked_institutions."next_sort_order"
FROM ranked_institutions
WHERE "institutions"."id" = ranked_institutions."id";
--> statement-breakpoint
WITH ranked_courses AS (
  SELECT
    "id",
    ((ROW_NUMBER() OVER (
      PARTITION BY "provider_institution_id"
      ORDER BY "created_at" ASC, "id" ASC
    ) - 1) * 10)::integer AS "next_sort_order"
  FROM "courses"
)
UPDATE "courses"
SET "sort_order" = ranked_courses."next_sort_order"
FROM ranked_courses
WHERE "courses"."id" = ranked_courses."id";
--> statement-breakpoint
UPDATE "teachers"
SET "is_trial_consultant" = true
WHERE "id" = (
  SELECT "id"
  FROM "teachers"
  WHERE
    "status" = 'active'
    AND (
      NULLIF(BTRIM(COALESCE("phone", '')), '') IS NOT NULL
      OR NULLIF(BTRIM(COALESCE("wechat_qr_url", '')), '') IS NOT NULL
    )
  ORDER BY "is_pinned" DESC, "created_at" ASC
  LIMIT 1
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_provider_sort_idx"
  ON "courses" USING btree ("provider_institution_id", "sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_trial_consultant_unique_idx"
  ON "teachers" USING btree ("is_trial_consultant")
  WHERE "is_trial_consultant" = true;
