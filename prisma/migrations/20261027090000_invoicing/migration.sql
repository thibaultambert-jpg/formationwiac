-- CreateEnum
CREATE TYPE "VatRate" AS ENUM ('exempt', 'standard_20');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'sent', 'failed', 'detached');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "pennylane_customer_id" TEXT,
ADD COLUMN     "vat_number" TEXT;

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "vat_exemption_mention" TEXT;

-- AlterTable
ALTER TABLE "trainings" ADD COLUMN     "vat_rate" "VatRate" NOT NULL DEFAULT 'standard_20';

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "vat_rate" "VatRate" NOT NULL,
    "total_excl_tax" DECIMAL(10,2) NOT NULL,
    "pennylane_invoice_id" TEXT,
    "pennylane_url" TEXT,
    "error" TEXT,
    "created_by_id" UUID,
    "sent_at" TIMESTAMPTZ,
    "detached_at" TIMESTAMPTZ,
    "detach_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price_excl_tax" DECIMAL(10,2) NOT NULL,
    "proposed_price" DECIMAL(10,2) NOT NULL,
    "adjustment_reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_pennylane_invoice_id_key" ON "invoices"("pennylane_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_session_id_company_id_idx" ON "invoices"("session_id", "company_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_enrollment_id_idx" ON "invoice_lines"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_pennylane_customer_id_key" ON "companies"("pennylane_customer_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- An enrollment is on one active invoice at most: detached invoices release it.
CREATE UNIQUE INDEX "invoice_lines_active_enrollment_key" ON "invoice_lines"("enrollment_id") WHERE "active";

-- Row Level Security on every table (no policy: only the server role reads it).
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
