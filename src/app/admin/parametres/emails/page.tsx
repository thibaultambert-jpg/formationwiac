import type { Metadata } from "next";
import Link from "next/link";
import { EmailHistory } from "@/components/layout/email-history";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import {
  ACTIVE_EMAIL_TYPES,
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_DOCUMENT_TYPES,
  EMAIL_TYPE_LABELS,
} from "@/server/email/default-templates";
import { emailTransport } from "@/server/email/send";

export const metadata: Metadata = { title: "Emails" };

const TRANSPORT_LABELS = {
  gmail: "Les emails sont envoyés via Gmail.",
  outbox: "Gmail n'est pas configuré : les emails sont conservés dans la boîte d'envoi locale (aperçu ci-dessous).",
  none: "Gmail n'est pas configuré : les emails ne peuvent pas être envoyés et apparaissent en échec.",
};

export default async function EmailSettingsPage() {
  await requireRole(["admin"]);
  const transport = emailTransport();
  const [templates, history] = await Promise.all([
    db.emailTemplate.findMany(),
    db.document.findMany({
      where: { type: { in: EMAIL_DOCUMENT_TYPES } },
      include: { session: { select: { reference: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const stored = new Map(templates.map((template) => [template.key, template]));
  const ordered = [...DEFAULT_EMAIL_TEMPLATES].sort(
    (a, b) => Number(ACTIVE_EMAIL_TYPES.includes(b.key)) - Number(ACTIVE_EMAIL_TYPES.includes(a.key)),
  );

  return (
    <div className="space-y-8">
      <Alert variant={transport === "gmail" ? "success" : "warning"}>
        <AlertDescription>{TRANSPORT_LABELS[transport]}</AlertDescription>
      </Alert>

      <section aria-labelledby="templates-title" className="space-y-3">
        <h2 id="templates-title" className="text-lg font-semibold">
          Modèles d&apos;emails
        </h2>
        <ul className="divide-y rounded-md border">
          {ordered.map((template) => {
            const active = ACTIVE_EMAIL_TYPES.includes(template.key);
            return (
              <li key={template.key} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/parametres/emails/${template.key}`} className="font-medium hover:underline">
                    {EMAIL_TYPE_LABELS[template.key] ?? template.key}
                  </Link>
                  <p className="text-muted-foreground truncate text-sm">
                    {(stored.get(template.key) ?? template).subject}
                  </p>
                </div>
                <Badge variant={active ? "success" : "secondary"}>{active ? "Envoyé automatiquement" : "Lot 4"}</Badge>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="history-title" className="space-y-3">
        <h2 id="history-title" className="text-lg font-semibold">
          Derniers envois
        </h2>
        <EmailHistory rows={history.map((row) => ({ ...row, context: row.session?.reference }))} />
      </section>
    </div>
  );
}
