import type { Metadata } from "next";
import { AuditTrail } from "@/components/layout/audit-trail";
import { FilterBar, param } from "@/components/layout/filter-bar";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parisDateTimeToUtc } from "@/lib/dates";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from "@/lib/labels";
import { displayName, requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Journal d'audit" };

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/parametres/journal">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const entity = param(params.entite);
  const action = param(params.action);
  const from = param(params.du);
  const to = param(params.au);
  const fromDate = from ? parisDateTimeToUtc(from, "00:00") : null;
  const toDate = to ? parisDateTimeToUtc(to, "23:59") : null;

  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entity } : {}),
    ...(action ? { action } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: new Date(toDate.getTime() + 59_999) } : {}),
          },
        }
      : {}),
  };
  const logs = await db.auditLog.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  return (
    <section aria-labelledby="journal-title" className="space-y-4">
      <h2 id="journal-title" className="text-lg font-semibold">
        Journal d&apos;audit
      </h2>
      <p className="text-muted-foreground text-sm">
        Créations, modifications, envois et émargements (300 derniers événements filtrés).
      </p>
      <FilterBar
        resetHref="/admin/parametres/journal"
        fields={[
          {
            type: "select",
            name: "entite",
            label: "Objet",
            value: entity,
            options: Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            type: "select",
            name: "action",
            label: "Action",
            value: action,
            allLabel: "Toutes",
            options: Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
          },
          { type: "date", name: "du", label: "Du", value: from },
          { type: "date", name: "au", label: "Au", value: to },
        ]}
      />
      <AuditTrail rows={logs.map((log) => ({ ...log, actor: log.user ? displayName(log.user) : "Système" }))} />
    </section>
  );
}
