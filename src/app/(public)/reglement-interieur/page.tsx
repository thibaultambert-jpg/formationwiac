import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { currentRegulation } from "@/server/services/legal";

export const metadata: Metadata = { title: "Règlement intérieur" };

// Internal regulations in force (F3), readable by every trainee.
export default async function RegulationPage() {
  const regulation = await currentRegulation();
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">Règlement intérieur</h1>
      {regulation ? (
        <>
          <p className="text-sm">
            Version {regulation.version}, en vigueur depuis le {formatDate(regulation.effectiveFrom)}. Il
            s&apos;applique à tous les stagiaires pendant la durée de leur formation.
          </p>
          <Button asChild>
            <a href="/reglement-interieur/fichier">
              <Download aria-hidden="true" />
              Télécharger le règlement intérieur (PDF)
            </a>
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Le règlement intérieur n&apos;est pas encore publié.</p>
      )}
    </article>
  );
}
