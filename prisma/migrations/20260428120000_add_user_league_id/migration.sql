ALTER TABLE "User" ADD COLUMN "leagueId" TEXT;
CREATE INDEX "User_leagueId_idx" ON "User"("leagueId");

ALTER TABLE "User"
ADD CONSTRAINT "User_leagueId_fkey"
FOREIGN KEY ("leagueId") REFERENCES "League"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
