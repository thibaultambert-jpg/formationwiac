import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function AdminDashboardPage() {
  await requireRole(["admin"]);

  return (
    <>
      <PageHeader title="Tableau de bord" description="Sessions à venir, taux de remplissage et points d'attention." />
      <ComingSoon lot={4} />
    </>
  );
}
