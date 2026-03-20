-- CreateTable
CREATE TABLE "LeadResponse" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "externalFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadResponse_leadId_idx" ON "LeadResponse"("leadId");

-- AddForeignKey
ALTER TABLE "LeadResponse" ADD CONSTRAINT "LeadResponse_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
