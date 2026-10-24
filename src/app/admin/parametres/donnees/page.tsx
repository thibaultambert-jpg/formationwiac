import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { retentionCutoff } from "@/server/domain/privacy";
import { currentRetentionPolicy, participantsPastRetention, proofFilesPastRetention } from "@/server/services/privacy";
import { AnonymizeExpiredForm, PurgeProofsForm, PurgeTechnicalForm, RetentionForm } from "./forms";

export const metadata: Metadata = { title: "Données personnelles" };

export default async function PersonalDataPage() {
  await requireRole(["admin"]);
  const policy = await currentRetentionPolicy();
  const now = new Date();
  const [expired, proofs, held] = await Promise.all([
    participantsPastRetention(now, policy),
    proofFilesPastRetention(now, policy),
    Promise.all([
      db.trainingSession.findMany({
        where: { legalHoldAt: { not: null } },
        select: { id: true, reference: true, legalHoldReason: true, legalHoldAt: true },
        orderBy: { legalHoldAt: "desc" },
      }),
      db.participant.findMany({
        where: { legalHoldAt: { not: null } },
        select: { id: true, firstName: true, lastName: true, legalHoldReason: true, legalHoldAt: true },
        orderBy: { legalHoldAt: "desc" },
      }),
    ]),
  ]);
  const [heldSessions, heldParticipants] = held;

  return (
    <div className="max-w-3xl space-y-8">
      <section aria-labelledby="retention-title" className="space-y-3">
        <h2 id="retention-title" className="text-lg font-semibold">
          Durée de conservation
        </h2>
        <p className="text-muted-foreground text-sm">
          Les preuves de formation (inscriptions, émargements, évaluations, attestations) des externes sont conservées
          après leur dernière formation ; celles des internes après leur départ (date de départ saisie sur le compte
          utilisateur). Ensuite les participants sont anonymisés et les fichiers de preuve supprimés. Les traces
          techniques des signatures et les liens expirés sont purgés plus tôt. La tâche planifiée applique ces règles
          chaque jour ; une conservation légale (contrôle, litige) les suspend.
        </p>
        <RetentionForm policy={policy} />
      </section>

      <section aria-labelledby="expired-title" className="space-y-3">
        <h2 id="expired-title" className="text-lg font-semibold">
          Participants à anonymiser
        </h2>
        <p className="text-muted-foreground text-sm">
          Externes dont la dernière formation (ou la création, sans formation) est antérieure au{" "}
          {formatDate(retentionCutoff(now, policy.externalYears))} ; internes partis depuis plus de{" "}
          {policy.internalYears} an(s).
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
          Signatures et documents générés des sessions terminées avant le{" "}
          {formatDate(retentionCutoff(now, policy.externalYears))} dont tous les participants sont anonymisés.
        </p>
        {proofs.count === 0 ? (
          <p className="text-sm">Aucun fichier à supprimer.</p>
        ) : (
          <PurgeProofsForm count={proofs.count} />
        )}
      </section>

      <section aria-labelledby="technical-title" className="space-y-3">
        <h2 id="technical-title" className="text-lg font-semibold">
          Traces techniques et liens expirés
        </h2>
        <p className="text-muted-foreground text-sm">
          Adresses IP et navigateurs des signatures de plus de {policy.technicalMonths} mois (l&apos;empreinte des
          émargements ne les inclut pas), liens expirés depuis plus de {policy.tokenDays} jour(s).
        </p>
        <PurgeTechnicalForm />
      </section>

      <section aria-labelledby="hold-title" className="space-y-3">
        <h2 id="hold-title" className="text-lg font-semibold">
          Conservations légales en cours
        </h2>
        {heldSessions.length + heldParticipants.length === 0 ? (
          <p className="text-sm">
            Aucune. Une conservation se place depuis la fiche d&apos;une session ou d&apos;un participant.
          </p>
        ) : (
          <ul className="divide-y rounded-md border text-sm">
            {heldSessions.map((session) => (
              <li key={session.id} className="p-2">
                <Link href={`/admin/sessions/${session.id}/conformite`} className="hover:underline">
                  Session {session.reference}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · depuis le {formatDate(session.legalHoldAt!)} · {session.legalHoldReason}
                </span>
              </li>
            ))}
            {heldParticipants.map((participant) => (
              <li key={participant.id} className="p-2">
                <Link href={`/admin/entreprises/participants/${participant.id}`} className="hover:underline">
                  {participant.firstName} {participant.lastName}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · depuis le {formatDate(participant.legalHoldAt!)} · {participant.legalHoldReason}
                </span>
              </li>
            ))}
          </ul>
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
          : « Exporter ses données » produit une archive ZIP (données JSON avec l&apos;historique, signatures, documents
          envoyés, pièces pédagogiques), « Anonymiser » efface son identité.
        </p>
      </section>
    </div>
  );
}
