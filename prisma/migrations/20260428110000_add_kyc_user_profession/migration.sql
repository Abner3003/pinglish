-- Add profession to KycUser for onboarding/workflow capture
ALTER TABLE "KycUser"
ADD COLUMN IF NOT EXISTS "profession" TEXT;
