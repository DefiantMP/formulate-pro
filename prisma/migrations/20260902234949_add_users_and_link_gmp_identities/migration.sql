-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GmpModeToggleLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorName" TEXT,
    "actorId" TEXT,
    "previousState" BOOLEAN NOT NULL,
    "newState" BOOLEAN NOT NULL,
    "note" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmpModeToggleLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GmpModeToggleLog" ("actorName", "changedAt", "id", "newState", "note", "previousState") SELECT "actorName", "changedAt", "id", "newState", "note", "previousState" FROM "GmpModeToggleLog";
DROP TABLE "GmpModeToggleLog";
ALTER TABLE "new_GmpModeToggleLog" RENAME TO "GmpModeToggleLog";
CREATE INDEX "GmpModeToggleLog_changedAt_idx" ON "GmpModeToggleLog"("changedAt");
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
    CONSTRAINT "Run_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "Formulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Run_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Run" ("actualMgPerTablet", "actualTabletWeight", "createdAt", "deletedAt", "formulationId", "id", "inputs", "label", "mode", "notes", "passFail", "product", "result", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerName", "verificationAcknowledgment") SELECT "actualMgPerTablet", "actualTabletWeight", "createdAt", "deletedAt", "formulationId", "id", "inputs", "label", "mode", "notes", "passFail", "product", "result", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerName", "verificationAcknowledgment" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
CREATE TABLE "new_RunDeviation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "investigationFindings" TEXT,
    "disposition" TEXT NOT NULL DEFAULT 'pending',
    "justification" TEXT,
    "openedBy" TEXT,
    "openedById" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "closedById" TEXT,
    "closedAt" DATETIME,
    CONSTRAINT "RunDeviation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RunDeviation_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RunDeviation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RunDeviation" ("closedAt", "closedBy", "description", "disposition", "id", "investigationFindings", "justification", "openedAt", "openedBy", "runId") SELECT "closedAt", "closedBy", "description", "disposition", "id", "investigationFindings", "justification", "openedAt", "openedBy", "runId" FROM "RunDeviation";
DROP TABLE "RunDeviation";
ALTER TABLE "new_RunDeviation" RENAME TO "RunDeviation";
CREATE INDEX "RunDeviation_runId_idx" ON "RunDeviation"("runId");
CREATE TABLE "new_SavedFormulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tabletWeightG" REAL NOT NULL,
    "referenceBatchTablets" INTEGER NOT NULL,
    "actives" JSONB NOT NULL,
    "fillerName" TEXT NOT NULL,
    "disintegrantName" TEXT,
    "disintegrantPercent" REAL,
    "lubricantName" TEXT,
    "lubricantPercent" REAL,
    "glidantName" TEXT,
    "glidantPercent" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lineageId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "reviewStatus" TEXT,
    "reviewerName" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "reviewNotes" TEXT,
    "outcomeNotes" TEXT,
    "equipmentNotes" TEXT,
    "sourceRunId" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "SavedFormulation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SavedFormulation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SavedFormulation_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SavedFormulation" ("actives", "createdAt", "deletedAt", "disintegrantName", "disintegrantPercent", "equipmentNotes", "fillerName", "glidantName", "glidantPercent", "id", "lineageId", "lubricantName", "lubricantPercent", "name", "notes", "outcomeNotes", "parentId", "referenceBatchTablets", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerName", "sourceRunId", "status", "tabletWeightG", "updatedAt", "version") SELECT "actives", "createdAt", "deletedAt", "disintegrantName", "disintegrantPercent", "equipmentNotes", "fillerName", "glidantName", "glidantPercent", "id", "lineageId", "lubricantName", "lubricantPercent", "name", "notes", "outcomeNotes", "parentId", "referenceBatchTablets", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerName", "sourceRunId", "status", "tabletWeightG", "updatedAt", "version" FROM "SavedFormulation";
DROP TABLE "SavedFormulation";
ALTER TABLE "new_SavedFormulation" RENAME TO "SavedFormulation";
CREATE UNIQUE INDEX "SavedFormulation_sourceRunId_key" ON "SavedFormulation"("sourceRunId");
CREATE TABLE "new_ScaleVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ingredientLabel" TEXT NOT NULL,
    "expectedWeightG" REAL NOT NULL,
    "toleranceType" TEXT NOT NULL,
    "toleranceValue" REAL NOT NULL,
    "aiReadingWeightG" REAL,
    "operatorReadingWeightG" REAL,
    "passFail" TEXT,
    "confident" BOOLEAN NOT NULL,
    "modelNotes" TEXT NOT NULL,
    "photoDataUrl" TEXT,
    "weighedByName" TEXT,
    "verifiedByName" TEXT,
    "weighedById" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    CONSTRAINT "ScaleVerification_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScaleVerification_weighedById_fkey" FOREIGN KEY ("weighedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScaleVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScaleVerification" ("aiReadingWeightG", "approvedAt", "confident", "createdAt", "expectedWeightG", "id", "ingredientLabel", "modelNotes", "operatorReadingWeightG", "organizationId", "passFail", "photoDataUrl", "runId", "status", "toleranceType", "toleranceValue", "verifiedAt", "verifiedByName", "weighedByName") SELECT "aiReadingWeightG", "approvedAt", "confident", "createdAt", "expectedWeightG", "id", "ingredientLabel", "modelNotes", "operatorReadingWeightG", "organizationId", "passFail", "photoDataUrl", "runId", "status", "toleranceType", "toleranceValue", "verifiedAt", "verifiedByName", "weighedByName" FROM "ScaleVerification";
DROP TABLE "ScaleVerification";
ALTER TABLE "new_ScaleVerification" RENAME TO "ScaleVerification";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");
