import type { Metadata } from "next";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDate, toParisDateInput } from "@/lib/dates";
import { IMPROVEMENT_SOURCE_LABELS, IMPROVEMENT_STATUS_LABELS, IMPROVEMENT_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { complaintOptions, improvementFilters } from "../data";
import { ImprovementForm } from "../forms";

export const metadata: Metadata = { title: "Amélioration continue" };

// Continuous improvement register (D11, Qualiopi indicator 32).
export default async function ImprovementsPage({ searchParams }: PageProps<"/admin/qualite/ameliorations">) {
  await requireRole(["admin"]);
  const filters = improvementFilters(await searchParams);
  const [actions, complaints] = await Promise.all([
    db.improvementAction.findMany({
      where: filters.where,
      include: { complaint: { select: { subject: true } } },
      orderBy: { createdAt: "desc" },
    }),
    complaintOptions(),
  ]);
  const now = new Date();

  return (
    <div className="space-y-8">
      <FilterBar
        resetHref="/admin/qualite/ameliorations"
        fields={[
          {
            type: "select",
            name: "statut",
            label: "Statut",
            value: filters.status,
            allLabel: "Tous",
            options: Object.entries(IMPROVEMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
      />
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <a href={`/admin/qualite/ameliorations/export${filters.status ? `?statut=${filters.status}` : ""}`}>
            <Download aria-hidden="true" />
            Exporter (CSV)
          </a>
        </Button>
      </div>
      {actions.length === 0 ? (
        <EmptyState>Aucune action d&apos;amélioration enregistrée.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {actions.map((item) => {
            const late =
              item.dueDate && item.dueDate < now && (item.status === "planned" || item.status === "in_progress");
            return (
              <li key={item.id} className="bg-card rounded-xl border p-4">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className="font-medium">{item.action}</span>
                    <Badge variant={IMPROVEMENT_STATUS_TONES[item.status]}>
                      {IMPROVEMENT_STATUS_LABELS[item.status]}
                    </Badge>
                    {late ? <Badge variant="destructive">En retard</Badge> : null}
                    <span className="text-muted-foreground text-sm">
                      {IMPROVEMENT_SOURCE_LABELS[item.source]}
                      {item.complaint ? ` · ${item.complaint.subject}` : ""}
                      {item.owner ? ` · ${item.owner}` : ""}
                      {item.dueDate ? ` · échéance ${formatDate(item.dueDate)}` : ""}
                    </span>
                  </summary>
                  <div className="pt-4">
                    <ImprovementForm
                      complaints={complaints}
                      values={{
                        id: item.id,
                        source: item.source,
                        complaintId: item.complaintId,
                        origin: item.origin,
                        action: item.action,
                        owner: item.owner,
                        dueDate: item.dueDate ? toParisDateInput(item.dueDate) : null,
                        status: item.status,
                        result: item.result,
                      }}
                    />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <section aria-labelledby="new-improvement" className="space-y-3">
        <h2 id="new-improvement" className="text-lg font-semibold">
          Nouvelle action d&apos;amélioration
        </h2>
        <ImprovementForm
          complaints={complaints}
          values={{
            source: "evaluation",
            complaintId: null,
            origin: null,
            action: null,
            owner: null,
            dueDate: null,
            status: "planned",
            result: null,
          }}
        />
      </section>
    </div>
  );
}
