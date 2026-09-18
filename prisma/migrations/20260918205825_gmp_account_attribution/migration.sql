-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawMaterialId" TEXT NOT NULL,
    "lotLabel" TEXT NOT NULL,
    "receivedDate" DATETIME NOT NULL,
    "quantityReceivedG" REAL NOT NULL,
    "quantityRemainingG" REAL NOT NULL,
    "sourceType" TEXT NOT NULL,
    "supplier" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    CONSTRAINT "Lot_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lot" ("createdAt", "id", "lotLabel", "notes", "quantityReceivedG", "quantityRemainingG", "rawMaterialId", "receivedDate", "sourceType", "supplier") SELECT "createdAt", "id", "lotLabel", "notes", "quantityReceivedG", "quantityRemainingG", "rawMaterialId", "receivedDate", "sourceType", "supplier" FROM "Lot";
DROP TABLE "Lot";
ALTER TABLE "new_Lot" RENAME TO "Lot";
CREATE UNIQUE INDEX "Lot_rawMaterialId_lotLabel_key" ON "Lot"("rawMaterialId", "lotLabel");
CREATE TABLE "new_LotSpecTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "specCriterionId" TEXT NOT NULL,
    "resultValue" REAL,
    "resultText" TEXT,
    "passFail" BOOLEAN NOT NULL,
    "methodUsed" TEXT,
    "testedBy" TEXT,
    "testedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testedById" TEXT,
    CONSTRAINT "LotSpecTest_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LotSpecTest_specCriterionId_fkey" FOREIGN KEY ("specCriterionId") REFERENCES "SpecCriterion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LotSpecTest_testedById_fkey" FOREIGN KEY ("testedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LotSpecTest" ("createdAt", "id", "lotId", "methodUsed", "notes", "passFail", "resultText", "resultValue", "specCriterionId", "testedAt", "testedBy") SELECT "createdAt", "id", "lotId", "methodUsed", "notes", "passFail", "resultText", "resultValue", "specCriterionId", "testedAt", "testedBy" FROM "LotSpecTest";
DROP TABLE "LotSpecTest";
ALTER TABLE "new_LotSpecTest" RENAME TO "LotSpecTest";
CREATE INDEX "LotSpecTest_lotId_specCriterionId_idx" ON "LotSpecTest"("lotId", "specCriterionId");
CREATE TABLE "new_OosInvestigation" (
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
    "openedById" TEXT,
    "approvedById" TEXT,
    CONSTRAINT "OosInvestigation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OosInvestigation_failedLotSpecTestId_fkey" FOREIGN KEY ("failedLotSpecTestId") REFERENCES "LotSpecTest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OosInvestigation_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OosInvestigation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OosInvestigation" ("approvedAt", "approvedBy", "createdAt", "disposition", "failedLotSpecTestId", "id", "lotId", "notes", "openedAt", "openedBy", "reasonForInvestigation", "retestJustified", "rootCauseFindings") SELECT "approvedAt", "approvedBy", "createdAt", "disposition", "failedLotSpecTestId", "id", "lotId", "notes", "openedAt", "openedBy", "reasonForInvestigation", "retestJustified", "rootCauseFindings" FROM "OosInvestigation";
DROP TABLE "OosInvestigation";
ALTER TABLE "new_OosInvestigation" RENAME TO "OosInvestigation";
CREATE INDEX "OosInvestigation_lotId_idx" ON "OosInvestigation"("lotId");
CREATE INDEX "OosInvestigation_failedLotSpecTestId_idx" ON "OosInvestigation"("failedLotSpecTestId");
CREATE TABLE "new_RawMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "RawMaterial_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RawMaterial" ("category", "createdAt", "id", "name") SELECT "category", "createdAt", "id", "name" FROM "RawMaterial";
DROP TABLE "RawMaterial";
ALTER TABLE "new_RawMaterial" RENAME TO "RawMaterial";
CREATE UNIQUE INDEX "RawMaterial_name_key" ON "RawMaterial"("name");
CREATE TABLE "new_Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "product" TEXT,
    "mode" TEXT NOT NULL,
    "formulationId" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "verificationAcknowledgment" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStatus" TEXT,
    "reviewerName" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "reviewNotes" TEXT,
    "actualMgPerTablet" REAL,
    "actualTabletWeight" REAL,
    "passFail" TEXT,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdById" TEXT,
    CONSTRAINT "Run_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Run_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Run_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Run" ("actualMgPerTablet", "actualTabletWeight", "createdAt", "deletedAt", "formulationId", "id", "inputs", "label", "mode", "notes", "passFail", "product", "result", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerId", "reviewerName", "verificationAcknowledgment") SELECT "actualMgPerTablet", "actualTabletWeight", "createdAt", "deletedAt", "formulationId", "id", "inputs", "label", "mode", "notes", "passFail", "product", "result", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerId", "reviewerName", "verificationAcknowledgment" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
