import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { EMAIL_TYPE_LABELS } from "@/server/email/default-templates";
import { parseEml } from "@/server/email/eml";
import { readStoredFile } from "@/server/storage";

export const metadata: Metadata = { title: "Email" };

export default async function EmailPage({ params }: PageProps<"/admin/emails/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const email = await db.document.findUnique({
    where: { id },
    include: { session: { select: { id: true, reference: true } } },
  });
  if (!email) notFound();

  const file = email.filePath?.endsWith(".eml") ? await readStoredFile(email.filePath) : null;
  const parsed = file ? parseEml(file.body.toString("utf8")) : null;

  return (
    <>
      <PageHeader
        title={email.subject ?? "Email"}
        description={
          email.session ? (
            <Link href={`/admin/sessions/${email.session.id}/documents`} className="hover:underline">
              ← Session {email.session.reference}
            </Link>
          ) : undefined
        }
      />
      <dl className="mb-6 grid max-w-2xl grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{EMAIL_TYPE_LABELS[email.type] ?? email.type}</dd>
        <dt className="text-muted-foreground">Destinataire</dt>
        <dd>{email.recipientEmail ?? "Anonymisé"}</dd>
        <dt className="text-muted-foreground">Envoyé le</dt>
        <dd>{email.sentAt ? formatDateTime(email.sentAt) : "Non envoyé"}</dd>
        {email.gmailMessageId ? (
          <>
            <dt className="text-muted-foreground">Identifiant Gmail</dt>
            <dd className="break-all">{email.gmailMessageId}</dd>
          </>
        ) : null}
        {parsed?.attachments.length ? (
          <>
            <dt className="text-muted-foreground">Pièces jointes</dt>
            <dd>{parsed.attachments.join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {email.error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{email.error}</AlertDescription>
        </Alert>
      ) : null}
      {parsed ? (
        <section aria-label="Contenu de l'email" className="max-w-2xl space-y-3">
          <p className="text-muted-foreground text-sm">
            Copie conservée dans la boîte d&apos;envoi locale (Gmail non configuré).
          </p>
          <pre className="bg-muted/40 rounded-md border p-4 font-sans text-sm whitespace-pre-wrap">{parsed.text}</pre>
          <a
            href={`/fichiers/${email.filePath}?nom=${encodeURIComponent(`${email.subject ?? "email"}.eml`)}`}
            className="text-primary text-sm underline underline-offset-4"
          >
            Télécharger le fichier .eml
          </a>
        </section>
      ) : email.gmailMessageId ? (
        <p className="text-muted-foreground text-sm">Le contenu est consultable dans la boîte Gmail d&apos;envoi.</p>
      ) : null}
    </>
  );
}
