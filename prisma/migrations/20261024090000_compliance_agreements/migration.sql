-- Compliance audit, lot 1 (A1, A2, B2, B4): participant type and funding on
-- enrollments, Qualiopi scope and access info on sessions, training agreements.
-- Reversible: see down.sql in this folder.

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('none', 'company', 'opco', 'cpf', 'france_travail', 'region', 'other');

-- CreateEnum
CREATE TYPE "ConventionStatus" AS ENUM ('draft', 'sent', 'signed', 'cancelled');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'convention';

-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'pending_agreement';

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "agreement_waived_at" TIMESTAMPTZ,
ADD COLUMN     "agreement_waived_by_id" UUID,
ADD COLUMN     "agreement_waiver_reason" TEXT,
ADD COLUMN     "convention_id" UUID,
ADD COLUMN     "funding_type" "FundingType" NOT NULL DEFAULT 'none',
ADD COLUMN     "participant_type" "ParticipantType";

-- Backfill: the participant type is frozen on each existing enrollment, and
-- external enrollments are considered paid by the client company.
UPDATE "enrollments" e SET "participant_type" = p."type" FROM "participants" p WHERE p."id" = e."participant_id";
UPDATE "enrollments" SET "funding_type" = 'company' WHERE "participant_type" = 'external';
ALTER TABLE "enrollments" ALTER COLUMN "participant_type" SET NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "access_info" TEXT,
ADD COLUMN     "qualiopi_scope" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "trainings" ADD COLUMN     "things_to_bring" TEXT;

-- CreateTable
CREATE TABLE "conventions" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "ConventionStatus" NOT NULL DEFAULT 'draft',
    "price_excl_tax" DECIMAL(10,2),
    "financial_terms" TEXT,
    "generated_path" TEXT,
    "generated_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "signed_path" TEXT,
    "signed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conventions_pkey" PRIMARY KEY ("id")
);

-- Row Level Security (no policy: server-side access only, see *_enable_rls).
ALTER TABLE "conventions" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE UNIQUE INDEX "conventions_reference_key" ON "conventions"("reference");

-- CreateIndex
CREATE INDEX "conventions_session_id_company_id_idx" ON "conventions"("session_id", "company_id");

-- CreateIndex
CREATE INDEX "enrollments_convention_id_idx" ON "enrollments"("convention_id");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_convention_id_fkey" FOREIGN KEY ("convention_id") REFERENCES "conventions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

