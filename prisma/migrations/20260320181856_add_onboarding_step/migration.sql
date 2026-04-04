-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('WAITING_OPT_IN', 'ASK_PROFESSION', 'ASK_GOAL', 'ASK_INTERESTS', 'DONE');

-- AlterTable
ALTER TABLE "LeadResponse" ADD COLUMN     "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'WAITING_OPT_IN';
