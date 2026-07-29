DROP INDEX IF EXISTS "teachers_trial_consultant_unique_idx";

CREATE UNIQUE INDEX "teachers_trial_consultant_unique_idx"
  ON "teachers" ("institution_id")
  WHERE "is_trial_consultant" = true AND "institution_id" IS NOT NULL;
