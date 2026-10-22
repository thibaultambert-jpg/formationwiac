import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Formations" };

export default async function AdminTrainingsPage() {
  await requireRole(["admin"]);

  return (
    <>
      <PageHeader title="Formations" description="Catalogue des formations et programmes." />
      <ComingSoon lot={2} />
    </>
  );
}
