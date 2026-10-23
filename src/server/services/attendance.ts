import "server-only";
import type { AttendanceState, Prisma, SignatureMethod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parisDateTimeToUtc, toParisDateInput } from "@/lib/dates";
import { audit } from "@/server/audit";
import {
  attended,
  correctionRecordHash,
  DEFAULT_MARGINS,
  insideWindow,
  linkWindow,
  sha256,
  signatureRecordHash,
  slotAttendance,
  type Margins,
} from "@/server/domain/attendance-proof";
import { presenceAtClosure, signingWindowOpen } from "@/server/domain/automation";
import { storeBuffer } from "@/server/storage";

type Tx = Prisma.TransactionClient;

export class AttendanceError extends Error {}

const MAX_SIGNATURE_BYTES = 300 * 1024;
const PNG_PREFIX = "data:image/png;base64,";

/** Decodes a canvas PNG data URL; rejects anything else. */
export function decodeSignature(dataUrl: string | null): Buffer {
  if (!dataUrl || !dataUrl.startsWith(PNG_PREFIX)) throw new AttendanceError("Signature manquante.");
  const buffer = Buffer.from(dataUrl.slice(PNG_PREFIX.length), "base64");
  if (buffer.length < 100) throw new AttendanceError("Signature vide.");
  if (buffer.length > MAX_SIGNATURE_BYTES) throw new AttendanceError("Signature trop volumineuse.");
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new AttendanceError("Format de signature invalide.");
  return buffer;
}

/** Margins of the personal attendance links, from the settings. */
export async function attendanceMargins(): Promise<Margins> {
  const settings = await db.organizationSettings.findUnique({
    where: { id: 1 },
    select: { attendanceMarginBefore: true, attendanceMarginAfter: true },
  });
  return settings
    ? { before: settings.attendanceMarginBefore, after: settings.attendanceMarginAfter }
    : DEFAULT_MARGINS;
}

async function loadSlot(sessionId: string, slotId: string) {
  const slot = await db.sessionSlot.findUnique({ where: { id: slotId }, include: { session: true } });
  if (!slot || slot.sessionId !== sessionId) throw new AttendanceError("Créneau introuvable.");
  if (slot.session.status === "cancelled") throw new AttendanceError("Cette session est annulée.");
  return slot;
}

export type ProofContext = { ipAddress: string | null; userAgent: string | null };

/**
 * Participant signature, appended once per slot (C5): personal link (the
 * token is consumed in the same transaction), checkbox attestation with the
 * personal link (H1), or the trainer's device during the slot window.
 */
export async function signParticipant(
  input: {
    enrollmentId: string;
    slotId: string;
    method: SignatureMethod;
    /** PNG data URL; not used for the checkbox attestation. */
    signature: string | null;
    tokenId: string | null;
    actorId: string | null;
  } & ProofContext,
) {
  const enrollment = await db.enrollment.findUnique({ where: { id: input.enrollmentId } });
  if (!enrollment || !["confirmed", "present", "absent"].includes(enrollment.status)) {
    throw new AttendanceError("Cette inscription ne permet pas d'émarger.");
  }
  const slot = await loadSlot(enrollment.sessionId, input.slotId);
  if (input.method === "trainer_device" && !insideWindow(linkWindow(slot, await attendanceMargins()), new Date())) {
    throw new AttendanceError("L'émargement de ce créneau n'est possible que pendant le créneau.");
  }
  if (input.method !== "trainer_device" && !input.tokenId) throw new AttendanceError("Lien d'émargement manquant.");
  const existing = await db.attendance.findUnique({
    where: { enrollmentId_slotId: { enrollmentId: enrollment.id, slotId: slot.id } },
  });
  if (existing) throw new AttendanceError("Votre présence pour ce créneau est déjà enregistrée.");

  let signaturePath: string | null = null;
  let signatureSha256: string | null = null;
  if (input.method !== "attestation_checkbox") {
    const image = decodeSignature(input.signature);
    signatureSha256 = sha256(image);
    signaturePath = await storeBuffer(`signatures/${enrollment.sessionId}`, "png", image, "image/png");
  }
  const signedAt = new Date();
  const recordHash = signatureRecordHash({
    kind: "participant",
    personId: enrollment.participantId,
    sessionId: enrollment.sessionId,
    slotId: slot.id,
    signedAt,
    method: input.method,
    signatureSha256,
    tokenId: input.tokenId,
  });

  return db
    .$transaction(async (tx) => {
      if (input.tokenId) {
        // Single use: only the first signature consumes the token.
        const consumed = await tx.accessToken.updateMany({
          where: { id: input.tokenId, consumedAt: null },
          data: { consumedAt: signedAt, lastUsedAt: signedAt },
        });
        if (consumed.count !== 1) throw new AttendanceError("Ce lien d'émargement a déjà été utilisé.");
      }
      const attendance = await tx.attendance.create({
        data: {
          enrollmentId: enrollment.id,
          slotId: slot.id,
          present: true,
          signaturePath,
          signedAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          tokenId: input.tokenId,
          method: input.method,
          signatureSha256,
          recordHash,
        },
      });
      // A signature after closure turns an absent participant into a present one (rule 8).
      if (enrollment.status === "absent")
        await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "present" } });
      await audit(tx, {
        userId: input.actorId,
        action: "sign",
        entity: "enrollment",
        entityId: enrollment.id,
        after: { slotId: slot.id, method: input.method, recordHash },
      });
      return attendance;
    })
    .then(async (attendance) => {
      await refreezeIfClosed(enrollment.sessionId);
      return attendance;
    });
}

/** A change after closure stores a new version of the final attendance sheet (previous versions are kept). */
async function refreezeIfClosed(sessionId: string) {
  const session = await db.trainingSession.findUnique({ where: { id: sessionId }, select: { status: true } });
  if (session?.status !== "completed") return;
  const { freezeAttendanceSheet } = await import("@/server/services/session-documents");
  await freezeAttendanceSheet(sessionId);
}

export async function signTrainer(
  input: {
    sessionId: string;
    trainerId: string;
    slotId: string;
    signature: string | null;
    tokenId: string | null;
    actorId: string | null;
  } & ProofContext,
) {
  const link = await db.sessionTrainer.findUnique({
    where: { sessionId_trainerId: { sessionId: input.sessionId, trainerId: input.trainerId } },
  });
  if (!link) throw new AttendanceError("Vous n'êtes pas formateur de cette session.");
  const slot = await loadSlot(input.sessionId, input.slotId);
  if (!signingWindowOpen(slot, new Date())) {
    throw new AttendanceError(
      "L'émargement de ce créneau est possible uniquement le jour même, à partir de 30 minutes avant le début.",
    );
  }
  if (
    await db.trainerSignature.findUnique({
      where: { slotId_trainerId: { slotId: slot.id, trainerId: input.trainerId } },
    })
  ) {
    throw new AttendanceError("Vous avez déjà signé ce créneau.");
  }
  const image = decodeSignature(input.signature);
  const signatureSha256 = sha256(image);
  const signaturePath = await storeBuffer(`signatures/${input.sessionId}`, "png", image, "image/png");
  const signedAt = new Date();
  const recordHash = signatureRecordHash({
    kind: "trainer",
    personId: input.trainerId,
    sessionId: input.sessionId,
    slotId: slot.id,
    signedAt,
    method: "trainer",
    signatureSha256,
    tokenId: input.tokenId,
  });
  await db.trainerSignature.create({
    data: {
      slotId: slot.id,
      trainerId: input.trainerId,
      signaturePath,
      signedAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      tokenId: input.tokenId,
      signatureSha256,
      recordHash,
    },
  });
  await audit(db, {
    userId: input.actorId,
    action: "sign",
    entity: "session",
    entityId: input.sessionId,
    after: { slotId: slot.id, trainerId: input.trainerId, recordHash },
  });
}

/** Recomputes present/absent of a closed enrollment from its slots (rule 8). */
async function refreshClosedPresence(tx: Tx, enrollmentId: string) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { session: { include: { slots: true } }, attendances: true, corrections: true },
  });
  if (enrollment.session.status !== "completed" || !["present", "absent"].includes(enrollment.status)) return;
  const attendedSlots = enrollment.session.slots.filter((slot) =>
    attended(
      slotAttendance({
        attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
        corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
      }).state,
    ),
  ).length;
  const status = presenceAtClosure(attendedSlots);
  if (status !== enrollment.status) await tx.enrollment.update({ where: { id: enrollmentId }, data: { status } });
}

/**
 * Attendance correction (C3, C5): appended with its reason and author, never
 * overwriting the signature. Absence, lateness or early departure declared by
 * the trainer, or presence/absence set by an admin.
 */
export async function recordCorrection(input: {
  enrollmentId: string;
  slotId: string;
  state: AttendanceState;
  eventAt: Date | null;
  reason: string;
  authorUserId: string | null;
  authorTrainerId: string | null;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new AttendanceError("Le motif est obligatoire.");
  if ((input.state === "late" || input.state === "left_early") && !input.eventAt)
    throw new AttendanceError(input.state === "late" ? "Indiquez l'heure d'arrivée." : "Indiquez l'heure de départ.");
  const enrollment = await db.enrollment.findUnique({ where: { id: input.enrollmentId } });
  if (!enrollment || !["confirmed", "present", "absent"].includes(enrollment.status))
    throw new AttendanceError("Inscription introuvable.");
  await loadSlot(enrollment.sessionId, input.slotId);
  const createdAt = new Date();
  const eventAt = input.state === "late" || input.state === "left_early" ? input.eventAt : null;
  const recordHash = correctionRecordHash({ ...input, eventAt, reason, createdAt });
  await db.$transaction(async (tx) => {
    await tx.attendanceCorrection.create({
      data: {
        enrollmentId: input.enrollmentId,
        slotId: input.slotId,
        state: input.state,
        eventAt,
        reason,
        authorUserId: input.authorUserId,
        authorTrainerId: input.authorTrainerId,
        createdAt,
        recordHash,
      },
    });
    await refreshClosedPresence(tx, input.enrollmentId);
    await audit(tx, {
      userId: input.authorUserId,
      action: "attendance_correction",
      entity: "enrollment",
      entityId: input.enrollmentId,
      after: { slotId: input.slotId, state: input.state, reason, trainerId: input.authorTrainerId, recordHash },
    });
  });
  await refreezeIfClosed(enrollment.sessionId);
}

const STATES: readonly AttendanceState[] = ["present", "absent", "late", "left_early"];

/** Correction fields of the BO and trainer forms: state, time (HH:MM, Paris, on the slot's day) and reason. */
export async function correctionFromForm(formData: FormData) {
  const value = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
  };
  const enrollmentId = value("enrollmentId");
  const slotId = value("slotId");
  const state = value("state") as AttendanceState | null;
  if (!enrollmentId || !slotId || !state || !STATES.includes(state)) throw new AttendanceError("Correction invalide.");
  const slot = await db.sessionSlot.findUnique({ where: { id: slotId } });
  if (!slot) throw new AttendanceError("Créneau introuvable.");
  const time = value("time");
  const eventAt = time ? parisDateTimeToUtc(toParisDateInput(slot.startsAt), time) : null;
  return { enrollmentId, slotId, state, eventAt, reason: value("reason") ?? "" };
}

/** Statuses of the enrollments shown on the attendance sheet. */
export const SHEET_STATUSES = ["confirmed", "present", "absent"] as const;

/**
 * Attendance grid of a session: for each enrollment and slot, the signature,
 * the corrections and the resulting attendance state.
 */
export async function loadAttendanceGrid(sessionId: string) {
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      training: true,
      slots: { orderBy: { startsAt: "asc" }, include: { trainerSignatures: true } },
      trainers: { include: { trainer: true } },
      enrollments: {
        where: { status: { in: [...SHEET_STATUSES] } },
        include: {
          participant: { include: { company: true } },
          attendances: true,
          corrections: { orderBy: { createdAt: "asc" } },
        },
        orderBy: [{ participant: { lastName: "asc" } }, { participant: { firstName: "asc" } }],
      },
    },
  });
  if (!session) return null;
  const enrollments = session.enrollments.map((enrollment) => ({
    ...enrollment,
    cells: session.slots.map((slot) => {
      const attendance = enrollment.attendances.find((item) => item.slotId === slot.id) ?? null;
      const corrections = enrollment.corrections.filter((item) => item.slotId === slot.id);
      return { slot, attendance, corrections, view: slotAttendance({ attendance, corrections }) };
    }),
  }));
  return { ...session, enrollments };
}

export type AttendanceGrid = NonNullable<Awaited<ReturnType<typeof loadAttendanceGrid>>>;
