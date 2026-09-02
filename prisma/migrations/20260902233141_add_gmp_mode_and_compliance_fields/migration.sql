-- AlterTable
ALTER TABLE "Run" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "Run" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "Run" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Run" ADD COLUMN "reviewerName" TEXT;

-- AlterTable
ALTER TABLE "SavedFormulation" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "SavedFormulation" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "SavedFormulation" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "SavedFormulation" ADD COLUMN "reviewerName" TEXT;

-- AlterTable
ALTER TABLE "ScaleVerification" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "ScaleVerification" ADD COLUMN "verifiedByName" TEXT;
ALTER TABLE "ScaleVerification" ADD COLUMN "weighedByName" TEXT;

-- CreateTable
CREATE TABLE "GmpSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lotStatusEnforcement" TEXT NOT NULL DEFAULT 'warn',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GmpModeToggleLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorName" TEXT NOT NULL,
    "previousState" BOOLEAN NOT NULL,
    "newState" BOOLEAN NOT NULL,
    "note" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RunDeviation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "investigationFindings" TEXT,
    "disposition" TEXT NOT NULL DEFAULT 'pending',
    "justification" TEXT,
    "openedBy" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    CONSTRAINT "RunDeviation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GmpModeToggleLog_changedAt_idx" ON "GmpModeToggleLog"("changedAt");

-- CreateIndex
CREATE INDEX "RunDeviation_runId_idx" ON "RunDeviation"("runId");
