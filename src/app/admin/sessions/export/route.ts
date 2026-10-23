import { formatDate, formatTime } from "@/lib/dates";
import { SESSION_STATUS_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { csvResponse } from "@/server/csv-response";
import { listSessions, readSessionFilters, waitlistCounts } from "@/server/services/session-queries";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const sessions = await listSessions(readSessionFilters(params));
  const waitlists = await waitlistCounts(sessions.map((session) => session.id));

  const csv = toCsv(
    [
      "Référence",
      "Formation",
      "Statut",
      "Début",
      "Fin",
      "Créneaux",
      "Lieu",
      "Lien visio",
      "Formateurs",
      "Inscrits",
      "Liste d'attente",
      "Capacité min",
      "Capacité max",
      "Internes",
      "Externes",
    ],
    sessions.map((session) => {
      const first = session.slots[0];
      const last = session.slots.at(-1);
      return [
        session.reference,
        session.training.title,
        SESSION_STATUS_LABELS[session.status],
        first ? `${formatDate(first.startsAt)} ${formatTime(first.startsAt)}` : "",
        last ? `${formatDate(last.endsAt)} ${formatTime(last.endsAt)}` : "",
        session.slots.length,
        session.location,
        session.videoLink,
        session.trainers.map((link) => `${link.trainer.firstName} ${link.trainer.lastName}`).join(", "),
        session._count.enrollments,
        waitlists.get(session.id) ?? 0,
        session.capacityMin,
        session.capacityMax,
        session.openToInternal ? "oui" : "non",
        session.openToExternal ? "oui" : "non",
      ];
    }),
  );
  return csvResponse(csv, "sessions");
}
