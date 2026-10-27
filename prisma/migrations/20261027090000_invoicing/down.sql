-- Reverts 20261027090000_invoicing. Run manually with psql, then delete the row
-- of this migration from "_prisma_migrations".
-- Every invoice (with its lines) and the new columns are copied into the audit
-- log before they are dropped; the invoices themselves stay in Pennylane.
BEGIN;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), i."created_by_id", 'rollback_copy', 'invoice', i."id"::text,
       (to_jsonb(i) - 'id') || jsonb_build_object('lines',
         (SELECT coalesce(jsonb_agg(to_jsonb(l) - 'invoice_id'), '[]'::jsonb) FROM "invoice_lines" l WHERE l."invoice_id" = i."id")),
       now()
FROM "invoices" i;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'company', "id"::text,
       jsonb_build_object('vatNumber', "vat_number", 'pennylaneCustomerId', "pennylane_customer_id"), now()
FROM "companies" WHERE "vat_number" IS NOT NULL OR "pennylane_customer_id" IS NOT NULL;
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'training', "id"::text, jsonb_build_object('vatRate', "vat_rate"), now()
FROM "trainings" WHERE "vat_rate" <> 'standard_20';
INSERT INTO "audit_logs" ("id", "user_id", "action", "entity", "entity_id", "after", "created_at")
SELECT gen_random_uuid(), NULL, 'rollback_copy', 'organization_settings', "id"::text,
       jsonb_build_object('vatExemptionMention', "vat_exemption_mention"), now()
FROM "organization_settings" WHERE "vat_exemption_mention" IS NOT NULL;

DROP TABLE IF EXISTS "invoice_lines";
DROP TABLE IF EXISTS "invoices";
ALTER TABLE "companies" DROP COLUMN IF EXISTS "pennylane_customer_id", DROP COLUMN IF EXISTS "vat_number";
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "vat_exemption_mention";
ALTER TABLE "trainings" DROP COLUMN IF EXISTS "vat_rate";
DROP TYPE IF EXISTS "InvoiceStatus";
DROP TYPE IF EXISTS "VatRate";
COMMIT;
