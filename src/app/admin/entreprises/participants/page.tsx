import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar, param } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { PARTICIPANT_TYPE_LABELS } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { CompaniesTabs } from "../tabs";

export const metadata: Metadata = { title: "Participants" };

export default async function ParticipantsPage({ searchParams }: PageProps<"/admin/entreprises/participants">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const q = param(params.q);
  const type = param(params.type);
  const status = param(params.statut) || "actifs";

  const where: Prisma.ParticipantWhereInput = {
    ...(type === "internal" || type === "external" ? { type } : {}),
    ...(status === "actifs"
      ? { archivedAt: null }
      : status === "archives"
        ? { archivedAt: { not: null }, anonymizedAt: null }
        : status === "anonymises"
          ? { anonymizedAt: { not: null } }
          : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const participants = await db.participant.findMany({
    where,
    include: { company: { select: { id: true, name: true } }, _count: { select: { enrollments: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 300,
  });

  return (
    <>
      <PageHeader title="Entreprises" description="Entreprises clientes et participants externes." />
      <CompaniesTabs />
      <FilterBar
        resetHref="/admin/entreprises/participants"
        fields={[
          { type: "search", name: "q", label: "Rechercher", value: q, placeholder: "Nom, email, entreprise" },
          {
            type: "select",
            name: "type",
            label: "Type",
            value: type,
            options: Object.entries(PARTICIPANT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
          },
          {
            type: "select",
            name: "statut",
            label: "Statut",
            value: status === "tous" ? "" : status,
            options: [
              { value: "actifs", label: "Actifs" },
              { value: "archives", label: "Archivés" },
              { value: "anonymises", label: "Anonymisés" },
            ],
          },
        ]}
      />
      {participants.length === 0 ? (
        <EmptyState>Aucun participant ne correspond à la recherche.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participant</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead className="text-right">Inscriptions</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((participant) => (
              <TableRow key={participant.id}>
                <TableCell>
                  <Link
                    href={`/admin/entreprises/participants/${participant.id}`}
                    className="font-medium hover:underline"
                  >
                    {participant.firstName} {participant.lastName}
                  </Link>
                  <span className="text-muted-foreground block text-xs">
                    {participant.anonymizedAt ? "—" : participant.email}
                  </span>
                </TableCell>
                <TableCell>{PARTICIPANT_TYPE_LABELS[participant.type]}</TableCell>
                <TableCell>
                  {participant.company ? (
                    <Link href={`/admin/entreprises/${participant.company.id}`} className="hover:underline">
                      {participant.company.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">{participant._count.enrollments}</TableCell>
                <TableCell>
                  {participant.anonymizedAt ? (
                    <Badge variant="secondary">Anonymisé</Badge>
                  ) : participant.archivedAt ? (
                    <Badge variant="outline">Archivé</Badge>
                  ) : (
                    <Badge variant="success">Actif</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
