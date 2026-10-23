-- Compliance audit, lot 2 (C2, C3, C5, C6, C7): per-slot single-use attendance
-- links, append-only signatures with SHA-256 fingerprints, attendance
-- corrections, frozen documents. Reversible: see down.sql in this folder.
-- Existing rows are kept as they are (no fingerprint is invented for them).

-- CreateEnum
CREATE TYPE "AttendanceState" AS ENUM ('present', 'absent', 'late', 'left_early');

-- AlterEnum
ALTER TYPE "SignatureMethod" ADD VALUE 'attestation_checkbox';

-- AlterTable
ALTER TABLE "access_tokens" ADD COLUMN     "consumed_at" TIMESTAMPTZ,
ADD COLUMN     "slot_id" UUID,
ADD COLUMN     "valid_from" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "record_hash" TEXT,
ADD COLUMN     "signature_sha256" TEXT,
ADD COLUMN     "token_id" UUID,
ADD COLUMN     "user_agent" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "sha256" TEXT;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "attendance_margin_after" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "attendance_margin_before" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "trainer_signatures" ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "record_hash" TEXT,
ADD COLUMN     "signature_sha256" TEXT,
ADD COLUMN     "token_id" UUID,
ADD COLUMN     "user_agent" TEXT;

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "state" "AttendanceState" NOT NULL,
    "event_at" TIMESTAMPTZ,
    "reason" TEXT NOT NULL,
    "author_user_id" UUID,
    "author_trainer_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "record_hash" TEXT NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_corrections_enrollment_id_slot_id_created_at_idx" ON "attendance_corrections"("enrollment_id", "slot_id", "created_at");

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "session_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "session_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security (no policy: server-side access only, see *_enable_rls).
ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;

-- Append-only attendance records (C5): no UPDATE or DELETE, whatever the role,
-- except inside the GDPR retention purge, which sets
-- `SET LOCAL app.retention_purge = 'on'` in its transaction.
CREATE OR REPLACE FUNCTION "forbid_attendance_rewrite"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.retention_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Les émargements ne peuvent être ni modifiés ni supprimés (% sur %)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "attendances_append_only" BEFORE UPDATE OR DELETE ON "attendances"
  FOR EACH ROW EXECUTE FUNCTION "forbid_attendance_rewrite"();
CREATE TRIGGER "trainer_signatures_append_only" BEFORE UPDATE OR DELETE ON "trainer_signatures"
  FOR EACH ROW EXECUTE FUNCTION "forbid_attendance_rewrite"();
CREATE TRIGGER "attendance_corrections_append_only" BEFORE UPDATE OR DELETE ON "attendance_corrections"
  FOR EACH ROW EXECUTE FUNCTION "forbid_attendance_rewrite"();

-- Supabase API roles (when present) cannot rewrite them either.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE UPDATE, DELETE ON "attendances", "trainer_signatures", "attendance_corrections" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE, DELETE ON "attendances", "trainer_signatures", "attendance_corrections" FROM authenticated;
  END IF;
END $$;
