-- CreateTable
CREATE TABLE "OosInvestigation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "failedLotSpecTestId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonForInvestigation" TEXT NOT NULL,
    "rootCauseFindings" TEXT,
    "retestJustified" BOOLEAN,
    "disposition" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OosInvestigation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OosInvestigation_failedLotSpecTestId_fkey" FOREIGN KEY ("failedLotSpecTestId") REFERENCES "LotSpecTest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OosInvestigation_lotId_idx" ON "OosInvestigation"("lotId");

-- CreateIndex
CREATE INDEX "OosInvestigation_failedLotSpecTestId_idx" ON "OosInvestigation"("failedLotSpecTestId");
