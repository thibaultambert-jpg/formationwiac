import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar, param } from "@/components/layout/filter-bar";
import { FrontHero } from "@/components/layout/front-hero";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDate, formatMonth, toParisDateInput } from "@/lib/dates";
import { MODALITY_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth/guards";
import { formatDecimal } from "@/server/domain/numbers";
import { listCatalog } from "@/server/services/front";

export const metadata: Metadata = { title: "Catalogue" };

function nextMonths(count: number): { value: string; label: string }[] {
  const [year, month] = toParisDateInput(new Date()).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const y = year + Math.floor((month - 1 + index) / 12);
    const m = ((month - 1 + index) % 12) + 1;
    const label = formatMonth(y, m);
    return { value: `${y}-${String(m).padStart(2, "0")}`, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

export default async function CatalogPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const params = await searchParams;
  const filters = {
    q: param(params.q),
    theme: param(params.theme),
    modality: param(params.modalite),
    month: param(params.mois),
  };
  const [trainings, themes] = await Promise.all([
    listCatalog(filters, new Date()),
    db.theme.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <>
      <FrontHero
        eyebrow="Catalogue"
        title="Catalogue des"
        highlight="formations"
        description="Les formations ouvertes aux collaborateurs, avec leurs prochaines sessions."
      />
      <FilterBar
        resetHref="/"
        fields={[
          { type: "search", name: "q", label: "Rechercher", value: filters.q, placeholder: "Titre, objectif…" },
          {
            type: "select",
            name: "theme",
            label: "Thème",
            value: filters.theme,
            options: themes.map((theme) => ({ value: theme.id, label: theme.name })),
          },
          {
            type: "select",
            name: "modalite",
            label: "Modalité",
            value: filters.modality,
            allLabel: "Toutes",
            options: Object.entries(MODALITY_LABELS).map(([value, label]) => ({ value, label })),
          },
          { type: "select", name: "mois", label: "Mois", value: filters.month, options: nextMonths(12) },
        ]}
      />
      {trainings.length === 0 ? (
        <EmptyState>Aucune formation ne correspond à votre recherche pour le moment.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trainings.map((training) => {
            const next = training.upcoming[0];
            const remaining = training.upcoming.reduce((sum, session) => sum + session.remaining, 0);
            return (
              <li key={training.id}>
                <Link
                  href={`/formations/${training.slug}`}
                  className="group bg-card focus-visible:ring-ring border-l-primary hover:shadow-primary/10 flex h-full flex-col gap-3 rounded-xl border border-l-4 p-6 shadow-sm transition-all outline-none hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2"
                >
                  <div className="flex flex-wrap gap-2">
                    {training.theme ? <Badge variant="secondary">{training.theme.name}</Badge> : null}
                    <Badge variant="outline">{MODALITY_LABELS[training.modality]}</Badge>
                  </div>
                  <h2 className="text-lg leading-snug font-bold">{training.title}</h2>
                  <p className="text-muted-foreground line-clamp-3 text-sm">{training.objectives}</p>
                  <div className="text-foreground/80 mt-auto space-y-1.5 text-sm">
                    <p className="flex items-center gap-2">
                      <Clock aria-hidden="true" className="size-4" />
                      {formatDecimal(training.durationHours)} heures
                    </p>
                    {next?.firstSlot ? (
                      <p className="flex items-center gap-2">
                        <CalendarDays aria-hidden="true" className="size-4" />
                        Prochaine session le {formatDate(next.firstSlot)}
                        {training.upcoming.length > 1 ? ` (+${training.upcoming.length - 1})` : ""}
                      </p>
                    ) : null}
                    <p className="flex items-center gap-2">
                      <MapPin aria-hidden="true" className="size-4" />
                      {remaining > 0
                        ? `${remaining} place${remaining > 1 ? "s" : ""} disponible${remaining > 1 ? "s" : ""}`
                        : "Complet : liste d'attente"}
                    </p>
                  </div>
                  <span className="bg-primary text-primary-foreground group-hover:bg-primary/90 mt-2 inline-flex items-center gap-1.5 self-start rounded-full px-4 py-1.5 text-xs font-semibold">
                    Voir la formation
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
