import type { Metadata } from "next";
import { EmailHistory } from "@/components/layout/email-history";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { EMAIL_DOCUMENT_TYPES } from "@/server/email/default-templates";

export const metadata: Metadata = { title: "Documents" };

export default async function SessionDocumentsPage({ params }: PageProps<"/admin/sessions/[id]/documents">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const emails = await db.document.findMany({
    where: { sessionId: id, type: { in: EMAIL_DOCUMENT_TYPES } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Convocations, feuilles d&apos;émargement et attestations</CardTitle>
          <CardDescription>La génération des documents PDF sera livrée au lot 4.</CardDescription>
        </CardHeader>
      </Card>
      <section aria-labelledby="session-emails" className="space-y-3">
        <h2 id="session-emails" className="text-lg font-semibold">
          Emails envoyés ({emails.length})
        </h2>
        <EmailHistory rows={emails} />
      </section>
    </div>
  );
}
