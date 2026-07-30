-- AlterTable
ALTER TABLE "SavedFormulation" ADD COLUMN "sourceRunId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SavedFormulation_sourceRunId_key" ON "SavedFormulation"("sourceRunId");
