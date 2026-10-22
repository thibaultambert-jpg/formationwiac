import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Paramètres" };

export default async function AdminSettingsPage() {
  await requireRole(["admin"]);

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Organisme, thèmes, modèles d'emails, questionnaires et utilisateurs."
      />
      <ComingSoon lot={2} />
    </>
  );
}
