-- Courses are catalog/product records only. Sellable lesson counts and prices
-- live exclusively on course_packages and are copied to orders at purchase time.
ALTER TABLE "courses" DROP COLUMN IF EXISTS "lesson_count";
ALTER TABLE "courses" DROP COLUMN IF EXISTS "price_amount";
