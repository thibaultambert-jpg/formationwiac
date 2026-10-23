import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/guards";
import { sessionIcs } from "@/server/email/notifications";

// .ics file of one of the current user's enrollments ("Ajouter à l'agenda").
export async function GET(_request: Request, { params }: RouteContext<"/mes-formations/agenda/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const { id } = await params;
  const enrollment = await db.enrollment.findUnique({
    where: { id },
    include: {
      participant: { select: { userId: true } },
      session: {
        include: {
          training: { select: { title: true } },
          slots: { orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, endsAt: true } },
        },
      },
    },
  });
  if (!enrollment || enrollment.participant.userId !== user.id) return new Response("Introuvable", { status: 404 });

  const cancelled = enrollment.status === "cancelled" || enrollment.session.status === "cancelled";
  return new Response(sessionIcs(enrollment.session, cancelled ? "CANCEL" : "PUBLISH"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${enrollment.session.reference}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
