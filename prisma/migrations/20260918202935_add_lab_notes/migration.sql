-- CreateTable
CREATE TABLE "LabNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "product" TEXT,
    "runId" TEXT,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retractedAt" DATETIME,
    "retractedReason" TEXT,
    "retractedById" TEXT,
    CONSTRAINT "LabNote_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LabNote_retractedById_fkey" FOREIGN KEY ("retractedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LabNote_product_idx" ON "LabNote"("product");

-- CreateIndex
CREATE INDEX "LabNote_runId_idx" ON "LabNote"("runId");

-- CreateIndex
CREATE INDEX "LabNote_createdAt_idx" ON "LabNote"("createdAt");
