import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES, TRAINER_TYPE_LABELS } from "@/lib/labels";
import { displayName, requireRole } from "@/server/auth/guards";
import { updateTrainer } from "../actions";
import { TrainerForm } from "../trainer-form";

export const metadata: Metadata = { title: "Formateur" };

export default async function TrainerPage({ params, searchParams }: PageProps<"/admin/formateurs/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { cree } = await searchParams;
  const trainer = await db.trainer.findUnique({
    where: { id },
    include: {
      user: true,
      sessions: {
        include: { session: { include: { training: true, slots: { select: { startsAt: true } } } } },
      },
    },
  });
  if (!trainer) notFound();

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
    </>
  );
}
