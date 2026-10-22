import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/server/audit";
import { normalizeEmail } from "@/server/auth/policy";
import { ANONYMIZED_FIRST_NAME, ANONYMIZED_LAST_NAME, anonymizedEmail, retentionCutoff } from "@/server/domain/privacy";
import { EMAIL_DOCUMENT_TYPES } from "@/server/email/default-templates";
import { deleteStoredFiles } from "@/server/storage";

export class PrivacyError extends Error {}

/** Everything the application stores about a participant (right of access). */
export async function exportParticipantData(participantId: string) {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    include: {
      company: { select: { name: true, siret: true } },
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          department: true,
          createdAt: true,
          lastLoginAt: true,
        },
      },
      enrollments: {
        include: {
          session: { include: { training: { select: { title: true } }, slots: { orderBy: { startsAt: "asc" } } } },
          attendances: { include: { slot: true } },
          evaluations: true,
          documents: { select: { type: true, subject: true, recipientEmail: true, sentAt: true, generatedAt: true } },
        },
      },
    },
  });
  if (!participant) return null;
  const logs = await db.auditLog.findMany({
    where: {
      OR: [
        { entity: "participant", entityId: participant.id },
        ...(participant.userId ? [{ entity: "user", entityId: participant.userId }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { action: true, entity: true, createdAt: true, before: true, after: true },
  });

  return {
    exportedAt: new Date().toISOString(),
    participant: {
      type: participant.type,
      firstName: participant.firstName,
      lastName: participant.lastName,
      email: participant.email,
      jobTitle: participant.jobTitle,
      phone: participant.phone,
      company: participant.company,
      createdAt: participant.createdAt,
      archivedAt: participant.archivedAt,
      anonymizedAt: participant.anonymizedAt,
    },
    googleAccount: participant.user,
    enrollments: participant.enrollments.map((enrollment) => ({
      session: enrollment.session.reference,
      training: enrollment.session.training.title,
      slots: enrollment.session.slots.map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt })),
      status: enrollment.status,
      source: enrollment.source,
      enrolledAt: enrollment.enrolledAt,
      motivation: enrollment.motivation,
      appliedPrice: enrollment.appliedPrice?.toString() ?? null,
      cancelledAt: enrollment.cancelledAt,
      cancellationReason: enrollment.cancellationReason,
      attendances: enrollment.attendances.map((attendance) => ({
        slot: attendance.slot.startsAt,
        present: attendance.present,
        signedAt: attendance.signedAt,
        ipAddress: attendance.ipAddress,
      })),
      evaluations: enrollment.evaluations.map((evaluation) => ({
        type: evaluation.type,
        submittedAt: evaluation.submittedAt,
        globalScore: evaluation.globalScore?.toString() ?? null,
        answers: evaluation.answers,
      })),
      documents: enrollment.documents,
    })),
    history: logs,
  };
}

/**
 * Anonymizes a participant on request (decision: proofs are kept). Identity
 * fields are replaced, email copies are deleted, audit entries about the
 * person are scrubbed; enrollments, attendance and certificates stay for the
 * retention period without identity.
 */
export async function anonymizeParticipant(participantId: string, actorId: string, reason: string) {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    include: { user: { include: { trainer: true } } },
  });
  if (!participant) throw new PrivacyError("Participant introuvable.");
  if (participant.anonymizedAt) throw new PrivacyError("Ce participant est déjà anonymisé.");
  if (participant.user) {
    if (participant.user.id === actorId) throw new PrivacyError("Vous ne pouvez pas anonymiser votre propre compte.");
    if (participant.user.role === "admin" || normalizeEmail(participant.user.email) === getEnv().INITIAL_ADMIN_EMAIL) {
      throw new PrivacyError("Retirez d'abord le rôle Administrateur de ce compte.");
    }
    if (participant.user.trainer) {
      throw new PrivacyError(
        "Ce compte est lié à une fiche formateur : désactivez et modifiez d'abord la fiche formateur.",
      );
    }
  }

  const emailFiles = await db.document.findMany({
    where: { enrollment: { participantId }, type: { in: EMAIL_DOCUMENT_TYPES }, filePath: { not: null } },
    select: { filePath: true },
  });

  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.participant.update({
      where: { id: participant.id },
      data: {
        firstName: ANONYMIZED_FIRST_NAME,
        lastName: ANONYMIZED_LAST_NAME,
        email: anonymizedEmail(participant.id),
        jobTitle: null,
        phone: null,
        hubspotContactId: null,
        anonymizedAt: now,
        archivedAt: participant.archivedAt ?? now,
      },
    });
    if (participant.user) {
      await tx.user.update({
        where: { id: participant.user.id },
        data: {
          email: anonymizedEmail(participant.user.id),
          firstName: null,
          lastName: null,
          department: null,
          active: false,
        },
      });
    }
    await tx.company.updateMany({ where: { mainContactId: participant.id }, data: { mainContactId: null } });
    await tx.enrollment.updateMany({ where: { participantId: participant.id }, data: { motivation: null } });
    await tx.document.updateMany({
      where: { enrollment: { participantId: participant.id } },
      data: { recipientEmail: null },
    });
    await tx.document.updateMany({
      where: { enrollment: { participantId: participant.id }, type: { in: EMAIL_DOCUMENT_TYPES } },
      data: { filePath: null },
    });
    await tx.accessToken.updateMany({
      where: { enrollment: { participantId: participant.id }, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.auditLog.updateMany({
      where: {
        OR: [
          { entity: "participant", entityId: participant.id },
          ...(participant.user ? [{ entity: "user", entityId: participant.user.id }] : []),
        ],
      },
      data: { before: Prisma.DbNull, after: { anonymized: true } },
    });
    await audit(tx, {
      userId: actorId,
      action: "anonymize",
      entity: "participant",
      entityId: participant.id,
      after: { reason },
    });
  });

  await deleteStoredFiles(emailFiles.map((file) => file.filePath!).filter(Boolean));
}

/** Participants whose last training ended before the retention cutoff (or never trained, created before it). */
export async function participantsPastRetention(now: Date, years: number) {
  const cutoff = retentionCutoff(now, years);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM participants p
    LEFT JOIN enrollments e ON e.participant_id = p.id
    LEFT JOIN session_slots s ON s.session_id = e.session_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.anonymized_at IS NULL
      AND (u.id IS NULL OR u.role <> 'admin')
    GROUP BY p.id, p.created_at
    HAVING coalesce(max(s.ends_at), p.created_at) < ${cutoff}`;
  return db.participant.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    include: { company: { select: { name: true } } },
    orderBy: { lastName: "asc" },
  });
}

/** Proof files (signatures, generated PDFs) of sessions ended before the retention cutoff. */
export async function proofFilesPastRetention(now: Date, years: number) {
  const cutoff = retentionCutoff(now, years);
  const expiredSessions = { slots: { some: {} }, NOT: { slots: { some: { endsAt: { gte: cutoff } } } } };
  const [attendances, documents, signatures] = await Promise.all([
    db.attendance.findMany({
      where: { signaturePath: { not: null }, slot: { session: expiredSessions } },
      select: { id: true, signaturePath: true },
    }),
    db.document.findMany({
      where: { filePath: { not: null }, session: expiredSessions },
      select: { id: true, filePath: true },
    }),
    db.trainerSignature.findMany({
      where: { slot: { session: expiredSessions } },
      select: { id: true, signaturePath: true },
    }),
  ]);
  return { attendances, documents, signatures, count: attendances.length + documents.length + signatures.length };
}

export async function purgeProofFiles(now: Date, years: number, actorId: string) {
  const files = await proofFilesPastRetention(now, years);
  await deleteStoredFiles([
    ...files.attendances.map((row) => row.signaturePath!),
    ...files.documents.map((row) => row.filePath!),
    ...files.signatures.map((row) => row.signaturePath),
  ]);
  await db.$transaction([
    db.attendance.updateMany({
      where: { id: { in: files.attendances.map((row) => row.id) } },
      data: { signaturePath: null },
    }),
    db.document.updateMany({ where: { id: { in: files.documents.map((row) => row.id) } }, data: { filePath: null } }),
    db.trainerSignature.deleteMany({ where: { id: { in: files.signatures.map((row) => row.id) } } }),
  ]);
  await audit(db, {
    userId: actorId,
    action: "purge",
    entity: "settings",
    entityId: "retention",
    after: { files: files.count, years },
  });
  return files.count;
}
