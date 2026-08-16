-- CreateTable
CREATE TABLE "RawMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Lot" (
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
    CONSTRAINT "Lot_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComponentSpec" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawMaterialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComponentSpec_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpecCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "componentSpecId" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "minValue" REAL,
    "maxValue" REAL,
    "targetValue" REAL,
    "passCriteriaText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpecCriterion_componentSpecId_fkey" FOREIGN KEY ("componentSpecId") REFERENCES "ComponentSpec" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LotSpecTest" (
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
    CONSTRAINT "LotSpecTest_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LotSpecTest_specCriterionId_fkey" FOREIGN KEY ("specCriterionId") REFERENCES "SpecCriterion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunLotUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "amountUsedG" REAL NOT NULL,
    "roleInRun" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunLotUsage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RunLotUsage_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_name_key" ON "RawMaterial"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_rawMaterialId_lotLabel_key" ON "Lot"("rawMaterialId", "lotLabel");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentSpec_rawMaterialId_key" ON "ComponentSpec"("rawMaterialId");

-- CreateIndex
CREATE INDEX "LotSpecTest_lotId_specCriterionId_idx" ON "LotSpecTest"("lotId", "specCriterionId");

-- CreateIndex
CREATE INDEX "RunLotUsage_runId_idx" ON "RunLotUsage"("runId");

-- CreateIndex
CREATE INDEX "RunLotUsage_lotId_idx" ON "RunLotUsage"("lotId");
