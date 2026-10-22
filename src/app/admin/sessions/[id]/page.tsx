import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatSlot, formatWeekday } from "@/lib/dates";
import { MODALITY_LABELS, TRAINER_TYPE_LABELS } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { formatDecimal } from "@/server/domain/numbers";
import { canCancel, canDeleteSession, canPublish, canUnpublish } from "@/server/domain/session-status";
import { totalHours } from "@/server/domain/slots";
import { deleteSession, duplicateSession, publishSession, unpublishSession } from "../actions";
import { getSessionDetail } from "../session-data";
import { CancelSessionDialog } from "./cancel-dialog";

export const metadata: Metadata = { title: "Session" };

export default async function SessionInfoPage({ params, searchParams }: PageProps<"/admin/sessions/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const query = await searchParams;
  const session = await getSessionDetail(id);
  if (!session) notFound();

  const editable = session.status !== "cancelled" && session.status !== "completed";
  const hours = totalHours(session.slots);

  return (
    <div className="space-y-6">
      {query.cree ? (
        <Alert variant="success">
          <AlertDescription>
            Session {session.reference} créée en brouillon. Publiez-la quand elle est prête, puis ajoutez les inscrits.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.modifie ? (
        <Alert variant="success">
          <AlertDescription>Session enregistrée.</AlertDescription>
        </Alert>
      ) : null}
      {session.status === "cancelled" ? (
        <Alert variant="warning">
          <AlertDescription>
            Session annulée le {session.cancelledAt ? formatDate(session.cancelledAt) : "—"} :{" "}
            {session.cancellationReason}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <Button asChild>
            <Link href={`/admin/sessions/${session.id}/modifier`}>
              <Pencil aria-hidden="true" />
              Modifier
            </Link>
          </Button>
        ) : null}
        {canPublish(session.status) ? (
          <form action={publishSession}>
            <input type="hidden" name="id" value={session.id} />
            <Button type="submit" variant="secondary">
              Publier
            </Button>
          </form>
        ) : null}
        {canUnpublish(session.status) ? (
          <form action={unpublishSession}>
            <input type="hidden" name="id" value={session.id} />
            <Button type="submit" variant="outline">
              Repasser en brouillon
            </Button>
          </form>
        ) : null}
        <form action={duplicateSession}>
          <input type="hidden" name="id" value={session.id} />
          <Button type="submit" variant="outline">
            <Copy aria-hidden="true" />
            Dupliquer
          </Button>
        </form>
        {canCancel(session.status) ? (
          <CancelSessionDialog sessionId={session.id} enrolled={session.seats + session.waitlisted} />
        ) : null}
        {canDeleteSession(session.total) ? (
          <form action={deleteSession}>
            <input type="hidden" name="id" value={session.id} />
            <Button type="submit" variant="ghost" className="text-destructive">
              Supprimer
            </Button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="info-general" className="space-y-3 rounded-md border p-4">
          <h2 id="info-general" className="font-semibold">
            Informations
          </h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Formation</dt>
            <dd>
              <Link href={`/admin/formations/${session.training.id}`} className="hover:underline">
                {session.training.title}
              </Link>
              <span className="text-muted-foreground block">
                {MODALITY_LABELS[session.training.modality]} · {formatDecimal(session.training.durationHours)} h prévues
              </span>
            </dd>
            <dt className="text-muted-foreground">Lieu</dt>
            <dd>{session.location ?? "—"}</dd>
            <dt className="text-muted-foreground">Lien visio</dt>
            <dd className="break-all">
              {session.videoLink ? (
                <a
                  href={session.videoLink}
                  className="text-primary underline underline-offset-4"
                  target="_blank"
                  rel="noreferrer"
                >
                  {session.videoLink}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">Capacité</dt>
            <dd>
              {session.capacityMin !== null ? `${session.capacityMin} min · ` : ""}
              {session.capacityMax} max
            </dd>
            <dt className="text-muted-foreground">Date limite</dt>
            <dd>{session.registrationDeadline ? formatDateTime(session.registrationDeadline) : "Aucune"}</dd>
            <dt className="text-muted-foreground">Ouverture</dt>
            <dd>
              {[session.openToInternal ? "Collaborateurs" : null, session.openToExternal ? "Externes" : null]
                .filter(Boolean)
                .join(" et ")}
            </dd>
            <dt className="text-muted-foreground">Formateurs</dt>
            <dd>
              {session.trainers.length === 0
                ? "—"
                : session.trainers.map((link) => (
                    <Link
                      key={link.trainerId}
                      href={`/admin/formateurs/${link.trainerId}`}
                      className="block hover:underline"
                    >
                      {link.trainer.firstName} {link.trainer.lastName} (
                      {TRAINER_TYPE_LABELS[link.trainer.type].toLowerCase()})
                    </Link>
                  ))}
            </dd>
          </dl>
          {session.internalNotes ? (
            <div className="border-t pt-3 text-sm">
              <p className="text-muted-foreground mb-1">Notes internes</p>
              <p className="whitespace-pre-line">{session.internalNotes}</p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="info-slots" className="space-y-3 rounded-md border p-4">
          <h2 id="info-slots" className="font-semibold">
            Créneaux ({session.slots.length} · {formatDecimal(hours)} h)
          </h2>
          <ol className="space-y-1 text-sm">
            {session.slots.map((slot, index) => (
              <li key={slot.id} className="flex gap-2">
                <span className="text-muted-foreground w-8">n° {index + 1}</span>
                <span className="capitalize">{formatWeekday(slot.startsAt)}</span>
                <span>{formatSlot(slot.startsAt, slot.endsAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
