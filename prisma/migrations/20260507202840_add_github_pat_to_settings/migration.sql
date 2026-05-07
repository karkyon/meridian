-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "github_auto_sync" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "github_cache_hours" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "github_pat_encrypted" TEXT,
ADD COLUMN     "github_pat_iv" VARCHAR(32);
