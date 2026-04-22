ALTER TABLE "LearningProfile" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "LearningProfile_tenantId_idx" ON "LearningProfile"("tenantId");

ALTER TABLE "LearningProfile"
ADD CONSTRAINT "LearningProfile_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
