import Link from "next/link";
import { notFound } from "next/navigation";
import { TabNav } from "@/components/layout/tab-nav";
import { Badge } from "@/components/ui/badge";
import { formatDateRange } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { getSessionDetail } from "../session-data";

export default async function SessionLayout({ children, params }: LayoutProps<"/admin/sessions/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await getSessionDetail(id);
  if (!session) notFound();

  const base = `/admin/sessions/${session.id}`;
  const fill = Math.round((session.seats / session.capacityMax) * 100);

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link href="/admin/sessions" className="text-muted-foreground text-sm hover:underline">
          ← Toutes les sessions
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{session.training.title}</h1>
          <Badge variant={SESSION_STATUS_TONES[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Badge>
          {session.qualiopiScope ? <Badge variant="info">Périmètre Qualiopi</Badge> : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {session.reference} · {formatDateRange(session.slots.map((slot) => slot.startsAt))} · {session.seats}/
          {session.capacityMax} inscrits ({fill} %)
          {session.waitlisted > 0 ? ` · ${session.waitlisted} en liste d'attente` : ""}
        </p>
      </div>
      <TabNav
        label="Onglets de la session"
        items={[
          { href: base, label: "Informations", exact: true, alsoActiveOn: [`${base}/modifier`] },
          { href: `${base}/inscrits`, label: `Inscrits (${session.seats + session.waitlisted})` },
          ...(session.openToExternal ? [{ href: `${base}/conventions`, label: "Conventions" }] : []),
          { href: `${base}/conformite`, label: "Conformité" },
          { href: `${base}/emargement`, label: "Émargement" },
          { href: `${base}/documents`, label: "Documents" },
          { href: `${base}/evaluations`, label: "Évaluations" },
          { href: `${base}/historique`, label: "Historique" },
        ]}
      />
      {children}
    </>
  );
}
