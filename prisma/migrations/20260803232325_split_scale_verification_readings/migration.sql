/*
  Warnings:

  - You are about to drop the column `extractedWeightG` on the `ScaleVerification` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScaleVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
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
    "approvedAt" DATETIME
);
INSERT INTO "new_ScaleVerification" ("approvedAt", "confident", "createdAt", "expectedWeightG", "id", "ingredientLabel", "modelNotes", "organizationId", "passFail", "photoDataUrl", "status", "toleranceType", "toleranceValue") SELECT "approvedAt", "confident", "createdAt", "expectedWeightG", "id", "ingredientLabel", "modelNotes", "organizationId", "passFail", "photoDataUrl", "status", "toleranceType", "toleranceValue" FROM "ScaleVerification";
DROP TABLE "ScaleVerification";
ALTER TABLE "new_ScaleVerification" RENAME TO "ScaleVerification";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
