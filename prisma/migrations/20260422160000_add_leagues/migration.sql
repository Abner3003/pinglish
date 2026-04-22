-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "LeagueRank" AS ENUM ('D', 'C', 'B', 'A', 'S', 'SS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "League" (
    "id" TEXT NOT NULL,
    "rank" "LeagueRank" NOT NULL,
    "xpTotalMin" INTEGER NOT NULL,
    "xpTotalMax" INTEGER,
    "xpInRank" INTEGER,
    "equivalentActionsApprox" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "League_rank_key" ON "League"("rank");

-- Ensure existing partially applied table matches the nullable schema
ALTER TABLE IF EXISTS "League"
ALTER COLUMN "xpInRank" DROP NOT NULL;

-- Seed default leagues
INSERT INTO "League" ("id", "rank", "xpTotalMin", "xpTotalMax", "xpInRank", "equivalentActionsApprox", "createdAt", "updatedAt")
VALUES
  ('11111111-1111-1111-1111-111111111111', 'D', 0, 200, 200, 10, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'C', 200, 600, 400, 20, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', 'B', 600, 1200, 600, 30, NOW(), NOW()),
  ('44444444-4444-4444-4444-444444444444', 'A', 1200, 2200, 1000, 50, NOW(), NOW()),
  ('55555555-5555-5555-5555-555555555555', 'S', 2200, 4000, 1800, 90, NOW(), NOW()),
  ('66666666-6666-6666-6666-666666666666', 'SS', 4000, NULL, NULL, NULL, NOW(), NOW())
ON CONFLICT ("rank") DO UPDATE SET
  "xpTotalMin" = EXCLUDED."xpTotalMin",
  "xpTotalMax" = EXCLUDED."xpTotalMax",
  "xpInRank" = EXCLUDED."xpInRank",
  "equivalentActionsApprox" = EXCLUDED."equivalentActionsApprox",
  "updatedAt" = NOW();
