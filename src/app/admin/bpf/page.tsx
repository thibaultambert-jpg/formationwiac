import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parisYear } from "@/lib/dates";
import { FUNDING_TYPE_LABELS, PARTICIPANT_TYPE_LABELS } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { bpfSummary, type BpfLine } from "@/server/domain/bpf";
import { formatDecimal, formatEuros } from "@/server/domain/numbers";
import { bpfRows } from "@/server/services/bpf";
import { readBpfFilters } from "./filters";

export const metadata: Metadata = { title: "Bilan pédagogique et financier" };

function LinesTable({ caption, lines, label }: { caption: string; lines: BpfLine[]; label: (key: string) => string }) {
  return (
    <Table>
      <caption className="text-muted-foreground mb-2 text-left text-sm">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Catégorie</TableHead>
          <TableHead className="text-right">Stagiaires</TableHead>
          <TableHead className="text-right">Heures-stagiaires</TableHead>
          <TableHead className="text-right">Produits (HT)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              Aucune donnée.
            </TableCell>
          </TableRow>
        ) : (
          lines.map((line) => (
            <TableRow key={line.key}>
              <TableCell>{label(line.key)}</TableCell>
              <TableCell className="text-right">{line.trainees}</TableCell>
              <TableCell className="text-right">{formatDecimal(line.hours)}</TableCell>
              <TableCell className="text-right">{formatEuros(line.revenue)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export default async function BpfPage({ searchParams }: PageProps<"/admin/bpf">) {
  await requireRole(["admin"]);
  const filters = readBpfFilters(await searchParams);
  const summary = bpfSummary(await bpfRows(filters.year), filters.includeInternal);
  const current = parisYear(new Date());
  const years = Array.from({ length: 6 }, (_, index) => current - index);
  const query = `annee=${filters.year}${filters.includeInternal ? "&internes=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Bilan pédagogique et financier"
        description="Données pour le BPF annuel : stagiaires, heures émargées et produits, par financement et par public."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/admin/bpf/export?${query}`}>
                <Download aria-hidden="true" />
                Synthèse (CSV)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/admin/bpf/export?${query}&vue=detail`}>
                <Download aria-hidden="true" />
                Détail par stagiaire (CSV)
              </a>
            </Button>
          </>
        }
      />
      <form method="get" className="bg-brand-lavender/40 mb-6 flex flex-wrap items-end gap-4 rounded-xl p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Année civile
          <select name="annee" defaultValue={filters.year} className="bg-background h-9 rounded-md border px-2">
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="internes" value="1" defaultChecked={filters.includeInternal} />
          Inclure les collaborateurs internes
        </label>
        <Button type="submit" variant="outline">
          Afficher
        </Button>
      </form>
      <p className="mb-6 text-sm">
        <span className="font-semibold">{summary.total.trainees}</span> stagiaire(s),{" "}
        <span className="font-semibold">{formatDecimal(summary.total.hours)}</span> heure(s)-stagiaires,{" "}
        <span className="font-semibold">{formatEuros(summary.total.revenue)}</span> de produits HT en {filters.year}.
        Dont {formatDecimal(summary.subcontracted.hours)} heure(s)-stagiaires animées par des formateurs externes
        (sous-traitance). Seules les heures signées (émargement ou attestation) comptent ; un stagiaire sans heure
        signée n&apos;est pas compté.
      </p>
      <div className="grid gap-8 lg:grid-cols-2">
        <LinesTable
          caption="Par type de financement"
          lines={summary.byFunding}
          label={(key) => FUNDING_TYPE_LABELS[key as keyof typeof FUNDING_TYPE_LABELS] ?? key}
        />
        <LinesTable
          caption="Par public"
          lines={summary.byPublic}
          label={(key) => PARTICIPANT_TYPE_LABELS[key as keyof typeof PARTICIPANT_TYPE_LABELS] ?? key}
        />
      </div>
    </>
  );
}
