-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LabNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "product" TEXT,
    "runId" TEXT,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retractedAt" DATETIME,
    "retractedReason" TEXT,
    "retractedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'typed',
    "attachmentId" TEXT,
    CONSTRAINT "LabNote_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabNote_retractedById_fkey" FOREIGN KEY ("retractedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabNote_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LabNote" ("authorId", "body", "createdAt", "id", "product", "retractedAt", "retractedById", "retractedReason", "runId") SELECT "authorId", "body", "createdAt", "id", "product", "retractedAt", "retractedById", "retractedReason", "runId" FROM "LabNote";
DROP TABLE "LabNote";
ALTER TABLE "new_LabNote" RENAME TO "LabNote";
CREATE INDEX "LabNote_product_idx" ON "LabNote"("product");
CREATE INDEX "LabNote_runId_idx" ON "LabNote"("runId");
CREATE INDEX "LabNote_createdAt_idx" ON "LabNote"("createdAt");
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
    "otherExcipients" JSONB,
    "importedFrom" TEXT,
    "attachmentId" TEXT,
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
    CONSTRAINT "SavedFormulation_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SavedFormulation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SavedFormulation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SavedFormulation_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SavedFormulation" ("actives", "createdAt", "deletedAt", "disintegrantName", "disintegrantPercent", "equipmentNotes", "fillerName", "glidantName", "glidantPercent", "id", "lineageId", "lubricantName", "lubricantPercent", "name", "notes", "outcomeNotes", "parentId", "referenceBatchTablets", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerId", "reviewerName", "sourceRunId", "status", "tabletWeightG", "updatedAt", "version") SELECT "actives", "createdAt", "deletedAt", "disintegrantName", "disintegrantPercent", "equipmentNotes", "fillerName", "glidantName", "glidantPercent", "id", "lineageId", "lubricantName", "lubricantPercent", "name", "notes", "outcomeNotes", "parentId", "referenceBatchTablets", "reviewNotes", "reviewStatus", "reviewedAt", "reviewerId", "reviewerName", "sourceRunId", "status", "tabletWeightG", "updatedAt", "version" FROM "SavedFormulation";
DROP TABLE "SavedFormulation";
ALTER TABLE "new_SavedFormulation" RENAME TO "SavedFormulation";
CREATE UNIQUE INDEX "SavedFormulation_sourceRunId_key" ON "SavedFormulation"("sourceRunId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Attachment_sha256_idx" ON "Attachment"("sha256");
