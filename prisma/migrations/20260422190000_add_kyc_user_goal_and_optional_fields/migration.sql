-- CreateEnum already exists: LearningGoal

-- AlterTable
ALTER TABLE "KycUser" ADD COLUMN     "goal" "LearningGoal";
ALTER TABLE "KycUser" ALTER COLUMN "city" DROP NOT NULL;
ALTER TABLE "KycUser" ALTER COLUMN "state" DROP NOT NULL;
ALTER TABLE "KycUser" ALTER COLUMN "age" DROP NOT NULL;
