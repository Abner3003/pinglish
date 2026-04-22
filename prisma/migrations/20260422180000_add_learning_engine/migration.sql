-- CreateEnum
CREATE TYPE "LearningGoal" AS ENUM ('TRAVEL', 'WORK', 'CONVERSATION', 'SCHOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "LearningItemType" AS ENUM ('LEXICAL_CHUNK', 'PATTERN', 'EXAMPLE', 'MICRO_LESSON');

-- CreateEnum
CREATE TYPE "UserLearningStateStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'MASTERED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StudyEventType" AS ENUM ('ANSWERED', 'REVIEWED', 'SKIPPED', 'LESSON_COMPLETED');

-- CreateTable
CREATE TABLE "LearningProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "nativeLanguage" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "goal" "LearningGoal" NOT NULL,
    "interests" TEXT[] NOT NULL,
    "profession" TEXT,
    "preferredStudyTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "LearningItemType" NOT NULL,
    "text" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "tags" TEXT[] NOT NULL,
    "prerequisiteItemIds" TEXT[] NOT NULL,
    "relatedItemIds" TEXT[] NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLearningState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "UserLearningStateStatus" NOT NULL DEFAULT 'NEW',
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitionCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "consecutiveWrong" INTEGER NOT NULL DEFAULT 0,
    "masteryScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLearningState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStudyPack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,
    "targetXp" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStudyPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "packId" TEXT,
    "eventType" "StudyEventType" NOT NULL,
    "answerQuality" INTEGER,
    "isCorrect" BOOLEAN,
    "xpEarned" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearningProfile_userId_key" ON "LearningProfile"("userId");

-- CreateIndex
CREATE INDEX "LearningItem_tenantId_idx" ON "LearningItem"("tenantId");

-- CreateIndex
CREATE INDEX "LearningItem_type_idx" ON "LearningItem"("type");

-- CreateIndex
CREATE UNIQUE INDEX "UserLearningState_userId_itemId_key" ON "UserLearningState"("userId", "itemId");

-- CreateIndex
CREATE INDEX "UserLearningState_userId_idx" ON "UserLearningState"("userId");

-- CreateIndex
CREATE INDEX "UserLearningState_itemId_idx" ON "UserLearningState"("itemId");

-- CreateIndex
CREATE INDEX "UserLearningState_nextReviewAt_idx" ON "UserLearningState"("nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStudyPack_userId_date_key" ON "DailyStudyPack"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyStudyPack_userId_date_idx" ON "DailyStudyPack"("userId", "date");

-- CreateIndex
CREATE INDEX "StudyEvent_userId_idx" ON "StudyEvent"("userId");

-- CreateIndex
CREATE INDEX "StudyEvent_itemId_idx" ON "StudyEvent"("itemId");

-- CreateIndex
CREATE INDEX "StudyEvent_packId_idx" ON "StudyEvent"("packId");

-- CreateIndex
CREATE INDEX "StudyEvent_occurredAt_idx" ON "StudyEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "LearningProfile" ADD CONSTRAINT "LearningProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningItem" ADD CONSTRAINT "LearningItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLearningState" ADD CONSTRAINT "UserLearningState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLearningState" ADD CONSTRAINT "UserLearningState_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStudyPack" ADD CONSTRAINT "DailyStudyPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyEvent" ADD CONSTRAINT "StudyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyEvent" ADD CONSTRAINT "StudyEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyEvent" ADD CONSTRAINT "StudyEvent_packId_fkey" FOREIGN KEY ("packId") REFERENCES "DailyStudyPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
