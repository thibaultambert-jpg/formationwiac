import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Download, List, Plus } from "lucide-react";
import { CsvImportDialog } from "@/components/forms/csv-import-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDateRange, parisMonthBounds, toParisDateInput } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { importSessionsCsv } from "./actions";
import {
  listSessions,
  readSessionFilters,
  sessionFiltersToQuery,
  sessionListInclude,
  sessionWhere,
  waitlistCounts,
} from "@/server/services/session-queries";
import { SessionCalendar } from "./session-calendar";

export const metadata: Metadata = { title: "Sessions" };

function href(base: string, query: Record<string, string>) {
  const search = new URLSearchParams(query).toString();
  return search ? `${base}?${search}` : base;
}

export default async function SessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const filters = readSessionFilters(params);
  const view = params.vue === "calendrier" ? "calendar" : "table";
  const filterQuery = sessionFiltersToQuery(filters);

  const [trainings, trainers] = await Promise.all([
    db.training.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.trainer.findMany({ orderBy: [{ lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
  ]);

  const monthParam =
    typeof params.mois === "string" && /^\d{4}-\d{2}$/.test(params.mois)
      ? params.mois
      : toParisDateInput(new Date()).slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);

  const sessions =
    view === "calendar"
      ? await db.trainingSession.findMany({
          where: sessionWhere(filters, parisMonthBounds(year, month)),
          include: sessionListInclude,
        })
      : await listSessions(filters);
  const waitlists =
    view === "table" ? await waitlistCounts(sessions.map((session) => session.id)) : new Map<string, number>();

  return (
    <>
      <PageHeader
        title="Sessions"
        description="Planification des sessions, inscriptions et documents."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={href("/admin/sessions/export", filterQuery)}>
                <Download aria-hidden="true" />
                Exporter (CSV)
              </a>
            </Button>
            <CsvImportDialog
              title="Importer des sessions"
              templateHref="/admin/modeles-import/sessions"
              action={importSessionsCsv}
              description={
                <>
                  <p>
                    Une ligne par session, créée en brouillon. Colonnes obligatoires : <strong>formation</strong>{" "}
                    (intitulé exact ou slug), <strong>creneaux</strong> (« JJ/MM/AAAA HH:MM-HH:MM », séparés par « | »)
                    et <strong>capacite_max</strong>.
                  </p>
                  <p>
                    En option : capacite_min, lieu, lien_visio (lieu ou lien obligatoire), date_limite (JJ/MM/AAAA),
                    internes, externes, qualiopi (oui/non), formateurs (emails séparés par des virgules), infos_acces,
                    notes_internes.
                  </p>
                </>
              }
            />
            <Button asChild>
              <Link href="/admin/sessions/nouvelle">
                <Plus aria-hidden="true" />
                Nouvelle session
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex gap-1" role="group" aria-label="Affichage">
        <Button asChild variant={view === "table" ? "secondary" : "ghost"} size="sm">
          <Link href={href("/admin/sessions", filterQuery)} aria-current={view === "table" ? "page" : undefined}>
            <List aria-hidden="true" />
            Tableau
          </Link>
        </Button>
        <Button asChild variant={view === "calendar" ? "secondary" : "ghost"} size="sm">
          <Link
            href={href("/admin/sessions", { ...filterQuery, vue: "calendrier", mois: monthParam })}
            aria-current={view === "calendar" ? "page" : undefined}
          >
            <CalendarDays aria-hidden="true" />
            Calendrier
          </Link>
        </Button>
      </div>
      <FilterBar
        resetHref={view === "calendar" ? `/admin/sessions?vue=calendrier&mois=${monthParam}` : "/admin/sessions"}
        hidden={view === "calendar" ? { vue: "calendrier", mois: monthParam } : undefined}
        fields={[
          {
            type: "select",
            name: "formation",
            label: "Formation",
            value: filters.trainingId,
            allLabel: "Toutes",
            options: trainings.map((training) => ({ value: training.id, label: training.title })),
          },
          {
            type: "select",
            name: "formateur",
            label: "Formateur",
            value: filters.trainerId,
            options: trainers.map((trainer) => ({
              value: trainer.id,
              label: `${trainer.firstName} ${trainer.lastName}`,
            })),
          },
          {
            type: "select",
            name: "statut",
            label: "Statut",
            value: filters.status,
            options: Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          ...(view === "table"
            ? ([
                { type: "date", name: "du", label: "Du", value: filters.from },
                { type: "date", name: "au", label: "Au", value: filters.to },
              ] as const)
            : []),
        ]}
      />

      {view === "calendar" ? (
        <SessionCalendar
          year={year}
          month={month}
          sessions={sessions}
          hrefForMonth={(y, m) =>
            href("/admin/sessions", { ...filterQuery, vue: "calendrier", mois: `${y}-${String(m).padStart(2, "0")}` })
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState>Aucune session ne correspond aux filtres.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Référence</TableHead>
              <TableHead>Formation</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Formateurs</TableHead>
              <TableHead className="text-right">Inscrits</TableHead>
              <TableHead>Ouverture</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const waitlisted = waitlists.get(session.id) ?? 0;
              return (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/sessions/${session.id}`} className="hover:underline">
                      {session.reference}
                    </Link>
                  </TableCell>
                  <TableCell>{session.training.title}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateRange(session.slots.map((slot) => slot.startsAt))}
                  </TableCell>
                  <TableCell>
                    {session.trainers.map((link) => `${link.trainer.firstName} ${link.trainer.lastName}`).join(", ") ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {session._count.enrollments} / {session.capacityMax}
                    {waitlisted > 0 ? (
                      <span className="text-muted-foreground block text-xs">+{waitlisted} en attente</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {[session.openToInternal ? "Internes" : null, session.openToExternal ? "Externes" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SESSION_STATUS_TONES[session.status]}>
                      {SESSION_STATUS_LABELS[session.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
