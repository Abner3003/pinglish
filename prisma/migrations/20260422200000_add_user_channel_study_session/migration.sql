ALTER TABLE "UserChannel" ADD COLUMN "awaitingStudyReply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserChannel" ADD COLUMN "currentPackId" TEXT;
ALTER TABLE "UserChannel" ADD COLUMN "currentStudyItemId" TEXT;
ALTER TABLE "UserChannel" ADD COLUMN "lastInboundAt" TIMESTAMP(3);
ALTER TABLE "UserChannel" ADD COLUMN "lastOutboundAt" TIMESTAMP(3);
