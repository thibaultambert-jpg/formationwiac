import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import {
  CONVENTION_STATUS_LABELS,
  CONVENTION_STATUS_TONES,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_TONES,
} from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { missingOrganizationIdentifiers } from "@/server/domain/compliance";
import { formatEuros } from "@/server/domain/numbers";
import { sessionAgreements } from "@/server/services/conventions";
import { cancelConventionAction, sendConventionAction } from "./actions";
import { CreateConventionDialog, RecordSignedDialog, RefreshConventionDialog } from "./convention-dialogs";

export const metadata: Metadata = { title: "Conventions" };

function fileLink(path: string, name: string, label: string) {
  return (
    <Button asChild size="sm" variant="ghost">
      <a href={`/fichiers/${path}?nom=${encodeURIComponent(name)}`}>
        <Download aria-hidden="true" />
        {label}
      </a>
    </Button>
  );
}

export default async function ConventionsPage({ params }: PageProps<"/admin/sessions/[id]/conventions">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await db.trainingSession.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!session) notFound();
  const [{ companies, withoutCompany }, organization] = await Promise.all([
    sessionAgreements(id),
    db.organizationSettings.findUnique({ where: { id: 1 } }),
  ]);
  const missing = missingOrganizationIdentifiers({
    siret: organization?.siret ?? null,
    activityDeclarationNumber: organization?.activityDeclarationNumber ?? null,
  });

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Une inscription externe est confirmée à la signature de la convention de formation de son entreprise, ou par une
        dérogation motivée (onglet Inscrits).
      </p>
      {missing.length > 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            Renseignez le {missing.join(" et le ")} dans{" "}
            <Link href="/admin/parametres/organisme" className="underline">
              Paramètres › Organisme
            </Link>{" "}
            : ils figurent obligatoirement sur la convention.
          </AlertDescription>
        </Alert>
      ) : null}
      {withoutCompany.length > 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            {withoutCompany.length} inscription(s) externe(s) sans entreprise : renseignez l&apos;entreprise payeuse
            pour pouvoir établir leur convention.
          </AlertDescription>
        </Alert>
      ) : null}
      {companies.length === 0 ? (
        <EmptyState>Aucun participant externe dans cette session.</EmptyState>
      ) : (
        <ul className="space-y-4">
          {companies.map((company) => {
            const uncovered = company.enrollments.filter(
              (enrollment) => !enrollment.convention || enrollment.convention.status === "cancelled",
            );
            return (
              <li key={company.id} className="bg-card space-y-4 rounded-xl border p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">
                    <Link href={`/admin/entreprises/${company.id}`} className="hover:underline">
                      {company.name}
                    </Link>
                  </h2>
                  {uncovered.length > 0 && session.status !== "cancelled" ? (
                    <CreateConventionDialog sessionId={session.id} company={company} />
                  ) : null}
                </div>

                <ul className="flex flex-wrap gap-2 text-sm">
                  {company.enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="bg-muted flex items-center gap-2 rounded-lg border px-3 py-1.5">
                      {enrollment.participant.firstName} {enrollment.participant.lastName}
                      <Badge variant={ENROLLMENT_STATUS_TONES[enrollment.status]}>
                        {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                      </Badge>
                      {enrollment.convention && enrollment.convention.status !== "cancelled" ? (
                        <span className="text-muted-foreground text-xs">{enrollment.convention.reference}</span>
                      ) : enrollment.agreementWaivedAt ? (
                        <span className="text-muted-foreground text-xs">dérogation</span>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {company.conventions.length > 0 ? (
                  <ul className="divide-y rounded-lg border">
                    {company.conventions.map((convention) => {
                      const editable = convention.status === "draft" || convention.status === "sent";
                      return (
                        <li key={convention.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                          <div className="space-y-1 text-sm">
                            <p className="flex flex-wrap items-center gap-2 font-medium">
                              {convention.reference}
                              <Badge variant={CONVENTION_STATUS_TONES[convention.status]}>
                                {CONVENTION_STATUS_LABELS[convention.status]}
                              </Badge>
                            </p>
                            <p className="text-muted-foreground">
                              Générée le {formatDate(convention.generatedAt ?? convention.createdAt)}
                              {convention.sentAt ? ` · envoyée le ${formatDate(convention.sentAt)}` : ""}
                              {convention.signedAt ? ` · signée le ${formatDate(convention.signedAt)}` : ""}
                              {convention.priceExclTax !== null ? ` · ${formatEuros(convention.priceExclTax)} HT` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-start gap-2">
                            {convention.generatedPath
                              ? fileLink(convention.generatedPath, `convention-${convention.reference}.pdf`, "PDF")
                              : null}
                            {convention.signedPath
                              ? fileLink(
                                  convention.signedPath,
                                  `convention-${convention.reference}-signee.pdf`,
                                  "Exemplaire signé",
                                )
                              : null}
                            {editable ? (
                              <>
                                <RefreshConventionDialog convention={convention} />
                                <ActionButton
                                  action={sendConventionAction}
                                  hidden={{ conventionId: convention.id }}
                                  label={convention.status === "sent" ? "Renvoyer" : "Envoyer par email"}
                                  variant="outline"
                                />
                                <RecordSignedDialog convention={convention} />
                                <ActionButton
                                  action={cancelConventionAction}
                                  hidden={{ conventionId: convention.id }}
                                  label="Annuler"
                                  variant="outline"
                                />
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
