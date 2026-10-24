import type { Metadata } from "next";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parisYear } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { formatDecimal } from "@/server/domain/numbers";
import { indicatorsByTraining } from "@/server/services/indicators";
import { readYear } from "./year";

export const metadata: Metadata = { title: "Indicateurs" };

const rate = (value: number | null) => (value === null ? "—" : `${formatDecimal(value)} %`);

// Result indicators per training and year (D1, Qualiopi indicator 2).
export default async function IndicatorsPage({ searchParams }: PageProps<"/admin/qualite/indicateurs">) {
  await requireRole(["admin"]);
  const year = readYear(await searchParams);
  const rows = await indicatorsByTraining(year);
  const current = parisYear(new Date());
  const years = Array.from({ length: 6 }, (_, index) => current - index);

  return (
    <div className="space-y-6">
      <form method="get" className="bg-muted flex flex-wrap items-end gap-4 rounded-xl border p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Année
          <select name="annee" defaultValue={year} className="bg-background h-9 rounded-md border px-2">
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Afficher
        </Button>
        <Button asChild variant="outline" className="ml-auto">
          <a href={`/admin/qualite/indicateurs/export?annee=${year}`}>
            <Download aria-hidden="true" />
            Indicateurs (CSV)
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`/admin/qualite/indicateurs/questionnaires?annee=${year}`}>
            <Download aria-hidden="true" />
            Toutes les réponses aux questionnaires (CSV)
          </a>
        </Button>
      </form>
      <p className="text-muted-foreground text-sm">
        Sessions commencées en {year}, hors annulées. Assiduité : heures signées sur heures prévues. Satisfaction : note
        moyenne du questionnaire à chaud. Acquis : stagiaires évalués « acquis » ou « partiellement acquis ». Ces
        indicateurs sont à publier sur le site public (indicateur Qualiopi 2).
      </p>
      {rows.length === 0 ? (
        <EmptyState>Aucune session sur cette année.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Formation</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Stagiaires</TableHead>
              <TableHead className="text-right">Satisfaction</TableHead>
              <TableHead className="text-right">Assiduité</TableHead>
              <TableHead className="text-right">Abandon</TableHead>
              <TableHead className="text-right">Absence</TableHead>
              <TableHead className="text-right">Réponse</TableHead>
              <TableHead className="text-right">Acquis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.trainingId}>
                <TableCell className="font-medium">{row.title}</TableCell>
                <TableCell className="text-right">{row.sessions}</TableCell>
                <TableCell className="text-right">{row.trainees}</TableCell>
                <TableCell className="text-right">
                  {row.satisfaction === null ? "—" : formatDecimal(row.satisfaction)}
                </TableCell>
                <TableCell className="text-right">{rate(row.attendanceRate)}</TableCell>
                <TableCell className="text-right">{rate(row.dropoutRate)}</TableCell>
                <TableCell className="text-right">{rate(row.absenceRate)}</TableCell>
                <TableCell className="text-right">{rate(row.responseRate)}</TableCell>
                <TableCell className="text-right">{rate(row.learningRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
