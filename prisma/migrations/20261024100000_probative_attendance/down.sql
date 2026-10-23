-- Reverts 20261024100000_probative_attendance. Run manually with psql, then
-- delete the row of this migration from "_prisma_migrations".
-- Corrections are copied into the audit log before their table is dropped, so
-- that no trace is lost; signatures are kept.
BEGIN;
DROP TRIGGER IF EXISTS "attendances_append_only" ON "attendances";
DROP TRIGGER IF EXISTS "trainer_signatures_append_only" ON "trainer_signatures";
DROP TRIGGER IF EXISTS "attendance_corrections_append_only" ON "attendance_corrections";
DROP FUNCTION IF EXISTS "forbid_attendance_rewrite"();

INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), "author_user_id", 'attendance_correction', 'enrollment', "enrollment_id"::text,
       jsonb_build_object('slotId', "slot_id", 'state', "state", 'eventAt', "event_at", 'reason', "reason",
                          'authorTrainerId', "author_trainer_id", 'recordHash', "record_hash"),
       "created_at"
FROM "attendance_corrections";
DROP TABLE IF EXISTS "attendance_corrections";
DROP TYPE IF EXISTS "AttendanceState";

ALTER TABLE "access_tokens" DROP CONSTRAINT IF EXISTS "access_tokens_slot_id_fkey";
ALTER TABLE "access_tokens" DROP COLUMN IF EXISTS "consumed_at", DROP COLUMN IF EXISTS "slot_id",
  DROP COLUMN IF EXISTS "valid_from";
ALTER TABLE "attendances" DROP COLUMN IF EXISTS "record_hash", DROP COLUMN IF EXISTS "signature_sha256",
  DROP COLUMN IF EXISTS "token_id", DROP COLUMN IF EXISTS "user_agent";
ALTER TABLE "trainer_signatures" DROP COLUMN IF EXISTS "ip_address", DROP COLUMN IF EXISTS "record_hash",
  DROP COLUMN IF EXISTS "signature_sha256", DROP COLUMN IF EXISTS "token_id", DROP COLUMN IF EXISTS "user_agent";
ALTER TABLE "documents" DROP COLUMN IF EXISTS "sha256";
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "attendance_margin_after",
  DROP COLUMN IF EXISTS "attendance_margin_before";

-- Checkbox attestations become participant-link signatures (the enum value cannot be dropped).
UPDATE "attendances" SET "method" = 'participant_link' WHERE "method" = 'attestation_checkbox';
ALTER TYPE "SignatureMethod" RENAME TO "SignatureMethod_old";
CREATE TYPE "SignatureMethod" AS ENUM ('participant_link', 'trainer_device');
ALTER TABLE "attendances" ALTER COLUMN "method" TYPE "SignatureMethod" USING "method"::text::"SignatureMethod";
DROP TYPE "SignatureMethod_old";
COMMIT;
