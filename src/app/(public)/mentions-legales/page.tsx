import { connection } from "next/server";
import type { Metadata } from "next";
import { LegalText } from "@/components/legal/legal-text";
import { legalNoticeText } from "@/server/domain/legal";
import { legalOrganization } from "@/server/services/legal";

export const metadata: Metadata = { title: "Mentions légales" };

// Public legal notice (F1).
export default async function LegalNoticePage() {
  // Rendered per request: the texts and the version in force come from the settings.
  await connection();
  const organization = await legalOrganization();
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">Mentions légales</h1>
      <LegalText text={legalNoticeText(organization)} />
    </article>
  );
}
