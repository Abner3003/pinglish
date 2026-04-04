CREATE TABLE "PortalAccessRequest" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "couponCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalAccessRequest_email_idx" ON "PortalAccessRequest"("email");
CREATE INDEX "PortalAccessRequest_professionalId_idx" ON "PortalAccessRequest"("professionalId");

ALTER TABLE "PortalAccessRequest"
ADD CONSTRAINT "PortalAccessRequest_professionalId_fkey"
FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
