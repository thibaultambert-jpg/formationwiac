import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/layout/audit-trail";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDate, toParisDateInput } from "@/lib/dates";
import { IMPROVEMENT_STATUS_LABELS, IMPROVEMENT_STATUS_TONES } from "@/lib/labels";
import { displayName, requireRole } from "@/server/auth/guards";
import { complaintOptions, sessionOptions } from "../../data";
import { ComplaintForm, ImprovementForm } from "../../forms";

export const metadata: Metadata = { title: "Réclamation" };

export default async function ComplaintPage({ params, searchParams }: PageProps<"/admin/qualite/reclamations/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { cree } = await searchParams;
  const complaint = await db.complaint.findUnique({
    where: { id },
    include: { improvements: { orderBy: { createdAt: "asc" } } },
  });
  if (!complaint) notFound();
  const [sessions, complaints, logs] = await Promise.all([
    sessionOptions(),
    complaintOptions(),
    db.auditLog.findMany({
      where: { entity: "complaint", entityId: complaint.id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/admin/qualite/reclamations" className="text-muted-foreground text-sm hover:underline">
        ← Toutes les réclamations
      </Link>
      {cree ? (
        <Alert variant="success">
          <AlertDescription>La réclamation a été enregistrée.</AlertDescription>
        </Alert>
      ) : null}
      <ComplaintForm
        sessions={sessions}
        values={{
          id: complaint.id,
          receivedAt: toParisDateInput(complaint.receivedAt),
          complainant: complaint.complainant,
          channel: complaint.channel,
          sessionId: complaint.sessionId,
          subject: complaint.subject,
          description: complaint.description,
          treatment: complaint.treatment,
          response: complaint.response,
          status: complaint.status,
        }}
      />
      {complaint.closedAt ? (
        <p className="text-muted-foreground text-sm">Clôturée le {formatDate(complaint.closedAt)}.</p>
      ) : null}

      <section aria-labelledby="complaint-improvements" className="space-y-3">
        <h2 id="complaint-improvements" className="text-lg font-semibold">
          Actions d&apos;amélioration liées ({complaint.improvements.length})
        </h2>
        {complaint.improvements.length > 0 ? (
          <ul className="divide-y rounded-md border text-sm">
            {complaint.improvements.map((improvement) => (
              <li key={improvement.id} className="flex items-center justify-between gap-2 p-3">
                <span>{improvement.action}</span>
                <Badge variant={IMPROVEMENT_STATUS_TONES[improvement.status]}>
                  {IMPROVEMENT_STATUS_LABELS[improvement.status]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <ImprovementForm
          complaints={complaints}
          values={{
            source: "complaint",
            complaintId: complaint.id,
            origin: null,
            action: null,
            owner: null,
            dueDate: null,
            status: "planned",
            result: null,
          }}
        />
      </section>

      <section aria-labelledby="complaint-history" className="space-y-3">
        <h2 id="complaint-history" className="text-lg font-semibold">
          Historique
        </h2>
        <AuditTrail rows={logs.map((log) => ({ ...log, actor: log.user ? displayName(log.user) : "Système" }))} />
      </section>
    </div>
  );
}
