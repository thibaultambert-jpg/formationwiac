import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CsvImportDialog } from "@/components/forms/csv-import-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar, param } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { TRAINER_TYPE_LABELS } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { importTrainersCsv } from "./actions";

export const metadata: Metadata = { title: "Formateurs" };

export default async function TrainersPage({ searchParams }: PageProps<"/admin/formateurs">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const q = param(params.q);
  const type = param(params.type);
  const status = param(params.statut) || "actifs";

  const where: Prisma.TrainerWhereInput = {
    ...(type === "internal" || type === "external" ? { type } : {}),
    ...(status === "actifs" ? { active: true } : status === "inactifs" ? { active: false } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { specialties: { has: q } },
          ],
        }
      : {}),
  };
  const trainers = await db.trainer.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { _count: { select: { sessions: true } } },
  });

  return (
    <>
      <PageHeader
        title="Formateurs"
        description="Formateurs internes (liés à un compte Google) et externes."
        actions={
          <>
            <CsvImportDialog
              title="Importer des formateurs"
              templateHref="/admin/modeles-import/formateurs"
              action={importTrainersCsv}
              description={
                <>
                  <p>
                    Colonnes obligatoires : <strong>prenom</strong>, <strong>nom</strong>, <strong>email</strong>. En
                    option : type (interne ou externe, externe par défaut), telephone, societe, specialites (séparées
                    par des virgules), actif (oui/non).
                  </p>
                  <p>
                    Un formateur interne est lié au compte Google de même email (connecté au moins une fois). Un
                    formateur déjà enregistré avec le même email n&apos;est pas modifié.
                  </p>
                </>
              }
            />
            <Button asChild>
              <Link href="/admin/formateurs/nouveau">
                <Plus aria-hidden="true" />
                Nouveau formateur
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar
        resetHref="/admin/formateurs"
        fields={[
          { type: "search", name: "q", label: "Rechercher", value: q, placeholder: "Nom, email, société, spécialité" },
          {
            type: "select",
            name: "type",
            label: "Type",
            value: type,
            options: Object.entries(TRAINER_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            type: "select",
            name: "statut",
            label: "Statut",
            value: status === "tous" ? "" : status,
            options: [
              { value: "actifs", label: "Actifs" },
              { value: "inactifs", label: "Inactifs" },
            ],
          },
        ]}
      />
      {trainers.length === 0 ? (
        <EmptyState>Aucun formateur ne correspond aux filtres.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Spécialités</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trainers.map((trainer) => (
              <TableRow key={trainer.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/formateurs/${trainer.id}`} className="hover:underline">
                    {trainer.firstName} {trainer.lastName}
                  </Link>
                  {trainer.company ? (
                    <span className="text-muted-foreground block text-xs">{trainer.company}</span>
                  ) : null}
                </TableCell>
                <TableCell>{TRAINER_TYPE_LABELS[trainer.type]}</TableCell>
                <TableCell>{trainer.email}</TableCell>
                <TableCell className="max-w-64 truncate">{trainer.specialties.join(", ") || "—"}</TableCell>
                <TableCell className="text-right">{trainer._count.sessions}</TableCell>
                <TableCell>
                  <Badge variant={trainer.active ? "success" : "secondary"}>
                    {trainer.active ? "Actif" : "Inactif"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
