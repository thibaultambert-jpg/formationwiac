import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";
import { NewCompanyForm } from "../company-forms";

export const metadata: Metadata = { title: "Nouvelle entreprise" };

export default async function NewCompanyPage() {
  await requireRole(["admin"]);
  return (
    <>
      <PageHeader title="Nouvelle entreprise" />
      <NewCompanyForm />
    </>
  );
}
