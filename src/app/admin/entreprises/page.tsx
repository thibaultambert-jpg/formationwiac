import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { CsvImportDialog } from "@/components/forms/csv-import-dialog";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar, param } from "@/components/layout/filter-bar";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { importCompaniesCsv } from "./actions";
import { CompaniesTabs } from "./tabs";

export const metadata: Metadata = { title: "Entreprises" };

export default async function CompaniesPage({ searchParams }: PageProps<"/admin/entreprises">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const q = param(params.q);
  const status = param(params.statut) || "actives";

  const digits = q.replace(/\s/g, "");
  const where: Prisma.CompanyWhereInput = {
    mergedIntoId: null,
    ...(status === "actives" ? { archivedAt: null } : status === "archivees" ? { archivedAt: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            ...(/^\d{3,14}$/.test(digits) ? [{ siret: { startsWith: digits } }] : []),
            { participants: { some: { email: { contains: q, mode: "insensitive" } } } },
            { participants: { some: { lastName: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const companies = await db.company.findMany({
    where,
    orderBy: { name: "asc" },
    take: 300,
    include: {
      mainContact: { select: { firstName: true, lastName: true } },
      _count: { select: { participants: true, billedEnrollments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Entreprises"
        description="Entreprises clientes et participants externes."
        actions={
          <>
            <Button asChild variant="outline">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download from a route handler */}
              <a href="/admin/entreprises/export">
                <Download aria-hidden="true" />
                Exporter les contacts (CSV)
              </a>
            </Button>
            <CsvImportDialog
              title="Importer des entreprises"
              templateHref="/admin/modeles-import/entreprises"
              action={importCompaniesCsv}
              description={
                <p>
                  Colonne obligatoire : <strong>raison_sociale</strong>. En option : siret, adresse, code_postal, ville,
                  email_facturation. Une entreprise déjà enregistrée (même SIRET, ou même raison sociale sans SIRET)
                  n&apos;est pas modifiée.
                </p>
              }
            />
            <Button asChild>
              <Link href="/admin/entreprises/nouvelle">
                <Plus aria-hidden="true" />
                Nouvelle entreprise
              </Link>
            </Button>
          </>
        }
      />
      <CompaniesTabs />
      <FilterBar
        resetHref="/admin/entreprises"
        fields={[
          { type: "search", name: "q", label: "Rechercher", value: q, placeholder: "Nom, SIRET, ville, contact" },
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
      {companies.length === 0 ? (
        <EmptyState>Aucune entreprise ne correspond à la recherche.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raison sociale</TableHead>
              <TableHead>SIRET</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Contact principal</TableHead>
              <TableHead className="text-right">Contacts</TableHead>
              <TableHead className="text-right">Inscriptions facturées</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/entreprises/${company.id}`} className="hover:underline">
                    {company.name}
                  </Link>
                  {company.archivedAt ? (
                    <Badge variant="secondary" className="ml-2">
                      Archivée
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{company.siret ?? "—"}</TableCell>
                <TableCell>{company.city ?? "—"}</TableCell>
                <TableCell>
                  {company.mainContact ? `${company.mainContact.firstName} ${company.mainContact.lastName}` : "—"}
                </TableCell>
                <TableCell className="text-right">{company._count.participants}</TableCell>
                <TableCell className="text-right">{company._count.billedEnrollments}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
