-- Reverts 20261024090000_compliance_agreements. Run manually with psql, then
-- delete the row of this migration from "_prisma_migrations".
-- Enrollments in "pending_agreement" are set back to "confirmed" first (no row is deleted).
BEGIN;
ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollments_convention_id_fkey";
DROP TABLE IF EXISTS "conventions";
ALTER TABLE "enrollments"
  DROP COLUMN IF EXISTS "agreement_waived_at",
  DROP COLUMN IF EXISTS "agreement_waived_by_id",
  DROP COLUMN IF EXISTS "agreement_waiver_reason",
  DROP COLUMN IF EXISTS "convention_id",
  DROP COLUMN IF EXISTS "funding_type",
  DROP COLUMN IF EXISTS "participant_type";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "access_info", DROP COLUMN IF EXISTS "qualiopi_scope";
ALTER TABLE "trainings" DROP COLUMN IF EXISTS "things_to_bring";
DROP TYPE IF EXISTS "FundingType";
DROP TYPE IF EXISTS "ConventionStatus";

-- PostgreSQL cannot drop an enum value: recreate the types without it.
UPDATE "enrollments" SET "status" = 'confirmed' WHERE "status" = 'pending_agreement';
ALTER TYPE "EnrollmentStatus" RENAME TO "EnrollmentStatus_old";
CREATE TYPE "EnrollmentStatus" AS ENUM ('confirmed', 'waitlisted', 'cancelled', 'present', 'absent');
ALTER TABLE "enrollments" ALTER COLUMN "status" TYPE "EnrollmentStatus" USING "status"::text::"EnrollmentStatus";
DROP TYPE "EnrollmentStatus_old";

DELETE FROM "email_templates" WHERE "key" = 'convention';
UPDATE "documents" SET "type" = 'program' WHERE "type" = 'convention';
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
CREATE TYPE "DocumentType" AS ENUM ('convocation', 'attendance_sheet', 'certificate', 'program',
  'enrollment_confirmation', 'waitlist_notice', 'waitlist_promotion', 'reminder', 'attendance_link',
  'trainer_attendance_link', 'evaluation_request', 'evaluation_reminder', 'session_cancellation');
ALTER TABLE "documents" ALTER COLUMN "type" TYPE "DocumentType" USING "type"::text::"DocumentType";
ALTER TABLE "email_templates" ALTER COLUMN "key" TYPE "DocumentType" USING "key"::text::"DocumentType";
DROP TYPE "DocumentType_old";
COMMIT;
