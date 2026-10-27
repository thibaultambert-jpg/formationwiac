import { connection } from "next/server";
import { currentRegulation } from "@/server/services/legal";
import { readStoredFile } from "@/server/storage";

// PDF of the internal regulations in force (F3): public, like the page.
export async function GET() {
  // Rendered per request: the texts and the version in force come from the settings.
  await connection();
  const regulation = await currentRegulation();
  const file = regulation ? await readStoredFile(regulation.filePath) : null;
  if (!regulation || !file) return new Response("Règlement intérieur introuvable", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reglement-interieur-v${regulation.version}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
