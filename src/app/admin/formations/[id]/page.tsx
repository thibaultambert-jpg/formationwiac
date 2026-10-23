import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { decimalInput } from "@/server/domain/numbers";
import { deleteTraining, toggleTrainingActive, updateTraining } from "../actions";
import { TrainingForm } from "../training-form";

export const metadata: Metadata = { title: "Formation" };

export default async function TrainingPage({ params, searchParams }: PageProps<"/admin/formations/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { cree } = await searchParams;
  const training = await db.training.findUnique({
    where: { id },
    include: {
      sessions: { include: { slots: { select: { startsAt: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!training) notFound();

  const themes = await db.theme.findMany({
    where: { OR: [{ active: true }, { id: training.themeId ?? undefined }] },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title={training.title}
        description={
          <Link href="/admin/formations" className="hover:underline">
            ← Toutes les formations
          </Link>
        }
        actions={
          <>
            {training.active ? (
              <Button asChild>
                <Link href={`/admin/sessions/nouvelle?formation=${training.id}`}>
                  <CalendarPlus aria-hidden="true" />
                  Créer une session
                </Link>
              </Button>
            ) : null}
            <form action={toggleTrainingActive}>
              <input type="hidden" name="id" value={training.id} />
              <Button type="submit" variant="outline">
                {training.active ? "Archiver" : "Réactiver"}
              </Button>
            </form>
            {training.sessions.length === 0 ? (
              <form action={deleteTraining}>
                <input type="hidden" name="id" value={training.id} />
                <Button type="submit" variant="ghost" className="text-destructive">
                  Supprimer
                </Button>
              </form>
            ) : null}
          </>
        }
      />
      {cree ? (
        <Alert variant="success" className="mb-6">
          <AlertDescription>La formation a été créée.</AlertDescription>
        </Alert>
      ) : null}
      {!training.active ? (
        <Alert variant="warning" className="mb-6">
          <AlertDescription>
            Cette formation est archivée : elle n&apos;est plus proposée pour de nouvelles sessions.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1fr_20rem]">
        <TrainingForm
          action={updateTraining}
          themes={themes}
          training={{
            ...training,
            durationHours: decimalInput(training.durationHours) ?? "",
            priceExclTax: decimalInput(training.priceExclTax),
          }}
        />
        <aside aria-labelledby="training-sessions" className="space-y-3">
          <h2 id="training-sessions" className="font-semibold">
            Sessions ({training.sessions.length})
          </h2>
          {training.sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune session pour cette formation.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {training.sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <Link href={`/admin/sessions/${session.id}`} className="hover:underline">
                    <span className="font-medium">{session.reference}</span>
                    <span className="text-muted-foreground block">
                      {formatDateRange(session.slots.map((slot) => slot.startsAt))}
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
