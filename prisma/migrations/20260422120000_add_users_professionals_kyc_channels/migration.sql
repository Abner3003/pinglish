-- CreateEnum
CREATE TYPE "UserChannelStatus" AS ENUM ('OPT_IN', 'OPT_OUT', 'ONBOARDING', 'OTHER');

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "document" TEXT;
ALTER TABLE "Professional" ADD COLUMN     "businessName" TEXT;
ALTER TABLE "Professional" ADD COLUMN     "planId" TEXT;
ALTER TABLE "Professional" ADD COLUMN     "city" TEXT;
ALTER TABLE "Professional" ADD COLUMN     "state" TEXT;
ALTER TABLE "Professional" ADD COLUMN     "age" INTEGER;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "planId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalPreferences" TEXT[],
    "language" TEXT NOT NULL,
    "languageLevel" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycProfessional" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycProfessional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UserChannelStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "KycUser_userId_key" ON "KycUser"("userId");
CREATE UNIQUE INDEX "KycProfessional_professionalId_key" ON "KycProfessional"("professionalId");
CREATE UNIQUE INDEX "UserChannel_userId_key" ON "UserChannel"("userId");
CREATE UNIQUE INDEX "Professional_document_key" ON "Professional"("document");

-- AddForeignKey
ALTER TABLE "KycUser" ADD CONSTRAINT "KycUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KycProfessional" ADD CONSTRAINT "KycProfessional_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserChannel" ADD CONSTRAINT "UserChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
