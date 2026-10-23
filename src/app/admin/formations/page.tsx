import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar, param } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MODALITY_LABELS } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { formatDecimal, formatEuros } from "@/server/domain/numbers";

export const metadata: Metadata = { title: "Formations" };

export default async function TrainingsPage({ searchParams }: PageProps<"/admin/formations">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const q = param(params.q);
  const theme = param(params.theme);
  const modality = param(params.modalite);
  const status = param(params.statut) || "actives";

  const where: Prisma.TrainingWhereInput = {
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    ...(theme ? { themeId: theme } : {}),
    ...(modality in MODALITY_LABELS ? { modality: modality as keyof typeof MODALITY_LABELS } : {}),
    ...(status === "actives" ? { active: true } : status === "archivees" ? { active: false } : {}),
  };

  const [trainings, themes] = await Promise.all([
    db.training.findMany({
      where,
      orderBy: { title: "asc" },
      include: { theme: true, _count: { select: { sessions: true } } },
    }),
    db.theme.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <>
      <PageHeader
        title="Formations"
        description="Catalogue des formations et programmes."
        actions={
          <Button asChild>
            <Link href="/admin/formations/nouvelle">
              <Plus aria-hidden="true" />
              Nouvelle formation
            </Link>
          </Button>
        }
      />
      <FilterBar
        resetHref="/admin/formations"
        fields={[
          { type: "search", name: "q", label: "Rechercher", value: q, placeholder: "Titre" },
          {
            type: "select",
            name: "theme",
            label: "Thème",
            value: theme,
            options: themes.map((item) => ({ value: item.id, label: item.name })),
          },
          {
            type: "select",
            name: "modalite",
            label: "Modalité",
            value: modality,
            allLabel: "Toutes",
            options: Object.entries(MODALITY_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            type: "select",
            name: "statut",
            label: "Statut",
            value: status === "toutes" ? "" : status,
            allLabel: "Toutes",
            options: [
              { value: "actives", label: "Actives" },
              { value: "archivees", label: "Archivées" },
            ],
          },
        ]}
      />
      {trainings.length === 0 ? (
        <EmptyState>Aucune formation ne correspond aux filtres.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titre</TableHead>
              <TableHead>Thème</TableHead>
              <TableHead>Modalité</TableHead>
              <TableHead className="text-right">Durée</TableHead>
              <TableHead className="text-right">Prix HT</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainings.map((training) => (
              <TableRow key={training.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/formations/${training.id}`} className="hover:underline">
                    {training.title}
                  </Link>
                </TableCell>
                <TableCell>{training.theme?.name ?? "—"}</TableCell>
                <TableCell>{MODALITY_LABELS[training.modality]}</TableCell>
                <TableCell className="text-right">{formatDecimal(training.durationHours)} h</TableCell>
                <TableCell className="text-right">{formatEuros(training.priceExclTax)}</TableCell>
                <TableCell className="text-right">{training._count.sessions}</TableCell>
                <TableCell>
                  <Badge variant={training.active ? "success" : "secondary"}>
                    {training.active ? "Active" : "Archivée"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {training.active ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/sessions/nouvelle?formation=${training.id}`}>Créer une session</Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
