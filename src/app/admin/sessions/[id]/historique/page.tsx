import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/layout/audit-trail";
import { db } from "@/lib/db";
import { displayName, requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Historique" };

export default async function SessionHistoryPage({ params }: PageProps<"/admin/sessions/[id]/historique">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await db.trainingSession.findUnique({ where: { id }, select: { id: true } });
  if (!session) notFound();

  const enrollments = await db.enrollment.findMany({
    where: { sessionId: session.id },
    select: { id: true, participant: { select: { firstName: true, lastName: true } } },
  });
  const names = new Map(
    enrollments.map((enrollment) => [
      enrollment.id,
      `${enrollment.participant.firstName} ${enrollment.participant.lastName}`,
    ]),
  );

  const logs = await db.auditLog.findMany({
    where: {
      OR: [
        { entity: "session", entityId: session.id },
        { entity: "enrollment", entityId: { in: [...names.keys()] } },
        // Enrollments moved away from this session.
        { entity: "enrollment", action: "move", before: { path: ["sessionId"], equals: session.id } },
      ],
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <AuditTrail
      rows={logs.map((log) => ({
        ...log,
        actor: log.user ? displayName(log.user) : "Système",
        subject: log.entity === "enrollment" ? names.get(log.entityId) : undefined,
      }))}
    />
  );
}
