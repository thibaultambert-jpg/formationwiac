import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { toggleCompanyArchive, toggleContactArchive } from "../actions";
import { ContactDialog, EditCompanyForm, MergeCompanyForm } from "../company-forms";

export const metadata: Metadata = { title: "Entreprise" };

export default async function CompanyPage({ params, searchParams }: PageProps<"/admin/entreprises/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { cree } = await searchParams;
  const company = await db.company.findUnique({
    where: { id },
    include: {
      participants: { orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { lastName: "asc" }] },
    },
  });
  if (!company) notFound();
  if (company.mergedIntoId) redirect(`/admin/entreprises/${company.mergedIntoId}`);

  const participantIds = company.participants.map((participant) => participant.id);
  const [enrollments, similar] = await Promise.all([
    db.enrollment.findMany({
      where: { OR: [{ participantId: { in: participantIds } }, { billingCompanyId: company.id }] },
      include: {
        participant: true,
        session: { include: { training: true, slots: { select: { startsAt: true } } } },
      },
      orderBy: { enrolledAt: "desc" },
    }),
    db.company.findMany({
      where: {
        id: { not: company.id },
        mergedIntoId: null,
        name: { contains: company.name.split(/\s+/)[0], mode: "insensitive" },
      },
      take: 5,
    }),
  ]);

  return (
    <>
      <PageHeader
        title={company.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/entreprises" className="hover:underline">
              ← Toutes les entreprises
            </Link>
            {company.archivedAt ? <Badge variant="secondary">Archivée</Badge> : null}
          </span>
        }
        actions={
          <form action={toggleCompanyArchive}>
            <input type="hidden" name="id" value={company.id} />
            <Button type="submit" variant="outline">
              {company.archivedAt ? "Réactiver" : "Archiver"}
            </Button>
          </form>
        }
      />
      {cree ? (
        <Alert variant="success" className="mb-6">
          <AlertDescription>L&apos;entreprise a été créée. Ajoutez maintenant ses contacts.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="company-info" className="space-y-4">
          <h2 id="company-info" className="text-lg font-semibold">
            Informations
          </h2>
          <EditCompanyForm
            company={company}
            contacts={company.participants
              .filter((participant) => !participant.archivedAt)
              .map((participant) => ({ id: participant.id, name: `${participant.firstName} ${participant.lastName}` }))}
          />
        </section>

        <section aria-labelledby="company-contacts" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="company-contacts" className="text-lg font-semibold">
              Contacts ({company.participants.length})
            </h2>
            <ContactDialog companyId={company.id} />
          </div>
          {company.participants.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun contact pour cette entreprise.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {company.participants.map((participant) => (
                <li
                  key={participant.id}
                  className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {participant.firstName} {participant.lastName}
                      {participant.id === company.mainContactId ? (
                        <Badge variant="info" className="ml-2">
                          Contact principal
                        </Badge>
                      ) : null}
                      {participant.archivedAt ? (
                        <Badge variant="secondary" className="ml-2">
                          Archivé
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground truncate">
                      {[participant.email, participant.jobTitle, participant.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <ContactDialog companyId={company.id} contact={participant} />
                    <form action={toggleContactArchive}>
                      <input type="hidden" name="participantId" value={participant.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {participant.archivedAt ? "Réactiver" : "Archiver"}
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-md border p-4">
            <h3 className="font-medium">Fusionner un doublon</h3>
            {similar.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                Doublons potentiels :{" "}
                {similar.map((other, index) => (
                  <span key={other.id}>
                    {index > 0 ? ", " : null}
                    <Link href={`/admin/entreprises/${other.id}`} className="underline underline-offset-4">
                      {other.name}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
            <MergeCompanyForm targetId={company.id} />
          </div>
        </section>
      </div>

      <section aria-labelledby="company-history" className="mt-10 space-y-4">
        <h2 id="company-history" className="text-lg font-semibold">
          Historique des formations ({enrollments.length})
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune inscription pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Formation</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  <TableCell>{enrollment.session.training.title}</TableCell>
                  <TableCell>
                    <Link href={`/admin/sessions/${enrollment.session.id}/inscrits`} className="hover:underline">
                      {enrollment.session.reference}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDateRange(enrollment.session.slots.map((slot) => slot.startsAt))}</TableCell>
                  <TableCell>
                    {enrollment.participant.firstName} {enrollment.participant.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ENROLLMENT_STATUS_TONES[enrollment.status]}>
                      {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
