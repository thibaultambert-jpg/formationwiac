-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'completion_certificate';
ALTER TYPE "DocumentType" ADD VALUE 'pre_training_information';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "attachments" JSONB;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "administrative_contact" TEXT,
ADD COLUMN     "disability_referent_email" TEXT,
ADD COLUMN     "disability_referent_name" TEXT,
ADD COLUMN     "disability_referent_phone" TEXT,
ADD COLUMN     "dpo_contact" TEXT,
ADD COLUMN     "internal_retention_years" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "legal_notice" TEXT,
ADD COLUMN     "pedagogical_contact" TEXT,
ADD COLUMN     "privacy_notice" TEXT,
ADD COLUMN     "privacy_policy" TEXT,
ADD COLUMN     "technical_retention_months" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "token_retention_days" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "legal_hold_at" TIMESTAMPTZ,
ADD COLUMN     "legal_hold_reason" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "legal_hold_at" TIMESTAMPTZ,
ADD COLUMN     "legal_hold_reason" TEXT;

-- AlterTable
ALTER TABLE "trainings" ADD COLUMN     "access_delay" TEXT,
ADD COLUMN     "accessibility" TEXT,
ADD COLUMN     "evaluation_methods" TEXT,
ADD COLUMN     "teaching_methods" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "left_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "internal_regulations" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "file_path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_regulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_regulations_version_key" ON "internal_regulations"("version");


-- Row Level Security on every table (no policy: only the server role reads it).
ALTER TABLE "internal_regulations" ENABLE ROW LEVEL SECURITY;
