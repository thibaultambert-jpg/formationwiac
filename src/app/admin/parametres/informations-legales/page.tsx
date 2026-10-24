import type { Metadata } from "next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { legalNoticeText, privacyNoticeText, privacyPolicyText } from "@/server/domain/legal";
import { currentRegulation, legalOrganization } from "@/server/services/legal";
import { currentRetentionPolicy } from "@/server/services/privacy";
import { LegalForm, RegulationForm } from "./forms";

export const metadata: Metadata = { title: "Informations légales" };

export default async function LegalSettingsPage() {
  await requireRole(["admin"]);
  const [settings, organization, retention, regulations, inForce] = await Promise.all([
    db.organizationSettings.findUnique({ where: { id: 1 } }),
    legalOrganization(),
    currentRetentionPolicy(),
    db.internalRegulation.findMany({ orderBy: { version: "desc" } }),
    currentRegulation(),
  ]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="legal-title" className="space-y-4">
        <h2 id="legal-title" className="text-lg font-semibold">
          Contacts et textes légaux
        </h2>
        <LegalForm
          values={{
            dpoContact: organization.dpoContact,
            disabilityReferentName: settings?.disabilityReferentName ?? null,
            disabilityReferentEmail: settings?.disabilityReferentEmail ?? null,
            disabilityReferentPhone: settings?.disabilityReferentPhone ?? null,
            pedagogicalContact: settings?.pedagogicalContact ?? null,
            administrativeContact: settings?.administrativeContact ?? null,
            privacyNotice: privacyNoticeText(organization),
            privacyPolicy: privacyPolicyText(organization, retention),
            legalNotice: legalNoticeText(organization),
          }}
        />
      </section>

      <section aria-labelledby="regulation-title" className="space-y-4">
        <h2 id="regulation-title" className="text-lg font-semibold">
          Règlement intérieur
        </h2>
        <p className="text-muted-foreground text-sm">
          Chaque version est conservée avec son empreinte. La version en vigueur est publiée sur la page{" "}
          <a href="/reglement-interieur" className="text-primary underline underline-offset-4">
            /reglement-interieur
          </a>{" "}
          et jointe à l&apos;information préalable.
        </p>
        {regulations.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>En vigueur depuis</TableHead>
                <TableHead>Ajoutée le</TableHead>
                <TableHead>Empreinte SHA-256</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regulations.map((regulation) => (
                <TableRow key={regulation.id}>
                  <TableCell>
                    <a
                      href={`/fichiers/${regulation.filePath}?nom=reglement-interieur-v${regulation.version}.pdf`}
                      className="hover:underline"
                    >
                      Version {regulation.version}
                    </a>
                    {regulation.id === inForce?.id ? (
                      <span className="text-brand-teal-ink ml-2 text-xs font-semibold">En vigueur</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDate(regulation.effectiveFrom)}</TableCell>
                  <TableCell>{formatDate(regulation.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{regulation.sha256.slice(0, 16)}…</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">Aucune version publiée.</p>
        )}
        <RegulationForm />
      </section>
    </div>
  );
}
