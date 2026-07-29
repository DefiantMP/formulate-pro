-- AlterTable
ALTER TABLE "Run" ADD COLUMN "actualMgPerTablet" REAL;
ALTER TABLE "Run" ADD COLUMN "actualTabletWeight" REAL;
ALTER TABLE "Run" ADD COLUMN "notes" TEXT;
ALTER TABLE "Run" ADD COLUMN "passFail" TEXT;
