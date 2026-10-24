import "server-only";
import { db } from "@/lib/db";
import { inQualiopiScope, requirementsFor, type Requirement } from "@/server/domain/compliance";

/** Obligations of every active enrollment of a session (session compliance panel). */
export async function sessionCompliance(sessionId: string) {
  const session = await db.trainingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      enrollments: {
        where: { status: { not: "cancelled" } },
        include: {
          participant: true,
          convention: { select: { status: true, reference: true } },
          documents: { where: { type: "pre_training_information", sentAt: { not: null } }, select: { sentAt: true } },
        },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });
  const inScope = inQualiopiScope(session, session.enrollments);
  const rows = session.enrollments.map((enrollment) => {
    const requirements: Requirement[] = requirementsFor({
      participantType: enrollment.participantType,
      inScope,
      conventionSigned: enrollment.convention?.status === "signed",
      agreementWaived: enrollment.agreementWaivedAt !== null,
      preInformationSent: enrollment.documents.length > 0,
    });
    return { enrollment, requirements };
  });
  return {
    inScope,
    rows,
    blockingMissing: rows.reduce(
      (sum, row) => sum + row.requirements.filter((item) => item.blocking && !item.satisfied).length,
      0,
    ),
  };
}
