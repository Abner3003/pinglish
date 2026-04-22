-- CreateEnum
CREATE TYPE "UserJourneyLevel" AS ENUM ('INICIANTE', 'PRE_INTERMEDIARIO', 'INTERMEDIARIO', 'AVANCADO', 'PROFICIENTE');

-- CreateTable
CREATE TABLE "UserJourney" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "UserJourneyLevel" NOT NULL,
    "leagueId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJourney_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserJourney_userId_key" ON "UserJourney"("userId");

-- CreateIndex
CREATE INDEX "UserJourney_leagueId_idx" ON "UserJourney"("leagueId");

-- AddForeignKey
ALTER TABLE "UserJourney" ADD CONSTRAINT "UserJourney_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJourney" ADD CONSTRAINT "UserJourney_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
