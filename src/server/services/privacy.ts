import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/server/audit";
import { withRetentionPurge } from "@/server/retention";
import { normalizeEmail } from "@/server/auth/policy";
import {
  ANONYMIZED_FIRST_NAME,
  ANONYMIZED_LAST_NAME,
  anonymizedEmail,
  daysBefore,
  monthsBefore,
  retentionCutoff,
  retentionExpired,
  retentionPolicy,
  type RetentionPolicy,
} from "@/server/domain/privacy";
import { EMAIL_DOCUMENT_TYPES } from "@/server/email/default-templates";
import { zipSync } from "fflate";
import { addUnique, safeFileName } from "@/server/domain/dossier";
import { deleteStoredFiles, readStoredFile } from "@/server/storage";

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
          corrections: { include: { slot: true } },
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
      legalHoldReason: participant.legalHoldReason,
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
      // Right of access: the adaptation need is part of the trainee's own data.
      adaptationNeed: enrollment.adaptationNeed,
      learningResult: enrollment.learningResult,
      learningComment: enrollment.learningComment,
      droppedOutAt: enrollment.droppedOutAt,
      dropoutReason: enrollment.dropoutReason,
      appliedPrice: enrollment.appliedPrice?.toString() ?? null,
      cancelledAt: enrollment.cancelledAt,
      cancellationReason: enrollment.cancellationReason,
      attendances: enrollment.attendances.map((attendance) => ({
        slot: attendance.slot.startsAt,
        present: attendance.present,
        signedAt: attendance.signedAt,
        method: attendance.method,
        ipAddress: attendance.ipAddress,
        userAgent: attendance.userAgent,
        recordHash: attendance.recordHash,
      })),
      attendanceCorrections: enrollment.corrections.map((correction) => ({
        slot: correction.slot.startsAt,
        state: correction.state,
        eventAt: correction.eventAt,
        reason: correction.reason,
        createdAt: correction.createdAt,
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
export async function anonymizeParticipant(participantId: string, actorId: string | null, reason: string) {
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    include: { user: { include: { trainer: true } } },
  });
  if (!participant) throw new PrivacyError("Participant introuvable.");
  if (participant.anonymizedAt) throw new PrivacyError("Ce participant est déjà anonymisé.");
  if (participant.legalHoldAt)
    throw new PrivacyError("Ce participant est sous conservation légale : levez-la d'abord.");
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
    await tx.enrollment.updateMany({
      where: { participantId: participant.id },
      data: { motivation: null, adaptationNeed: null, needsAnalysisNote: null },
    });
    await tx.document.updateMany({
      where: { enrollment: { participantId: participant.id } },
      data: { recipientEmail: null },
    });
    await tx.document.updateMany({
      where: { enrollment: { participantId: participant.id }, type: { in: EMAIL_DOCUMENT_TYPES } },
      data: { filePath: null },
    });
    // The invoice itself is kept in Pennylane (accounting retention); the local copy of its label loses the name.
    const invoiceLines = await tx.invoiceLine.findMany({
      where: { enrollment: { participantId: participant.id } },
      select: { id: true, label: true },
    });
    for (const line of invoiceLines) {
      await tx.invoiceLine.update({
        where: { id: line.id },
        data: {
          label: line.label.replace(
            `${participant.firstName} ${participant.lastName}`,
            `${ANONYMIZED_FIRST_NAME} ${ANONYMIZED_LAST_NAME}`,
          ),
        },
      });
    }
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

/**
 * Participants past their retention period (E5): externals after their last
 * training, internals after leaving; never under legal hold, never admins.
 */
export async function participantsPastRetention(now: Date, policy: RetentionPolicy) {
  const rows = await db.$queryRaw<
    { id: string; type: "internal" | "external"; last_activity: Date; left_at: Date | null; legal_hold: boolean }[]
  >`
    SELECT p.id, p.type::text AS type,
           coalesce(max(s.ends_at), p.created_at) AS last_activity,
           max(u.left_at) AS left_at,
           (p.legal_hold_at IS NOT NULL OR bool_or(ts.legal_hold_at IS NOT NULL)) IS TRUE AS legal_hold
    FROM participants p
    LEFT JOIN enrollments e ON e.participant_id = p.id
    LEFT JOIN sessions ts ON ts.id = e.session_id
    LEFT JOIN session_slots s ON s.session_id = e.session_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.anonymized_at IS NULL
      AND (u.id IS NULL OR u.role <> 'admin')
    GROUP BY p.id`;
  const ids = rows
    .filter((row) =>
      retentionExpired(
        { type: row.type, lastActivity: row.last_activity, leftAt: row.left_at, legalHold: row.legal_hold },
        now,
        policy,
      ),
    )
    .map((row) => row.id);
  return db.participant.findMany({
    where: { id: { in: ids } },
    include: { company: { select: { name: true } } },
    orderBy: { lastName: "asc" },
  });
}

/**
 * Proof files (signatures, generated PDFs) that can be deleted: sessions
 * ended before the external cutoff, without legal hold, whose trainees are all
 * anonymized (an internal still employed keeps the session's proofs).
 */
export async function proofFilesPastRetention(now: Date, policy: RetentionPolicy) {
  const cutoff = retentionCutoff(now, policy.externalYears);
  const expiredSessions = {
    legalHoldAt: null,
    slots: { some: {} },
    NOT: [
      { slots: { some: { endsAt: { gte: cutoff } } } },
      { enrollments: { some: { participant: { anonymizedAt: null } } } },
    ],
  } satisfies Prisma.TrainingSessionWhereInput;
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

export async function purgeProofFiles(now: Date, policy: RetentionPolicy, actorId: string | null) {
  const files = await proofFilesPastRetention(now, policy);
  if (files.count === 0) return 0;
  await deleteStoredFiles([
    ...files.attendances.map((row) => row.signaturePath!),
    ...files.documents.map((row) => row.filePath!),
    ...files.signatures.map((row) => row.signaturePath),
  ]);
  await withRetentionPurge(async (tx) => {
    await tx.attendance.updateMany({
      where: { id: { in: files.attendances.map((row) => row.id) } },
      data: { signaturePath: null },
    });
    await tx.document.updateMany({
      where: { id: { in: files.documents.map((row) => row.id) } },
      data: { filePath: null },
    });
    await tx.trainerSignature.deleteMany({ where: { id: { in: files.signatures.map((row) => row.id) } } });
  });
  await audit(db, {
    userId: actorId,
    action: "purge",
    entity: "settings",
    entityId: "retention",
    after: { files: files.count, years: policy.externalYears },
  });
  return files.count;
}

/**
 * Technical data past its period (E5): IP addresses and browsers of
 * signatures older than the technical period (the record fingerprints do not
 * include them), and links expired or revoked for longer than the link period.
 * Sessions under legal hold keep everything.
 */
export async function purgeTechnicalData(now: Date, policy: RetentionPolicy, actorId: string | null) {
  const technicalCutoff = monthsBefore(now, policy.technicalMonths);
  const tokenCutoff = daysBefore(now, policy.tokenDays);
  const unheld = { session: { legalHoldAt: null } } satisfies Prisma.SessionSlotWhereInput;
  const counts = await withRetentionPurge(async (tx) => {
    const attendances = await tx.attendance.updateMany({
      where: {
        signedAt: { lt: technicalCutoff },
        OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
        slot: unheld,
      },
      data: { ipAddress: null, userAgent: null },
    });
    const signatures = await tx.trainerSignature.updateMany({
      where: {
        signedAt: { lt: technicalCutoff },
        OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
        slot: unheld,
      },
      data: { ipAddress: null, userAgent: null },
    });
    const tokens = await tx.accessToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: tokenCutoff } }, { revokedAt: { lt: tokenCutoff } }],
        NOT: { session: { legalHoldAt: { not: null } } },
      },
    });
    return { technical: attendances.count + signatures.count, tokens: tokens.count };
  });
  if (counts.technical + counts.tokens > 0) {
    await audit(db, { userId: actorId, action: "purge", entity: "settings", entityId: "technical", after: counts });
  }
  return counts;
}

export async function currentRetentionPolicy(): Promise<RetentionPolicy> {
  return retentionPolicy(await db.organizationSettings.findUnique({ where: { id: 1 } }));
}

export class LegalHoldError extends Error {}

/** Places or lifts a legal hold on a session or a participant (E5); a reason is required to place it. */
export async function setLegalHold(
  target: { kind: "session" | "participant"; id: string },
  reason: string | null,
  actorId: string,
) {
  const data = reason
    ? { legalHoldReason: reason, legalHoldAt: new Date() }
    : { legalHoldReason: null, legalHoldAt: null };
  const before =
    target.kind === "session"
      ? await db.trainingSession.findUnique({ where: { id: target.id }, select: { legalHoldReason: true } })
      : await db.participant.findUnique({ where: { id: target.id }, select: { legalHoldReason: true } });
  if (!before) throw new LegalHoldError("Enregistrement introuvable.");
  if (target.kind === "session") await db.trainingSession.update({ where: { id: target.id }, data });
  else await db.participant.update({ where: { id: target.id }, data });
  await audit(db, {
    userId: actorId,
    action: reason ? "legal_hold" : "legal_hold_release",
    entity: target.kind,
    entityId: target.id,
    before,
    after: { legalHoldReason: reason },
  });
}

/**
 * Right of access as a ZIP (E6): the JSON of every stored datum (with the
 * audit history), plus the files about the person: signatures, documents
 * sent to them, pedagogical files.
 */
export async function exportParticipantArchive(participantId: string) {
  const data = await exportParticipantData(participantId);
  if (!data) return null;
  const files: Record<string, Uint8Array> = {
    "donnees.json": new TextEncoder().encode(JSON.stringify(data, null, 2)),
  };
  const enrollments = await db.enrollment.findMany({
    where: { participantId },
    include: {
      session: { select: { reference: true } },
      attendances: { include: { slot: { select: { startsAt: true } } } },
      documents: { where: { filePath: { not: null } } },
    },
  });
  const add = async (path: string, storagePath: string | null) => {
    if (!storagePath) return;
    const file = await readStoredFile(storagePath);
    if (file) addUnique(files, path, new Uint8Array(file.body));
  };
  const extension = (path: string) => path.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  for (const enrollment of enrollments) {
    const folder = safeFileName(enrollment.session.reference);
    for (const attendance of enrollment.attendances) {
      if (attendance.signaturePath)
        await add(
          `${folder}/signatures/${attendance.slot.startsAt.toISOString().slice(0, 16).replace(":", "h")}${extension(attendance.signaturePath)}`,
          attendance.signaturePath,
        );
    }
    for (const document of enrollment.documents) {
      await add(
        `${folder}/documents/${safeFileName(document.type)}${extension(document.filePath!)}`,
        document.filePath,
      );
    }
    for (const [name, path] of [
      ["analyse-du-besoin", enrollment.needsAnalysisPath],
      ["positionnement", enrollment.positioningPath],
      ["evaluation-des-acquis", enrollment.learningFilePath],
    ] as const) {
      if (path) await add(`${folder}/pedagogie/${name}${extension(path)}`, path);
    }
  }
  return { data, zip: zipSync(files, { level: 6 }), entries: Object.keys(files) };
}
