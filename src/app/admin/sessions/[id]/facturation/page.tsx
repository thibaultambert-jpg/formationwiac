import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { FUNDING_TYPE_LABELS, INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { LINE_KIND_LABELS, VAT_RATE_LABELS } from "@/server/domain/invoicing";
import { formatEuros } from "@/server/domain/numbers";
import { loadInvoicingView } from "@/server/services/invoicing";
import { retryInvoiceAction } from "./actions";
import { CreateInvoiceForm, DetachInvoiceDialog } from "./invoice-forms";

export const metadata: Metadata = { title: "Facturation" };

const RESULT_MESSAGES: Record<string, { variant: "success" | "destructive"; text: string }> = {
  creee: {
    variant: "success",
    text: "Facture créée en brouillon dans Pennylane : relisez-la et envoyez-la depuis Pennylane.",
  },
  echec: {
    variant: "destructive",
    text: "La facture est enregistrée mais n'a pas pu être créée dans Pennylane. Consultez l'erreur ci-dessous puis réessayez.",
  },
  detachee: { variant: "success", text: "Facture détachée : ses participants peuvent être facturés de nouveau." },
};

export default async function InvoicingPage({ params, searchParams }: PageProps<"/admin/sessions/[id]/facturation">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const query = await searchParams;
  const view = await loadInvoicingView(id);
  if (!view) notFound();
  const result = typeof query.facture === "string" ? RESULT_MESSAGES[query.facture] : undefined;
  const vatLabel = VAT_RATE_LABELS[view.session.training.vatRate];
  const outsideByFunding = Object.entries(Object.groupBy(view.outside, (item) => item.fundingType));

  return (
    <div className="space-y-6">
      <div className="text-muted-foreground space-y-1 text-sm">
        <p>
          Une fois la session clôturée, chaque payeur est facturé sur le réalisé : seules les heures suivies sont dues
          au titre de la formation (convention, article 5). Le montant proposé est le prix appliqué au prorata des
          heures signées ; tout ajustement demande un motif. La facture est créée en brouillon dans Pennylane, où elle
          est numérotée et envoyée.
        </p>
        <p>
          Avec une subrogation, la part prise en charge est facturée au financeur (OPCO) avec le numéro d&apos;accord,
          le reste à l&apos;entreprise. Un dédit fait l&apos;objet d&apos;une ligne distincte, soumise à la TVA,
          facturée à l&apos;entreprise seulement. Formation : {vatLabel}.
        </p>
      </div>
      {result ? (
        <Alert variant={result.variant}>
          <AlertDescription>{result.text}</AlertDescription>
        </Alert>
      ) : null}
      {view.pennylane === "none" ? (
        <Alert variant="warning">
          <AlertDescription>
            Pennylane n&apos;est pas configuré : renseignez la variable PENNYLANE_API_TOKEN pour créer les factures.
          </AlertDescription>
        </Alert>
      ) : view.pennylane === "local" ? (
        <Alert>
          <AlertDescription>
            Mode développement : les factures sont écrites dans .storage/pennylane/ au lieu d&apos;être envoyées à
            Pennylane.
          </AlertDescription>
        </Alert>
      ) : null}

      {!view.closed ? (
        <EmptyState>La facturation s&apos;ouvre à la clôture de la session.</EmptyState>
      ) : (
        <>
          {view.withoutCompany.length > 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                Sans entreprise payeuse, ces participants ne peuvent pas être facturés :{" "}
                {view.withoutCompany.join(", ")}. Renseignez l&apos;entreprise dans l&apos;onglet Inscrits.
              </AlertDescription>
            </Alert>
          ) : null}
          {outsideByFunding.length > 0 ? (
            <Alert>
              <AlertDescription>
                Facturé hors Pennylane, sur la plateforme du financeur :{" "}
                {outsideByFunding
                  .map(
                    ([funding, items]) =>
                      `${FUNDING_TYPE_LABELS[funding as keyof typeof FUNDING_TYPE_LABELS]} (${(items ?? []).map((item) => item.name).join(", ")})`,
                  )
                  .join(" ; ")}
                .
              </AlertDescription>
            </Alert>
          ) : null}
          {view.payers.length === 0 ? (
            <EmptyState>Aucun participant externe à facturer.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {view.payers.map((payer) => (
                <li key={payer.company.id} className="bg-card space-y-4 rounded-xl border p-5 shadow-sm">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    <Link href={`/admin/entreprises/${payer.company.id}`} className="hover:underline">
                      {payer.company.name}
                    </Link>
                    {payer.funder ? <Badge variant="info">Financeur (subrogation)</Badge> : null}
                  </h2>
                  {payer.funder ? (
                    <p className="text-muted-foreground text-sm">
                      Joignez à la facture le certificat de réalisation et les feuilles d&apos;émargement (onglet{" "}
                      <Link href={`/admin/sessions/${view.session.id}/documents`} className="underline">
                        Documents
                      </Link>
                      ), comme le demandent les OPCO pour le paiement.
                    </p>
                  ) : null}
                  {payer.missing.length > 0 ? (
                    <Alert variant="warning">
                      <AlertDescription>
                        Complétez la{" "}
                        <Link href={`/admin/entreprises/${payer.company.id}`} className="underline">
                          fiche de l&apos;entreprise
                        </Link>{" "}
                        avant de facturer : {payer.missing.join(", ")}.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <CreateInvoiceForm
                    sessionId={view.session.id}
                    companyId={payer.company.id}
                    lines={payer.lines}
                    durationHours={view.durationHours}
                    disabled={payer.missing.length > 0 || view.pennylane === "none"}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view.invoices.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Factures</h2>
          <ul className="divide-y rounded-lg border">
            {view.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="space-y-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {invoice.company.name}
                    <Badge variant={INVOICE_STATUS_TONES[invoice.status]}>
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground">
                    {formatEuros(invoice.totalExclTax)} HT · créée le {formatDate(invoice.createdAt)}
                    {invoice.sentAt ? ` · envoyée à Pennylane le ${formatDate(invoice.sentAt)}` : ""}
                    {invoice.pennylaneInvoiceId ? ` · n° Pennylane ${invoice.pennylaneInvoiceId}` : ""}
                  </p>
                  <ul className="text-muted-foreground list-disc pl-5">
                    {invoice.lines.map((line) => (
                      <li key={line.id}>
                        {line.enrollment.participant.firstName} {line.enrollment.participant.lastName} –{" "}
                        {LINE_KIND_LABELS[line.kind]} : {formatEuros(line.unitPriceExclTax)} HT (
                        {VAT_RATE_LABELS[line.vatRate]})
                        {line.adjustmentReason ? ` (ajusté : ${line.adjustmentReason})` : ""}
                      </li>
                    ))}
                  </ul>
                  {invoice.status === "failed" && invoice.error ? (
                    <p className="text-destructive">Erreur : {invoice.error}</p>
                  ) : null}
                  {invoice.status === "detached" ? (
                    <p className="text-muted-foreground">
                      Détachée le {invoice.detachedAt ? formatDate(invoice.detachedAt) : "—"} : {invoice.detachReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {invoice.pennylaneUrl ? (
                    <Button asChild size="sm" variant="ghost">
                      <a href={invoice.pennylaneUrl} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden="true" />
                        PDF Pennylane
                      </a>
                    </Button>
                  ) : null}
                  {invoice.status === "failed" || invoice.status === "pending" ? (
                    <ActionButton
                      action={retryInvoiceAction}
                      hidden={{ sessionId: view.session.id, invoiceId: invoice.id }}
                      label="Réessayer"
                      variant="outline"
                    />
                  ) : null}
                  {invoice.status === "sent" || invoice.status === "failed" ? (
                    <DetachInvoiceDialog sessionId={view.session.id} invoiceId={invoice.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
