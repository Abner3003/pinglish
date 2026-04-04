CREATE TYPE "LeadContextSource" AS ENUM ('WHATSAPP_INBOUND');

CREATE TABLE "LeadContextEntry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadResponseId" TEXT,
    "source" "LeadContextSource" NOT NULL,
    "content" TEXT NOT NULL,
    "onboardingStep" "OnboardingStep" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadContextEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadContextEntry_leadResponseId_key" ON "LeadContextEntry"("leadResponseId");
CREATE INDEX "LeadContextEntry_leadId_createdAt_idx" ON "LeadContextEntry"("leadId", "createdAt");

ALTER TABLE "LeadContextEntry" ADD CONSTRAINT "LeadContextEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadContextEntry" ADD CONSTRAINT "LeadContextEntry_leadResponseId_fkey" FOREIGN KEY ("leadResponseId") REFERENCES "LeadResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
