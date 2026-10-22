import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Entreprises" };

export default async function AdminCompaniesPage() {
  await requireRole(["admin"]);

  return (
    <>
      <PageHeader title="Entreprises" description="Entreprises clientes et participants externes." />
      <ComingSoon lot={2} />
    </>
  );
}
