-- CreateTable
CREATE TABLE "RegrindLotPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "potency" JSONB NOT NULL,
    "disintegrantPercent" REAL,
    "lubricantPercent" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RegrindLotPreset_name_key" ON "RegrindLotPreset"("name");
