import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatSlot, parisDateTimeToUtc, parisEndOfDay, parisYear } from "@/lib/dates";
import { formatSessionReference, nextReferenceSequence, SESSION_REFERENCE_PREFIX } from "@/server/domain/reference";
import { sortSlots, validateSlots, type TimeRange } from "@/server/domain/slots";
import { checkbox, text, type FieldErrors } from "@/server/forms";

type Tx = Prisma.TransactionClient;

/** Allocates the next FORM-AAAA-NNN reference; serialized with an advisory lock. */
export async function allocateReference(tx: Tx, year: number): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('session_reference'))`;
  const prefix = `${SESSION_REFERENCE_PREFIX}-${year}-`;
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT max(split_part(reference, '-', 3)::int) AS max
    FROM sessions
    WHERE reference LIKE ${`${prefix}%`} AND split_part(reference, '-', 3) ~ '^[0-9]+$'`;
  return formatSessionReference(year, nextReferenceSequence(rows[0]?.max ?? null));
}

export type SlotInput = TimeRange & { id: string | null };

export type SessionInput = {
  trainingId: string;
  location: string | null;
  videoLink: string | null;
  capacityMax: number;
  capacityMin: number | null;
  registrationDeadline: Date | null;
  openToInternal: boolean;
  openToExternal: boolean;
  qualiopiScope: boolean;
  accessInfo: string | null;
  internalNotes: string | null;
  trainerIds: string[];
  slots: SlotInput[];
};

const baseSchema = z
  .object({
    trainingId: z.uuid({ error: "Choisissez une formation." }),
    location: z.string().nullable(),
    videoLink: z.url("Lien invalide (https://…).").nullable(),
    capacityMax: z.number({ error: "Capacité obligatoire." }).int("Nombre entier attendu.").min(1, "Au moins 1 place."),
    capacityMin: z.number().int("Nombre entier attendu.").min(0).nullable(),
    openToInternal: z.boolean(),
    openToExternal: z.boolean(),
    qualiopiScope: z.boolean(),
    accessInfo: z.string().nullable(),
    internalNotes: z.string().nullable(),
    trainerIds: z.array(z.uuid()),
  })
  .refine((data) => data.capacityMin === null || data.capacityMin <= data.capacityMax, {
    path: ["capacityMin"],
    message: "La capacité minimale dépasse la capacité maximale.",
  })
  .refine((data) => data.location || data.videoLink, {
    path: ["location"],
    message: "Indiquez un lieu ou un lien visio.",
  })
  .refine((data) => data.openToInternal || data.openToExternal, {
    path: ["openToInternal"],
    message: "Ouvrez la session aux internes, aux externes ou aux deux.",
  });

function optionalInt(value: string | null): number | null | undefined {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function parseSessionForm(
  formData: FormData,
): { ok: true; data: SessionInput } | { ok: false; fieldErrors: FieldErrors; message: string } {
  const fieldErrors: FieldErrors = {};

  const parsed = baseSchema.safeParse({
    trainingId: text(formData, "trainingId") ?? undefined,
    location: text(formData, "location"),
    videoLink: text(formData, "videoLink"),
    capacityMax: optionalInt(text(formData, "capacityMax")) ?? undefined,
    capacityMin: optionalInt(text(formData, "capacityMin")),
    openToInternal: checkbox(formData, "openToInternal"),
    openToExternal: checkbox(formData, "openToExternal"),
    qualiopiScope: checkbox(formData, "qualiopiScope"),
    accessInfo: text(formData, "accessInfo"),
    internalNotes: text(formData, "internalNotes"),
    trainerIds: formData
      .getAll("trainerIds")
      .filter((value): value is string => typeof value === "string" && value !== ""),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
  }

  const deadlineInput = text(formData, "registrationDeadline");
  const registrationDeadline = deadlineInput ? parisEndOfDay(deadlineInput) : null;
  if (deadlineInput && !registrationDeadline) fieldErrors.registrationDeadline = "Date invalide.";

  const ids = formData.getAll("slotId");
  const dates = formData.getAll("slotDate");
  const starts = formData.getAll("slotStart");
  const ends = formData.getAll("slotEnd");
  const slots: SlotInput[] = [];
  dates.forEach((date, index) => {
    const startsAt = parisDateTimeToUtc(String(date), String(starts[index] ?? ""));
    const endsAt = parisDateTimeToUtc(String(date), String(ends[index] ?? ""));
    if (!startsAt || !endsAt) {
      fieldErrors[`slots.${index}`] = "Date ou horaires invalides.";
      return;
    }
    const id = String(ids[index] ?? "");
    slots.push({ id: id || null, startsAt, endsAt });
  });
  if (dates.length === 0) fieldErrors.slots = "Ajoutez au moins un créneau.";
  for (const error of validateSlots(slots)) {
    fieldErrors[error.index === -1 ? "slots" : `slots.${error.index}`] = error.message;
  }

  const firstSlot = sortSlots(slots)[0];
  if (registrationDeadline && firstSlot && registrationDeadline > firstSlot.endsAt) {
    fieldErrors.registrationDeadline = "La date limite doit précéder le début de la session.";
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Certains champs sont invalides." };
  }
  return { ok: true, data: { ...parsed.data, registrationDeadline, slots: sortSlots(slots) } };
}

/** Human-readable trainer conflicts with other (non-cancelled) sessions. */
export async function trainerConflicts(
  trainerIds: string[],
  slots: readonly TimeRange[],
  excludeSessionId?: string,
): Promise<string[]> {
  if (trainerIds.length === 0 || slots.length === 0) return [];
  const overlapping = await db.sessionSlot.findMany({
    where: {
      session: {
        status: { not: "cancelled" },
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
        trainers: { some: { trainerId: { in: trainerIds } } },
      },
      OR: slots.map((slot) => ({ startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } })),
    },
    include: {
      session: { include: { training: true, trainers: { include: { trainer: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  const messages = new Set<string>();
  for (const slot of overlapping) {
    for (const link of slot.session.trainers) {
      if (!trainerIds.includes(link.trainerId)) continue;
      messages.add(
        `${link.trainer.firstName} ${link.trainer.lastName} est déjà affecté(e) à « ${slot.session.training.title} » (${slot.session.reference}) le ${formatSlot(slot.startsAt, slot.endsAt)}.`,
      );
    }
  }
  return [...messages];
}

export function sessionData(input: SessionInput) {
  return {
    trainingId: input.trainingId,
    location: input.location,
    videoLink: input.videoLink,
    capacityMax: input.capacityMax,
    capacityMin: input.capacityMin,
    registrationDeadline: input.registrationDeadline,
    openToInternal: input.openToInternal,
    openToExternal: input.openToExternal,
    qualiopiScope: input.qualiopiScope,
    accessInfo: input.accessInfo,
    internalNotes: input.internalNotes,
  };
}

export async function createSessionRecord(tx: Tx, input: SessionInput) {
  const reference = await allocateReference(tx, parisYear(input.slots[0].startsAt));
  return tx.trainingSession.create({
    data: {
      ...sessionData(input),
      reference,
      status: "draft",
      slots: { create: input.slots.map(({ startsAt, endsAt }) => ({ startsAt, endsAt })) },
      trainers: { create: input.trainerIds.map((trainerId) => ({ trainerId })) },
    },
  });
}

export class SessionError extends Error {}

/** Updates fields, slots and trainers. Slots already signed cannot be removed. */
export async function updateSessionRecord(tx: Tx, sessionId: string, input: SessionInput) {
  const existingSlots = await tx.sessionSlot.findMany({
    where: { sessionId },
    include: { _count: { select: { attendances: true, corrections: true } } },
  });
  const keptIds = new Set(input.slots.map((slot) => slot.id).filter(Boolean));
  const removed = existingSlots.filter((slot) => !keptIds.has(slot.id));
  if (removed.some((slot) => slot._count.attendances > 0 || slot._count.corrections > 0)) {
    throw new SessionError("Un créneau déjà émargé ne peut pas être supprimé.");
  }

  await tx.trainingSession.update({ where: { id: sessionId }, data: sessionData(input) });
  await tx.sessionSlot.deleteMany({ where: { id: { in: removed.map((slot) => slot.id) } } });
  for (const slot of input.slots) {
    if (slot.id && existingSlots.some((existing) => existing.id === slot.id)) {
      await tx.sessionSlot.update({ where: { id: slot.id }, data: { startsAt: slot.startsAt, endsAt: slot.endsAt } });
    } else {
      await tx.sessionSlot.create({ data: { sessionId, startsAt: slot.startsAt, endsAt: slot.endsAt } });
    }
  }
  await tx.sessionTrainer.deleteMany({ where: { sessionId, trainerId: { notIn: input.trainerIds } } });
  await tx.sessionTrainer.createMany({
    data: input.trainerIds.map((trainerId) => ({ sessionId, trainerId })),
    skipDuplicates: true,
  });
}
