-- Reverts 20261025090000_quality_qualiopi. Run manually with psql, then delete
-- the row of this migration from "_prisma_migrations".
-- Every record of the new tables and columns is copied into the audit log
-- before it is dropped (files stay in storage), except the adaptation needs,
-- which are sensitive and must not be duplicated.
BEGIN;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), "created_by_id", 'rollback_copy', 'complaint', "id"::text, to_jsonb(c) - 'id', now()
FROM "complaints" c;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), "created_by_id", 'rollback_copy', 'improvement_action', "id"::text, to_jsonb(i) - 'id', now()
FROM "improvement_actions" i;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), "created_by_id", 'rollback_copy', 'trainer_document', "id"::text, to_jsonb(d) - 'id', now()
FROM "trainer_documents" d;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'stakeholder_evaluation', "id"::text, to_jsonb(s) - 'id', now()
FROM "stakeholder_evaluations" s;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'enrollment', "id"::text,
       jsonb_build_object('needsAnalysisNote', "needs_analysis_note", 'needsAnalysisPath', "needs_analysis_path",
                          'positioningPath', "positioning_path", 'learningResult', "learning_result",
                          'learningComment', "learning_comment", 'learningFilePath', "learning_file_path",
                          'learningAssessedAt', "learning_assessed_at", 'learningAssessedBy', "learning_assessed_by",
                          'droppedOutAt', "dropped_out_at", 'dropoutReason', "dropout_reason", 'status', "status"),
       now()
FROM "enrollments"
WHERE "needs_analysis_note" IS NOT NULL OR "needs_analysis_path" IS NOT NULL OR "positioning_path" IS NOT NULL
   OR "learning_result" IS NOT NULL OR "dropped_out_at" IS NOT NULL OR "status" = 'dropped_out';
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'evaluation', "id"::text, to_jsonb(e) - 'id', now()
FROM "evaluations" e WHERE "type"::text IN ('positioning', 'company', 'trainer');
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'evaluation_question', "id"::text, to_jsonb(q) - 'id', now()
FROM "evaluation_questions" q WHERE "evaluation_type"::text IN ('positioning', 'company', 'trainer');

ALTER TABLE "access_tokens" DROP CONSTRAINT IF EXISTS "access_tokens_stakeholder_evaluation_id_fkey";
DELETE FROM "access_tokens" WHERE "purpose"::text IN ('positioning', 'stakeholder_evaluation');
ALTER TABLE "access_tokens" DROP COLUMN IF EXISTS "stakeholder_evaluation_id";
DROP TABLE IF EXISTS "improvement_actions";
DROP TABLE IF EXISTS "complaints";
DROP TABLE IF EXISTS "trainer_documents";
DROP TABLE IF EXISTS "stakeholder_evaluations";
DROP TYPE IF EXISTS "ImprovementStatus";
DROP TYPE IF EXISTS "ImprovementSource";
DROP TYPE IF EXISTS "ComplaintStatus";
DROP TYPE IF EXISTS "TrainerDocumentType";

ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "adaptation_need", DROP COLUMN IF EXISTS "dropout_reason",
  DROP COLUMN IF EXISTS "dropped_out_at", DROP COLUMN IF EXISTS "learning_assessed_at",
  DROP COLUMN IF EXISTS "learning_assessed_by", DROP COLUMN IF EXISTS "learning_comment",
  DROP COLUMN IF EXISTS "learning_file_path", DROP COLUMN IF EXISTS "learning_result",
  DROP COLUMN IF EXISTS "needs_analysis_note", DROP COLUMN IF EXISTS "needs_analysis_path",
  DROP COLUMN IF EXISTS "positioning_path";
DROP TYPE IF EXISTS "LearningResult";
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "alert_email",
  DROP COLUMN IF EXISTS "positioning_days_before";

-- PostgreSQL cannot drop an enum value: recreate the types without the new ones.
-- Dropouts become absences; the new email types keep their row under the closest older type.
UPDATE "enrollments" SET "status" = 'absent' WHERE "status" = 'dropped_out';
ALTER TYPE "EnrollmentStatus" RENAME TO "EnrollmentStatus_old";
CREATE TYPE "EnrollmentStatus" AS ENUM ('confirmed', 'pending_agreement', 'waitlisted', 'cancelled', 'present', 'absent');
ALTER TABLE "enrollments" ALTER COLUMN "status" TYPE "EnrollmentStatus" USING "status"::text::"EnrollmentStatus";
DROP TYPE "EnrollmentStatus_old";

DELETE FROM "evaluations" WHERE "type"::text IN ('positioning', 'company', 'trainer');
DELETE FROM "evaluation_questions" WHERE "evaluation_type"::text IN ('positioning', 'company', 'trainer');
ALTER TYPE "EvaluationType" RENAME TO "EvaluationType_old";
CREATE TYPE "EvaluationType" AS ENUM ('hot', 'cold');
ALTER TABLE "evaluations" ALTER COLUMN "type" TYPE "EvaluationType" USING "type"::text::"EvaluationType";
ALTER TABLE "evaluation_questions" ALTER COLUMN "evaluation_type" TYPE "EvaluationType"
  USING "evaluation_type"::text::"EvaluationType";
DROP TYPE "EvaluationType_old";

ALTER TYPE "TokenPurpose" RENAME TO "TokenPurpose_old";
CREATE TYPE "TokenPurpose" AS ENUM ('attendance', 'trainer_attendance', 'hot_evaluation', 'cold_evaluation');
ALTER TABLE "access_tokens" ALTER COLUMN "purpose" TYPE "TokenPurpose" USING "purpose"::text::"TokenPurpose";
DROP TYPE "TokenPurpose_old";

DELETE FROM "email_templates" WHERE "key"::text IN ('positioning_request', 'stakeholder_evaluation_request', 'absence_alert');
UPDATE "documents" SET "type" = 'evaluation_request'
WHERE "type"::text IN ('positioning_request', 'stakeholder_evaluation_request');
UPDATE "documents" SET "type" = 'reminder' WHERE "type"::text = 'absence_alert';
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
CREATE TYPE "DocumentType" AS ENUM ('convocation', 'convention', 'attendance_sheet', 'certificate',
  'completion_certificate', 'program', 'pre_training_information', 'enrollment_confirmation', 'waitlist_notice',
  'waitlist_promotion', 'reminder', 'attendance_link', 'trainer_attendance_link', 'evaluation_request',
  'evaluation_reminder', 'session_cancellation');
ALTER TABLE "documents" ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "email_templates" ALTER COLUMN "key" TYPE "DocumentType" USING "key"::text::"DocumentType";
DROP TYPE "DocumentType_old";
COMMIT;
