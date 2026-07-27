-- CreateTable
CREATE TABLE "SavedFormulation" (
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
    "updatedAt" DATETIME NOT NULL
);
