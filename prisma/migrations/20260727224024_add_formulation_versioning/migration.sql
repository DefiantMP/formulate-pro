-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lineageId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'untested',
    "outcomeNotes" TEXT,
    CONSTRAINT "SavedFormulation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SavedFormulation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SavedFormulation" ("actives", "createdAt", "disintegrantName", "disintegrantPercent", "fillerName", "id", "lubricantName", "lubricantPercent", "name", "notes", "referenceBatchTablets", "tabletWeightG", "updatedAt") SELECT "actives", "createdAt", "disintegrantName", "disintegrantPercent", "fillerName", "id", "lubricantName", "lubricantPercent", "name", "notes", "referenceBatchTablets", "tabletWeightG", "updatedAt" FROM "SavedFormulation";
DROP TABLE "SavedFormulation";
ALTER TABLE "new_SavedFormulation" RENAME TO "SavedFormulation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
