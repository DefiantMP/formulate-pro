-- CreateTable
CREATE TABLE "LotAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "deltaG" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedById" TEXT,
    "adjustedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LotAdjustment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LotAdjustment_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LotAdjustment_lotId_idx" ON "LotAdjustment"("lotId");
