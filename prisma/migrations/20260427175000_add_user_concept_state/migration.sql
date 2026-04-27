CREATE TABLE "UserConceptState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "conceptSeenAt" TIMESTAMP(3),
    "lastMode" TEXT,
    "lastResult" TEXT,
    "lastAnswerQuality" INTEGER,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConceptState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserConceptState_userId_topicKey_key" ON "UserConceptState"("userId", "topicKey");
CREATE INDEX "UserConceptState_userId_idx" ON "UserConceptState"("userId");
CREATE INDEX "UserConceptState_topicKey_idx" ON "UserConceptState"("topicKey");

ALTER TABLE "UserConceptState"
ADD CONSTRAINT "UserConceptState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
