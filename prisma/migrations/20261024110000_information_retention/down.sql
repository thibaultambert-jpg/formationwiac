-- Reverts 20261024110000_information_retention. Run manually with psql, then
-- delete the row of this migration from "_prisma_migrations".
-- Regulation versions are copied into the audit log before their table is
-- dropped (their files stay in storage).
BEGIN;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), "created_by_id", 'internal_regulation', 'internal_regulation', "id"::text,
       jsonb_build_object('version', "version", 'effectiveFrom', "effective_from", 'filePath', "file_path",
                          'sha256', "sha256"),
       "created_at"
FROM "internal_regulations";
DROP TABLE IF EXISTS "internal_regulations";

ALTER TABLE "users" DROP COLUMN IF EXISTS "left_at";
ALTER TABLE "trainings" DROP COLUMN IF EXISTS "access_delay", DROP COLUMN IF EXISTS "accessibility",
  DROP COLUMN IF EXISTS "evaluation_methods", DROP COLUMN IF EXISTS "teaching_methods";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "legal_hold_at", DROP COLUMN IF EXISTS "legal_hold_reason";
ALTER TABLE "participants" DROP COLUMN IF EXISTS "legal_hold_at", DROP COLUMN IF EXISTS "legal_hold_reason";
ALTER TABLE "documents" DROP COLUMN IF EXISTS "attachments";
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "administrative_contact",
  DROP COLUMN IF EXISTS "disability_referent_email", DROP COLUMN IF EXISTS "disability_referent_name",
  DROP COLUMN IF EXISTS "disability_referent_phone", DROP COLUMN IF EXISTS "dpo_contact", DROP COLUMN IF EXISTS "internal_retention_years",
  DROP COLUMN IF EXISTS "legal_notice", DROP COLUMN IF EXISTS "pedagogical_contact",
  DROP COLUMN IF EXISTS "privacy_notice", DROP COLUMN IF EXISTS "privacy_policy",
  DROP COLUMN IF EXISTS "technical_retention_months", DROP COLUMN IF EXISTS "token_retention_days";

-- PostgreSQL cannot drop an enum value: recreate the type without the new ones.
-- Documents of the new types keep their row under the closest older type.
DELETE FROM "email_templates" WHERE "key" IN ('pre_training_information', 'completion_certificate');
UPDATE "documents" SET "type" = 'certificate' WHERE "type" = 'completion_certificate';
UPDATE "documents" SET "type" = 'program' WHERE "type" = 'pre_training_information';
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
CREATE TYPE "DocumentType" AS ENUM ('convocation', 'convention', 'attendance_sheet', 'certificate', 'program',
  'enrollment_confirmation', 'waitlist_notice', 'waitlist_promotion', 'reminder', 'attendance_link',
  'trainer_attendance_link', 'evaluation_request', 'evaluation_reminder', 'session_cancellation');
ALTER TABLE "documents" ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "email_templates" ALTER COLUMN "key" TYPE "DocumentType" USING "key"::text::"DocumentType";
DROP TYPE "DocumentType_old";
COMMIT;
