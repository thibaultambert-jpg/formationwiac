import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { legalHoldAction } from "@/app/admin/parametres/donnees/actions";
import { EmptyState } from "@/components/layout/empty-state";
import { LegalHoldPanel } from "@/components/privacy/legal-hold-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_TONES,
  FUNDING_TYPE_LABELS,
  PARTICIPANT_TYPE_LABELS,
} from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { sessionCompliance } from "@/server/services/compliance";

export const metadata: Metadata = { title: "Conformité" };

export default async function CompliancePage({ params }: PageProps<"/admin/sessions/[id]/conformite">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await db.trainingSession.findUnique({
    where: { id },
    select: { id: true, legalHoldReason: true, legalHoldAt: true },
  });
  if (!session) notFound();
  const { inScope, rows, blockingMissing } = await sessionCompliance(id);

  return (
    <div className="space-y-6">
      <Alert variant={blockingMissing > 0 ? "warning" : undefined}>
        <AlertDescription>
          {inScope
            ? "Session dans le périmètre Qualiopi : les obligations sont bloquantes pour tous les stagiaires."
            : "Session hors périmètre Qualiopi : les obligations sont bloquantes pour les externes et recommandées pour les internes."}{" "}
          {blockingMissing > 0
            ? `${blockingMissing} obligation(s) bloquante(s) à régulariser.`
            : "Aucune obligation bloquante en attente."}
        </AlertDescription>
      </Alert>
      {rows.length === 0 ? (
        <EmptyState>Aucun inscrit pour le moment.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stagiaire</TableHead>
              <TableHead>Type et financement</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Obligations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ enrollment, requirements }) => (
              <TableRow key={enrollment.id}>
                <TableCell className="font-medium">
                  {enrollment.participant.firstName} {enrollment.participant.lastName}
                </TableCell>
                <TableCell>
                  {PARTICIPANT_TYPE_LABELS[enrollment.participantType]}
                  <span className="text-muted-foreground block text-xs">
                    {FUNDING_TYPE_LABELS[enrollment.fundingType]}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={ENROLLMENT_STATUS_TONES[enrollment.status]}>
                    {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {requirements.length === 0 ? (
                    <span className="text-muted-foreground text-sm">Aucune</span>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {requirements.map((requirement) => (
                        <li key={requirement.key} className="flex items-center gap-2">
                          {requirement.satisfied ? (
                            <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-700" />
                          ) : requirement.blocking ? (
                            <CircleAlert aria-hidden="true" className="text-destructive size-4" />
                          ) : (
                            <CircleDashed aria-hidden="true" className="text-muted-foreground size-4" />
                          )}
                          <span>
                            {requirement.label}
                            <span className="sr-only">
                              {requirement.satisfied
                                ? " : fait"
                                : requirement.blocking
                                  ? " : manquant, bloquant"
                                  : " : recommandé"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <LegalHoldPanel
        action={legalHoldAction}
        kind="session"
        id={session.id}
        hold={{ reason: session.legalHoldReason, at: session.legalHoldAt }}
      />
    </div>
  );
}
