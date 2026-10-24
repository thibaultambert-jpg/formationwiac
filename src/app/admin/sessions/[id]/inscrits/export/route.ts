import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import {
  ENROLLMENT_SOURCE_LABELS,
  ENROLLMENT_STATUS_LABELS,
  FUNDING_TYPE_LABELS,
  PARTICIPANT_TYPE_LABELS,
} from "@/lib/labels";
import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { csvResponse } from "@/server/csv-response";

export async function GET(_request: Request, { params }: RouteContext<"/admin/sessions/[id]/inscrits/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });

  const { id } = await params;
  const session = await db.trainingSession.findUnique({
    where: { id },
    include: {
      training: true,
      enrollments: {
        include: {
          participant: { include: { company: true, user: true } },
          billingCompany: true,
          convention: { select: { reference: true } },
        },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });
  if (!session) return new Response("Session introuvable", { status: 404 });

  const csv = toCsv(
    [
      "Référence",
      "Formation",
      "Prénom",
      "Nom",
      "Email",
      "Type",
      "Service",
      "Entreprise",
      "SIRET",
      "Fonction",
      "Téléphone",
      "Statut",
      "Financement",
      "Convention",
      "Dérogation",
      "Source",
      "Inscrit le",
      "Prix appliqué HT",
      "Entreprise payeuse",
      "Motif d'annulation",
    ],
    session.enrollments.map((enrollment) => {
      const { participant } = enrollment;
      return [
        session.reference,
        session.training.title,
        participant.firstName,
        participant.lastName,
        participant.email,
        PARTICIPANT_TYPE_LABELS[enrollment.participantType],
        participant.user?.department,
        participant.company?.name,
        participant.company?.siret,
        participant.jobTitle,
        participant.phone,
        ENROLLMENT_STATUS_LABELS[enrollment.status],
        FUNDING_TYPE_LABELS[enrollment.fundingType],
        enrollment.convention?.reference,
        enrollment.agreementWaiverReason,
        ENROLLMENT_SOURCE_LABELS[enrollment.source],
        formatDate(enrollment.enrolledAt),
        enrollment.appliedPrice?.toString().replace(".", ","),
        enrollment.billingCompany?.name,
        enrollment.cancellationReason,
      ];
    }),
  );
  return csvResponse(csv, `inscrits-${session.reference}`, {
    userId: user.id,
    entity: "session",
    entityId: id,
    rows: session.enrollments.length,
  });
}
