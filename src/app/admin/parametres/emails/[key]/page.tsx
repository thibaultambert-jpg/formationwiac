import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { DEFAULT_EMAIL_TEMPLATES, EMAIL_TYPE_LABELS } from "@/server/email/default-templates";
import { resetEmailTemplate } from "../actions";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "Modèle d'email" };

export default async function EmailTemplatePage({ params }: PageProps<"/admin/parametres/emails/[key]">) {
  await requireRole(["admin"]);
  const { key } = await params;
  const fallback = DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === key);
  if (!fallback) notFound();
  const stored = await db.emailTemplate.findUnique({ where: { key: fallback.key } });
  const template = stored ?? fallback;

  return (
    <section aria-labelledby="template-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/parametres/emails" className="text-muted-foreground text-sm hover:underline">
            ← Tous les modèles
          </Link>
          <h2 id="template-title" className="text-lg font-semibold">
            {EMAIL_TYPE_LABELS[fallback.key] ?? fallback.key}
          </h2>
        </div>
        <form action={resetEmailTemplate}>
          <input type="hidden" name="key" value={fallback.key} />
          <Button type="submit" variant="ghost" size="sm">
            Rétablir le modèle par défaut
          </Button>
        </form>
      </div>
      <TemplateForm
        key={stored?.updatedAt.toISOString() ?? "default"}
        template={{ key: fallback.key, subject: template.subject, body: template.body }}
      />
    </section>
  );
}
