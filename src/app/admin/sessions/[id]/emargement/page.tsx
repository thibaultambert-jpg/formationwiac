import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Émargement" };

export default async function SessionEmargementPage() {
  await requireRole(["admin"]);
  return <ComingSoon lot={4} />;
}
