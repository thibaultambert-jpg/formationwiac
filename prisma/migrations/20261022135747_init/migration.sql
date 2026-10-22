-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'trainer', 'employee');

-- CreateEnum
CREATE TYPE "TrainingModality" AS ENUM ('in_person', 'remote', 'blended');

-- CreateEnum
CREATE TYPE "TrainerType" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('draft', 'published', 'full', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('internal', 'external');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('confirmed', 'waitlisted', 'cancelled', 'present', 'absent');

-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('front', 'back_office');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('hot', 'cold');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('participant_link', 'trainer_device');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('attendance', 'hot_evaluation', 'cold_evaluation');

-- CreateEnum
CREATE TYPE "QuestionAnswerType" AS ENUM ('scale_1_5', 'scale_0_10', 'single_choice', 'choice_with_other', 'text');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('convocation', 'attendance_sheet', 'certificate', 'program', 'enrollment_confirmation', 'waitlist_notice', 'waitlist_promotion', 'reminder', 'attendance_link', 'evaluation_request', 'evaluation_reminder', 'session_cancellation');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'employee',
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "theme_id" UUID,
    "objectives" TEXT NOT NULL,
    "prerequisites" TEXT,
    "target_audience" TEXT,
    "program_text" TEXT,
    "program_pdf_path" TEXT,
    "duration_hours" DECIMAL(5,1) NOT NULL,
    "modality" "TrainingModality" NOT NULL,
    "price_excl_tax" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainers" (
    "id" UUID NOT NULL,
    "type" "TrainerType" NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "specialties" TEXT[],
    "cv_path" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "training_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'draft',
    "location" TEXT,
    "video_link" TEXT,
    "capacity_max" INTEGER NOT NULL,
    "capacity_min" INTEGER,
    "registration_deadline" TIMESTAMPTZ,
    "open_to_internal" BOOLEAN NOT NULL DEFAULT true,
    "open_to_external" BOOLEAN NOT NULL DEFAULT false,
    "internal_notes" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_slots" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_trainers" (
    "session_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,

    CONSTRAINT "session_trainers_pkey" PRIMARY KEY ("session_id","trainer_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'France',
    "main_contact_id" UUID,
    "billing_email" TEXT,
    "hubspot_company_id" TEXT,
    "merged_into_id" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "type" "ParticipantType" NOT NULL,
    "user_id" UUID,
    "company_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "job_title" TEXT,
    "phone" TEXT,
    "hubspot_contact_id" TEXT,
    "archived_at" TIMESTAMPTZ,
    "anonymized_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL,
    "source" "EnrollmentSource" NOT NULL,
    "enrolled_by_id" UUID,
    "applied_price" DECIMAL(10,2),
    "billing_company_id" UUID,
    "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivation" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "signature_path" TEXT,
    "signed_at" TIMESTAMPTZ,
    "ip_address" TEXT,
    "method" "SignatureMethod",

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_signatures" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "signature_path" TEXT NOT NULL,
    "signed_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trainer_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_tokens" (
    "id" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "type" "EvaluationType" NOT NULL,
    "answers" JSONB,
    "global_score" DECIMAL(4,2),
    "sent_at" TIMESTAMPTZ,
    "reminder_sent_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_questions" (
    "id" UUID NOT NULL,
    "evaluation_type" "EvaluationType" NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "answer_type" "QuestionAnswerType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "evaluation_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "session_id" UUID,
    "enrollment_id" UUID,
    "file_path" TEXT,
    "recipient_email" TEXT,
    "generated_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "gmail_message_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "siret" TEXT,
    "activity_declaration_number" TEXT,
    "logo_path" TEXT,
    "manager_name" TEXT,
    "manager_title" TEXT,
    "manager_signature_path" TEXT,
    "contact_email" TEXT,
    "reminder_days_before" INTEGER NOT NULL DEFAULT 3,
    "cold_evaluation_days" INTEGER NOT NULL DEFAULT 60,
    "evaluation_reminder_days" INTEGER NOT NULL DEFAULT 5,
    "data_retention_years" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "key" "DocumentType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "themes_name_key" ON "themes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "trainings_slug_key" ON "trainings"("slug");

-- CreateIndex
CREATE INDEX "trainings_theme_id_idx" ON "trainings"("theme_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainers_user_id_key" ON "trainers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_reference_key" ON "sessions"("reference");

-- CreateIndex
CREATE INDEX "sessions_training_id_idx" ON "sessions"("training_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "session_slots_session_id_starts_at_idx" ON "session_slots"("session_id", "starts_at");

-- CreateIndex
CREATE INDEX "session_trainers_trainer_id_idx" ON "session_trainers"("trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_siret_key" ON "companies"("siret");

-- CreateIndex
CREATE UNIQUE INDEX "companies_main_contact_id_key" ON "companies"("main_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_hubspot_company_id_key" ON "companies"("hubspot_company_id");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "participants_user_id_key" ON "participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_email_key" ON "participants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "participants_hubspot_contact_id_key" ON "participants"("hubspot_contact_id");

-- CreateIndex
CREATE INDEX "participants_company_id_idx" ON "participants"("company_id");

-- CreateIndex
CREATE INDEX "participants_last_name_first_name_idx" ON "participants"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "enrollments_session_id_status_enrolled_at_idx" ON "enrollments"("session_id", "status", "enrolled_at");

-- CreateIndex
CREATE INDEX "enrollments_participant_id_idx" ON "enrollments"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_session_id_participant_id_key" ON "enrollments"("session_id", "participant_id");

-- CreateIndex
CREATE INDEX "attendances_slot_id_idx" ON "attendances"("slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_enrollment_id_slot_id_key" ON "attendances"("enrollment_id", "slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_signatures_slot_id_trainer_id_key" ON "trainer_signatures"("slot_id", "trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_tokens_token_hash_key" ON "access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "access_tokens_enrollment_id_purpose_idx" ON "access_tokens"("enrollment_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_enrollment_id_type_key" ON "evaluations"("enrollment_id", "type");

-- CreateIndex
CREATE INDEX "evaluation_questions_evaluation_type_position_idx" ON "evaluation_questions"("evaluation_type", "position");

-- CreateIndex
CREATE INDEX "documents_session_id_idx" ON "documents"("session_id");

-- CreateIndex
CREATE INDEX "documents_enrollment_id_idx" ON "documents"("enrollment_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "trainings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_slots" ADD CONSTRAINT "session_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_trainers" ADD CONSTRAINT "session_trainers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_trainers" ADD CONSTRAINT "session_trainers_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_main_contact_id_fkey" FOREIGN KEY ("main_contact_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolled_by_id_fkey" FOREIGN KEY ("enrolled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_billing_company_id_fkey" FOREIGN KEY ("billing_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "session_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_signatures" ADD CONSTRAINT "trainer_signatures_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "session_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_signatures" ADD CONSTRAINT "trainer_signatures_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
