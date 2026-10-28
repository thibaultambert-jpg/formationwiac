-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('training', 'funded_training', 'cancellation_fee');

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "funded_amount" DECIMAL(10,2),
ADD COLUMN     "funder_id" UUID,
ADD COLUMN     "funding_agreement_number" TEXT,
ADD COLUMN     "funding_subrogation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "kind" "InvoiceLineKind" NOT NULL DEFAULT 'training',
ADD COLUMN     "vat_rate" "VatRate" NOT NULL DEFAULT 'standard_20';

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_funder_id_fkey" FOREIGN KEY ("funder_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing lines are training lines: they keep the VAT of their invoice.
UPDATE "invoice_lines" l SET "vat_rate" = i."vat_rate" FROM "invoices" i WHERE i."id" = l."invoice_id";

-- CreateIndex
CREATE INDEX "enrollments_funder_id_idx" ON "enrollments"("funder_id");

-- An enrollment has one active line of each kind at most (funded part, remainder, cancellation fee).
DROP INDEX "invoice_lines_active_enrollment_key";
CREATE UNIQUE INDEX "invoice_lines_active_enrollment_kind_key" ON "invoice_lines"("enrollment_id", "kind") WHERE "active";
