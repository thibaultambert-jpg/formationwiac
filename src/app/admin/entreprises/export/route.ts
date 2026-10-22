import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { csvResponse } from "@/server/csv-response";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });

  const participants = await db.participant.findMany({
    where: { type: "external", anonymizedAt: null },
    include: { company: true, _count: { select: { enrollments: true } } },
    orderBy: [{ company: { name: "asc" } }, { lastName: "asc" }],
  });

  const csv = toCsv(
    [
      "Entreprise",
      "SIRET",
      "Ville",
      "Prénom",
      "Nom",
      "Email",
      "Fonction",
      "Téléphone",
      "Inscriptions",
      "Archivé",
      "Créé le",
    ],
    participants.map((participant) => [
      participant.company?.name,
      participant.company?.siret,
      participant.company?.city,
      participant.firstName,
      participant.lastName,
      participant.email,
      participant.jobTitle,
      participant.phone,
      participant._count.enrollments,
      participant.archivedAt ? "oui" : "non",
      formatDate(participant.createdAt),
    ]),
  );
  return csvResponse(csv, "participants-externes");
}
