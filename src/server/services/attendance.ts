import "server-only";
import type { SignatureMethod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { presenceAtClosure, signingWindowOpen } from "@/server/domain/automation";
import { storeBuffer } from "@/server/storage";

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

async function loadSlot(sessionId: string, slotId: string) {
  const slot = await db.sessionSlot.findUnique({ where: { id: slotId }, include: { session: true } });
  if (!slot || slot.sessionId !== sessionId) throw new AttendanceError("Créneau introuvable.");
  if (slot.session.status === "cancelled") throw new AttendanceError("Cette session est annulée.");
  return slot;
}

/** Participant signature (personal link or trainer's device), only on the slot's day. */
export async function signParticipant(input: {
  enrollmentId: string;
  slotId: string;
  signature: string | null;
  ipAddress: string | null;
  method: SignatureMethod;
  actorId: string | null;
}) {
  const enrollment = await db.enrollment.findUnique({ where: { id: input.enrollmentId } });
  if (!enrollment || !["confirmed", "present", "absent"].includes(enrollment.status)) {
    throw new AttendanceError("Cette inscription ne permet pas d'émarger.");
  }
  const slot = await loadSlot(enrollment.sessionId, input.slotId);
  if (!signingWindowOpen(slot, new Date())) {
    throw new AttendanceError(
      "L'émargement de ce créneau est possible uniquement le jour même, à partir de 30 minutes avant le début.",
    );
  }
  const existing = await db.attendance.findUnique({
    where: { enrollmentId_slotId: { enrollmentId: enrollment.id, slotId: slot.id } },
  });
  if (existing?.signaturePath) throw new AttendanceError("Ce créneau est déjà signé.");

  const signaturePath = await storeBuffer(
    `signatures/${enrollment.sessionId}`,
    "png",
    decodeSignature(input.signature),
    "image/png",
  );
  const data = { present: true, signaturePath, signedAt: new Date(), ipAddress: input.ipAddress, method: input.method };
  const attendance = await db.attendance.upsert({
    where: { enrollmentId_slotId: { enrollmentId: enrollment.id, slotId: slot.id } },
    update: data,
    create: { ...data, enrollmentId: enrollment.id, slotId: slot.id },
  });
  // A signature after closure turns an absent participant into a present one (rule 8).
  if (enrollment.status === "absent")
    await db.enrollment.update({ where: { id: enrollment.id }, data: { status: "present" } });
  await audit(db, {
    userId: input.actorId,
    action: "sign",
    entity: "enrollment",
    entityId: enrollment.id,
    after: { slotId: slot.id, method: input.method, ipAddress: input.ipAddress },
  });
  return attendance;
}

export async function signTrainer(input: {
  sessionId: string;
  trainerId: string;
  slotId: string;
  signature: string | null;
  actorId: string | null;
}) {
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
  const signaturePath = await storeBuffer(
    `signatures/${input.sessionId}`,
    "png",
    decodeSignature(input.signature),
    "image/png",
  );
  await db.trainerSignature.create({
    data: { slotId: slot.id, trainerId: input.trainerId, signaturePath, signedAt: new Date() },
  });
  await audit(db, {
    userId: input.actorId,
    action: "sign",
    entity: "session",
    entityId: input.sessionId,
    after: { slotId: slot.id, trainerId: input.trainerId },
  });
}

/** BO correction: present or absent without signature, at any time. */
export async function setAttendanceByAdmin(enrollmentId: string, slotId: string, present: boolean, actorId: string) {
  const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { session: true } });
  await loadSlot(enrollment.sessionId, slotId);
  const before = await db.attendance.findUnique({ where: { enrollmentId_slotId: { enrollmentId, slotId } } });
  await db.attendance.upsert({
    where: { enrollmentId_slotId: { enrollmentId, slotId } },
    update: { present },
    create: { enrollmentId, slotId, present },
  });
  // After closure, presence is recomputed (rule 8).
  if (
    enrollment.session.status === "completed" &&
    (enrollment.status === "present" || enrollment.status === "absent")
  ) {
    const signed = await db.attendance.count({ where: { enrollmentId, present: true } });
    await db.enrollment.update({ where: { id: enrollmentId }, data: { status: presenceAtClosure(signed) } });
  }
  await audit(db, {
    userId: actorId,
    action: "update",
    entity: "enrollment",
    entityId: enrollmentId,
    before: { slotId, present: before?.present ?? null },
    after: { slotId, present, correction: true },
  });
}
