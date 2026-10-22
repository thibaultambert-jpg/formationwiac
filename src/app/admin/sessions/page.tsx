import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Sessions" };

export default async function AdminSessionsPage() {
  await requireRole(["admin"]);

  return (
    <>
      <PageHeader title="Sessions" description="Planification des sessions, inscriptions et documents." />
      <ComingSoon lot={2} />
    </>
  );
}
