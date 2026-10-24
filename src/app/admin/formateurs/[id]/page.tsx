import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateRange } from "@/lib/dates";
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_TONES,
  TRAINER_DOCUMENT_TYPE_LABELS,
  TRAINER_TYPE_LABELS,
} from "@/lib/labels";
import { documentState, missingSubcontractingContract } from "@/server/domain/trainer-documents";
import { displayName, requireRole } from "@/server/auth/guards";
import { updateTrainer } from "../actions";
import { TrainerForm } from "../trainer-form";
import { AddTrainerDocumentForm, ArchiveTrainerDocumentButton } from "./trainer-documents";

export const metadata: Metadata = { title: "Formateur" };

export default async function TrainerPage({ params, searchParams }: PageProps<"/admin/formateurs/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { cree } = await searchParams;
  const trainer = await db.trainer.findUnique({
    where: { id },
    include: {
      user: true,
      documents: { orderBy: { createdAt: "desc" } },
      sessions: {
        include: { session: { include: { training: true, slots: { select: { startsAt: true } } } } },
      },
    },
  });
  if (!trainer) notFound();

  const now = new Date();
  const active = trainer.documents.filter((document) => !document.archivedAt);
  const history = trainer.sessions
    .map((link) => link.session)
    .map((session) => ({
      ...session,
      firstSlot: session.slots.map((slot) => slot.startsAt).sort((a, b) => a.getTime() - b.getTime())[0],
    }))
    .sort((a, b) => (b.firstSlot?.getTime() ?? 0) - (a.firstSlot?.getTime() ?? 0));

  return (
    <>
      <PageHeader
        title={`${trainer.firstName} ${trainer.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/formateurs" className="hover:underline">
              ← Tous les formateurs
            </Link>
            <Badge variant="outline">{TRAINER_TYPE_LABELS[trainer.type]}</Badge>
            {!trainer.active ? <Badge variant="secondary">Inactif</Badge> : null}
          </span>
        }
      />
      {cree ? (
        <Alert variant="success" className="mb-6">
          <AlertDescription>La fiche formateur a été créée.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <TrainerForm
          action={updateTrainer}
          trainer={{
            ...trainer,
            user: trainer.user
              ? { id: trainer.user.id, label: displayName(trainer.user), description: trainer.user.email }
              : null,
          }}
        />
        <aside aria-labelledby="trainer-history" className="space-y-3">
          <h2 id="trainer-history" className="font-semibold">
            Sessions animées ({history.length})
          </h2>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune session pour le moment.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {history.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <Link href={`/admin/sessions/${session.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate font-medium">{session.training.title}</span>
                    <span className="text-muted-foreground block">
                      {session.reference} · {formatDateRange(session.slots.map((slot) => slot.startsAt))}
                    </span>
                  </Link>
                  <Badge variant={SESSION_STATUS_TONES[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <section aria-labelledby="trainer-documents" className="mt-10 space-y-4">
        <h2 id="trainer-documents" className="text-lg font-semibold">
          Justificatifs
        </h2>
        <p className="text-muted-foreground text-sm">
          Diplômes, certifications, CV et, pour un formateur externe, le contrat de sous-traitance avec sa date de
          validité (indicateurs Qualiopi 17, 21 et 27).
        </p>
        {missingSubcontractingContract(trainer, trainer.documents, now) ? (
          <Alert variant="warning">
            <AlertDescription>
              Formateur externe sans contrat de sous-traitance en vigueur : ajoutez-le ci-dessous.
            </AlertDescription>
          </Alert>
        ) : null}
        {active.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Justificatif</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Obtenu le</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((document) => {
                const state = documentState(document.expiresAt, now);
                return (
                  <TableRow key={document.id}>
                    <TableCell>
                      <a
                        href={`/fichiers/${document.filePath}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {document.label}
                      </a>
                    </TableCell>
                    <TableCell>{TRAINER_DOCUMENT_TYPE_LABELS[document.type]}</TableCell>
                    <TableCell>{document.issuedAt ? formatDate(document.issuedAt) : "—"}</TableCell>
                    <TableCell>
                      {document.expiresAt ? formatDate(document.expiresAt) : "—"}
                      {state !== "valid" ? (
                        <Badge variant={state === "expired" ? "destructive" : "warning"} className="ml-2">
                          {state === "expired" ? "Expiré" : "Expire bientôt"}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <ArchiveTrainerDocumentButton documentId={document.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm">Aucun justificatif.</p>
        )}
        <AddTrainerDocumentForm trainerId={trainer.id} />
      </section>
    </>
  );
}
