import { connection } from "next/server";
import type { Metadata } from "next";
import { LegalText } from "@/components/legal/legal-text";
import { privacyPolicyText } from "@/server/domain/legal";
import { legalOrganization } from "@/server/services/legal";
import { currentRetentionPolicy } from "@/server/services/privacy";

export const metadata: Metadata = { title: "Confidentialité" };

// Public privacy policy (E2, F2).
export default async function PrivacyPage() {
  // Rendered per request: the texts and the version in force come from the settings.
  await connection();
  const [organization, retention] = await Promise.all([legalOrganization(), currentRetentionPolicy()]);
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">Politique de confidentialité</h1>
      <LegalText text={privacyPolicyText(organization, retention)} />
    </article>
  );
}
