-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "soundEnabled" BOOLEAN NOT NULL DEFAULT true;
