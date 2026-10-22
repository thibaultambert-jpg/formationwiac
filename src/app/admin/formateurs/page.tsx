import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Formateurs" };

export default async function AdminTrainersPage() {
  await requireRole(["admin"]);

  return (
    <>
      <PageHeader title="Formateurs" description="Formateurs internes et externes." />
      <ComingSoon lot={2} />
    </>
  );
}
