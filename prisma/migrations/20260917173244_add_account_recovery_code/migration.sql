-- AlterTable
ALTER TABLE "User" ADD COLUMN "recoveryCodeCreatedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "recoveryCodeHash" TEXT;
