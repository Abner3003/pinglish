CREATE TYPE "JobRunStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "scheduledFor" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduledJobRun_jobName_scheduledFor_key" ON "ScheduledJobRun"("jobName", "scheduledFor");
CREATE INDEX "ScheduledJobRun_status_idx" ON "ScheduledJobRun"("status");
