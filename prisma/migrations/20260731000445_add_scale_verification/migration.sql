-- CreateTable
CREATE TABLE "ScaleVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "ingredientLabel" TEXT NOT NULL,
    "expectedWeightG" REAL NOT NULL,
    "toleranceType" TEXT NOT NULL,
    "toleranceValue" REAL NOT NULL,
    "extractedWeightG" REAL,
    "passFail" TEXT,
    "confident" BOOLEAN NOT NULL,
    "modelNotes" TEXT NOT NULL,
    "photoDataUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME
);
