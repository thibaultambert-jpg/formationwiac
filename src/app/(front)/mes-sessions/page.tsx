import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Mes sessions" };

export default async function MySessionsPage() {
  await requireRole(["trainer", "admin"]);

  return (
    <>
      <PageHeader title="Mes sessions" description="Les sessions que vous animez et leur émargement." />
      <ComingSoon lot={4} />
    </>
  );
}
