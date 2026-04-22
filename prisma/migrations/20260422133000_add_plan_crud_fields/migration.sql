-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "name" TEXT;
ALTER TABLE "Plan" ADD COLUMN     "description" TEXT;
ALTER TABLE "Plan" ADD COLUMN     "price" DOUBLE PRECISION;
ALTER TABLE "Plan" ADD COLUMN     "features" TEXT[];
ALTER TABLE "Plan" ALTER COLUMN "stripePlanId" DROP NOT NULL;

-- Backfill existing rows
UPDATE "Plan"
SET
  "name" = COALESCE("name", COALESCE("stripePlanId", 'Legacy plan')),
  "description" = COALESCE("description", 'Legacy plan'),
  "price" = COALESCE("price", 0),
  "features" = COALESCE("features", ARRAY[]::TEXT[])
WHERE
  "name" IS NULL
  OR "description" IS NULL
  OR "price" IS NULL
  OR "features" IS NULL;

-- Set defaults and constraints
ALTER TABLE "Plan" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Plan" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "Plan" ALTER COLUMN "price" SET NOT NULL;
ALTER TABLE "Plan" ALTER COLUMN "features" SET NOT NULL;
ALTER TABLE "Plan" ALTER COLUMN "features" SET DEFAULT ARRAY[]::TEXT[];
