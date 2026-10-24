import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { FilterBar } from "@/components/layout/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, toParisDateInput } from "@/lib/dates";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { complaintFilters, sessionOptions } from "../data";
import { ComplaintForm } from "../forms";

export const metadata: Metadata = { title: "Réclamations" };

// Complaints register (D10, Qualiopi indicator 31).
export default async function ComplaintsPage({ searchParams }: PageProps<"/admin/qualite/reclamations">) {
  await requireRole(["admin"]);
  const filters = complaintFilters(await searchParams);
  const [complaints, sessions] = await Promise.all([
    db.complaint.findMany({
      where: filters.where,
      include: { session: { select: { reference: true } }, _count: { select: { improvements: true } } },
      orderBy: { receivedAt: "desc" },
    }),
    sessionOptions(),
  ]);

  return (
    <div className="space-y-8">
      <FilterBar
        resetHref="/admin/qualite/reclamations"
        fields={[
          {
            type: "select",
            name: "statut",
            label: "Statut",
            value: filters.status,
            allLabel: "Tous",
            options: Object.entries(COMPLAINT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
      />
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <a href={`/admin/qualite/reclamations/export${filters.status ? `?statut=${filters.status}` : ""}`}>
            <Download aria-hidden="true" />
            Exporter (CSV)
          </a>
        </Button>
      </div>
      {complaints.length === 0 ? (
        <EmptyState>Aucune réclamation enregistrée.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reçue le</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Émetteur</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Actions liées</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {complaints.map((complaint) => (
              <TableRow key={complaint.id}>
                <TableCell>{formatDate(complaint.receivedAt)}</TableCell>
                <TableCell>
                  <Link href={`/admin/qualite/reclamations/${complaint.id}`} className="font-medium hover:underline">
                    {complaint.subject}
                  </Link>
                </TableCell>
                <TableCell>{complaint.complainant}</TableCell>
                <TableCell>{complaint.session?.reference ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={COMPLAINT_STATUS_TONES[complaint.status]}>
                    {COMPLAINT_STATUS_LABELS[complaint.status]}
                  </Badge>
                </TableCell>
                <TableCell>{complaint._count.improvements}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <section aria-labelledby="new-complaint" className="space-y-3">
        <h2 id="new-complaint" className="text-lg font-semibold">
          Nouvelle réclamation
        </h2>
        <ComplaintForm
          sessions={sessions}
          values={{
            receivedAt: toParisDateInput(new Date()),
            complainant: null,
            channel: null,
            sessionId: null,
            subject: null,
            description: null,
            treatment: null,
            response: null,
            status: "open",
          }}
        />
      </section>
    </div>
  );
}
