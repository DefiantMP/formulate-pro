/*
  Warnings:

  - Added the required column `runId` to the `ScaleVerification` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    CONSTRAINT "ScaleVerification_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ScaleVerification" ("aiReadingWeightG", "approvedAt", "confident", "createdAt", "expectedWeightG", "id", "ingredientLabel", "modelNotes", "operatorReadingWeightG", "organizationId", "passFail", "photoDataUrl", "status", "toleranceType", "toleranceValue") SELECT "aiReadingWeightG", "approvedAt", "confident", "createdAt", "expectedWeightG", "id", "ingredientLabel", "modelNotes", "operatorReadingWeightG", "organizationId", "passFail", "photoDataUrl", "status", "toleranceType", "toleranceValue" FROM "ScaleVerification";
DROP TABLE "ScaleVerification";
ALTER TABLE "new_ScaleVerification" RENAME TO "ScaleVerification";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
