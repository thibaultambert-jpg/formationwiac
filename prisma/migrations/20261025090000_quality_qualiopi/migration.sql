-- CreateEnum
CREATE TYPE "LearningResult" AS ENUM ('acquired', 'partially_acquired', 'not_acquired');

-- CreateEnum
CREATE TYPE "TrainerDocumentType" AS ENUM ('diploma', 'certification', 'cv', 'subcontracting_contract', 'insurance', 'other');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('open', 'in_progress', 'closed');

-- CreateEnum
CREATE TYPE "ImprovementSource" AS ENUM ('complaint', 'evaluation', 'audit', 'other');

-- CreateEnum
CREATE TYPE "ImprovementStatus" AS ENUM ('planned', 'in_progress', 'done', 'abandoned');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'positioning_request';
ALTER TYPE "DocumentType" ADD VALUE 'stakeholder_evaluation_request';
ALTER TYPE "DocumentType" ADD VALUE 'absence_alert';

-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'dropped_out';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EvaluationType" ADD VALUE 'positioning';
ALTER TYPE "EvaluationType" ADD VALUE 'company';
ALTER TYPE "EvaluationType" ADD VALUE 'trainer';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TokenPurpose" ADD VALUE 'positioning';
ALTER TYPE "TokenPurpose" ADD VALUE 'stakeholder_evaluation';

-- AlterTable
ALTER TABLE "access_tokens" ADD COLUMN     "stakeholder_evaluation_id" UUID;

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "adaptation_need" TEXT,
ADD COLUMN     "dropout_reason" TEXT,
ADD COLUMN     "dropped_out_at" TIMESTAMPTZ,
ADD COLUMN     "learning_assessed_at" TIMESTAMPTZ,
ADD COLUMN     "learning_assessed_by" TEXT,
ADD COLUMN     "learning_comment" TEXT,
ADD COLUMN     "learning_file_path" TEXT,
ADD COLUMN     "learning_result" "LearningResult",
ADD COLUMN     "needs_analysis_note" TEXT,
ADD COLUMN     "needs_analysis_path" TEXT,
ADD COLUMN     "positioning_path" TEXT;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "alert_email" TEXT,
ADD COLUMN     "positioning_days_before" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "stakeholder_evaluations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "EvaluationType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "company_id" UUID,
    "trainer_id" UUID,
    "recipient_email" TEXT,
    "answers" JSONB,
    "global_score" DECIMAL(4,2),
    "sent_at" TIMESTAMPTZ,
    "reminder_sent_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stakeholder_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_documents" (
    "id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "type" "TrainerDocumentType" NOT NULL,
    "label" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL,
    "complainant" TEXT NOT NULL,
    "channel" TEXT,
    "session_id" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "treatment" TEXT,
    "response" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "improvement_actions" (
    "id" UUID NOT NULL,
    "source" "ImprovementSource" NOT NULL,
    "complaint_id" UUID,
    "origin" TEXT,
    "action" TEXT NOT NULL,
    "owner" TEXT,
    "due_date" TIMESTAMPTZ,
    "status" "ImprovementStatus" NOT NULL DEFAULT 'planned',
    "result" TEXT,
    "closed_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "improvement_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stakeholder_evaluations_session_id_type_subject_id_key" ON "stakeholder_evaluations"("session_id", "type", "subject_id");

-- CreateIndex
CREATE INDEX "trainer_documents_trainer_id_idx" ON "trainer_documents"("trainer_id");

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_stakeholder_evaluation_id_fkey" FOREIGN KEY ("stakeholder_evaluation_id") REFERENCES "stakeholder_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_evaluations" ADD CONSTRAINT "stakeholder_evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_evaluations" ADD CONSTRAINT "stakeholder_evaluations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_evaluations" ADD CONSTRAINT "stakeholder_evaluations_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_documents" ADD CONSTRAINT "trainer_documents_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row Level Security on every table (no policy: only the server role reads it).
ALTER TABLE "stakeholder_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trainer_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "improvement_actions" ENABLE ROW LEVEL SECURITY;
