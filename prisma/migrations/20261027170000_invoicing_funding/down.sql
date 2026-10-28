-- Reverts 20261027170000_invoicing_funding. Run manually with psql, then delete
-- the row of this migration from "_prisma_migrations".
-- The funding details and the kind of the invoice lines are copied into the
-- audit log before they are dropped. Restoring the single-line index fails if
-- an enrollment has several active lines: detach the extra invoices first.
BEGIN;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'enrollment', "id"::text,
       jsonb_build_object('fundingSubrogation', "funding_subrogation", 'funderId', "funder_id",
                          'fundingAgreementNumber', "funding_agreement_number", 'fundedAmount', "funded_amount"),
       now()
FROM "enrollments"
WHERE "funding_subrogation" OR "funder_id" IS NOT NULL OR "funding_agreement_number" IS NOT NULL OR "funded_amount" IS NOT NULL;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'invoice_line', "id"::text,
       jsonb_build_object('kind', "kind", 'vatRate', "vat_rate"), now()
FROM "invoice_lines" WHERE "kind" <> 'training';

DROP INDEX IF EXISTS "invoice_lines_active_enrollment_kind_key";
CREATE UNIQUE INDEX "invoice_lines_active_enrollment_key" ON "invoice_lines"("enrollment_id") WHERE "active";
DROP INDEX IF EXISTS "enrollments_funder_id_idx";
ALTER TABLE "enrollments" DROP CONSTRAINT IF EXISTS "enrollments_funder_id_fkey";
ALTER TABLE "enrollments" DROP COLUMN IF EXISTS "funded_amount", DROP COLUMN IF EXISTS "funder_id",
  DROP COLUMN IF EXISTS "funding_agreement_number", DROP COLUMN IF EXISTS "funding_subrogation";
ALTER TABLE "invoice_lines" DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "vat_rate";
DROP TYPE IF EXISTS "InvoiceLineKind";
COMMIT;
