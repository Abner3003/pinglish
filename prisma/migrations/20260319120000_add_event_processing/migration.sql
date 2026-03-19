-- CreateEnum
CREATE TYPE "EventProcessingStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "EventProcessing" (
    "id" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT,
    "status" "EventProcessingStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventProcessing_status_idx" ON "EventProcessing"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventProcessing_consumer_eventId_key" ON "EventProcessing"("consumer", "eventId");
