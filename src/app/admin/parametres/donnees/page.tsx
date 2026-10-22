import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { retentionCutoff } from "@/server/domain/privacy";
import { participantsPastRetention, proofFilesPastRetention } from "@/server/services/privacy";
import { AnonymizeExpiredForm, PurgeProofsForm, RetentionForm } from "./forms";

export const metadata: Metadata = { title: "Données personnelles" };

export default async function PersonalDataPage() {
  await requireRole(["admin"]);
  const settings = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { dataRetentionYears: true } });
  const years = settings?.dataRetentionYears ?? 5;
  const now = new Date();
  const [expired, proofs] = await Promise.all([
    participantsPastRetention(now, years),
    proofFilesPastRetention(now, years),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <section aria-labelledby="retention-title" className="space-y-3">
        <h2 id="retention-title" className="text-lg font-semibold">
          Durée de conservation
        </h2>
        <p className="text-muted-foreground text-sm">
          Les preuves de formation (inscriptions, émargements, évaluations, attestations) sont conservées pendant cette
          durée après la fin de la formation, puis les participants sont anonymisés et les fichiers de preuve supprimés.
        </p>
        <RetentionForm years={years} />
      </section>

      <section aria-labelledby="expired-title" className="space-y-3">
        <h2 id="expired-title" className="text-lg font-semibold">
          Participants à anonymiser
        </h2>
        <p className="text-muted-foreground text-sm">
          Dernière formation (ou création, sans formation) avant le {formatDate(retentionCutoff(now, years))}.
        </p>
        {expired.length === 0 ? (
          <p className="text-sm">Aucun participant n&apos;a dépassé la durée de conservation.</p>
        ) : (
          <>
            <ul className="divide-y rounded-md border text-sm">
              {expired.slice(0, 50).map((participant) => (
                <li key={participant.id} className="p-2">
                  <Link href={`/admin/entreprises/participants/${participant.id}`} className="hover:underline">
                    {participant.firstName} {participant.lastName}
                  </Link>
                  {participant.company ? (
                    <span className="text-muted-foreground"> · {participant.company.name}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {expired.length > 50 ? (
              <p className="text-muted-foreground text-sm">… et {expired.length - 50} autre(s).</p>
            ) : null}
            <AnonymizeExpiredForm count={expired.length} />
          </>
        )}
      </section>

      <section aria-labelledby="proofs-title" className="space-y-3">
        <h2 id="proofs-title" className="text-lg font-semibold">
          Fichiers de preuve expirés
        </h2>
        <p className="text-muted-foreground text-sm">
          Signatures et documents générés des sessions terminées avant cette date.
        </p>
        {proofs.count === 0 ? (
          <p className="text-sm">Aucun fichier à supprimer.</p>
        ) : (
          <PurgeProofsForm count={proofs.count} />
        )}
      </section>

      <section aria-labelledby="request-title" className="space-y-2 text-sm">
        <h2 id="request-title" className="text-lg font-semibold">
          Demande d&apos;accès ou d&apos;effacement
        </h2>
        <p className="text-muted-foreground">
          Ouvrez la fiche du participant depuis{" "}
          <Link href="/admin/entreprises/participants" className="text-primary underline underline-offset-4">
            la liste des participants
          </Link>{" "}
          : « Exporter ses données » produit un fichier JSON complet, « Anonymiser » efface son identité.
        </p>
      </section>
    </div>
  );
}
