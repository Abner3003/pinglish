/*
  Warnings:

  - You are about to drop the column `onboardingStep` on the `LeadResponse` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'WAITING_OPT_IN';

-- AlterTable
ALTER TABLE "LeadResponse" DROP COLUMN "onboardingStep";
