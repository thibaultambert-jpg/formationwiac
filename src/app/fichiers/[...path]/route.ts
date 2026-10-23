import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/guards";
import { readStoredFile } from "@/server/storage";

// Authenticated file download. Administrators can read every file; other users
// only the program PDF of active trainings.
export async function GET(request: Request, { params }: RouteContext<"/fichiers/[...path]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });

  const { path } = await params;
  const storagePath = path.join("/");

  if (user.role !== "admin") {
    const training = await db.training.findFirst({ where: { programPdfPath: storagePath, active: true } });
    if (!training) return new Response("Accès interdit", { status: 403 });
  }

  const file = await readStoredFile(storagePath);
  if (!file) return new Response("Fichier introuvable", { status: 404 });

  const download = new URL(request.url).searchParams.get("nom");
  const disposition = download ? `attachment; filename*=UTF-8''${encodeURIComponent(download)}` : "inline";

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
