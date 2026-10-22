import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: "Organisme" };

export default async function OrganizationPage() {
  await requireRole(["admin"]);
  const organization = await db.organizationSettings.findUnique({ where: { id: 1 } });

  return (
    <section aria-labelledby="organisme-title" className="space-y-4">
      <h2 id="organisme-title" className="text-lg font-semibold">
        Coordonnées de l&apos;organisme
      </h2>
      <p className="text-muted-foreground text-sm">
        Ces informations figurent sur les convocations, feuilles d&apos;émargement et attestations.
      </p>
      <OrganizationForm organization={organization} />
    </section>
  );
}
