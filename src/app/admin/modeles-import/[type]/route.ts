import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { IMPORT_TEMPLATES, type ImportTemplateKey } from "@/server/domain/csv-import";

// Example files of the CSV imports (no personal data, hence no export trace).
export async function GET(_request: Request, { params }: RouteContext<"/admin/modeles-import/[type]">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });

  const { type } = await params;
  if (!Object.hasOwn(IMPORT_TEMPLATES, type)) return new Response("Modèle introuvable", { status: 404 });
  const template = IMPORT_TEMPLATES[type as ImportTemplateKey];
  return new Response(toCsv(template.header, template.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${template.filename}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
