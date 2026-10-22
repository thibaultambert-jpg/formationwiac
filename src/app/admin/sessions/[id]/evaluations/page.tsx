import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Évaluations" };

export default async function SessionEvaluationsPage() {
  await requireRole(["admin"]);
  return <ComingSoon lot={4} />;
}
