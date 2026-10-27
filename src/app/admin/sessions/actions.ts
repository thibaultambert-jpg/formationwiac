"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatSlot, parisYear } from "@/lib/dates";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";
import { canCancel, canDeleteSession, canPublish, canUnpublish } from "@/server/domain/session-status";
import { importReport, nothingToImport, readCsvUpload } from "@/server/csv-upload";
import { normalizeHeader, parseSessionImport, type SessionImportRow } from "@/server/domain/csv-import";
import { errorState, formValues, isConfirmed, text, type ActionState } from "@/server/forms";
import { after } from "next/server";
import { notifySessionCancellation, promotionNotices, scheduleEnrollmentNotices } from "@/server/email/notifications";
import { applyCapacityChange } from "@/server/services/enrollments";
import {
  allocateReference,
  createSessionRecord,
  parseSessionForm,
  SessionError,
  sessionData,
  type SessionInput,
  trainerConflicts,
  updateSessionRecord,
} from "@/server/services/sessions";

function slotsSummary(slots: { startsAt: Date; endsAt: Date }[]): string[] {
  return slots.map((slot) => formatSlot(slot.startsAt, slot.endsAt));
}

export async function createSession(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = parseSessionForm(formData);
  if (!parsed.ok) return errorState(formData, parsed.message, parsed.fieldErrors);

  const training = await db.training.findUnique({ where: { id: parsed.data.trainingId } });
  if (!training || !training.active)
    return errorState(formData, "Formation introuvable ou archivée.", { trainingId: "Invalide." });

  if (!isConfirmed(formData)) {
    const conflicts = await trainerConflicts(parsed.data.trainerIds, parsed.data.slots);
    if (conflicts.length > 0) return { status: "warning", warnings: conflicts, values: formValues(formData) };
  }

  const session = await db.$transaction(async (tx) => {
    const created = await createSessionRecord(tx, parsed.data);
    await audit(tx, {
      userId: actor.id,
      action: "create",
      entity: "session",
      entityId: created.id,
      after: { ...created, slots: slotsSummary(parsed.data.slots), trainerIds: parsed.data.trainerIds },
    });
    return created;
  });
  redirect(`/admin/sessions/${session.id}?cree=1`);
}

export async function updateSession(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const existing = id
    ? await db.trainingSession.findUnique({
        where: { id },
        include: { slots: { orderBy: { startsAt: "asc" } }, trainers: true },
      })
    : null;
  if (!existing) return errorState(formData, "Session introuvable.");
  if (existing.status === "cancelled" || existing.status === "completed") {
    return errorState(formData, "Une session annulée ou terminée ne peut plus être modifiée.");
  }

  const parsed = parseSessionForm(formData);
  if (!parsed.ok) return errorState(formData, parsed.message, parsed.fieldErrors);
  const training = await db.training.findUnique({ where: { id: parsed.data.trainingId } });
  if (!training) return errorState(formData, "Formation introuvable.", { trainingId: "Invalide." });

  if (!isConfirmed(formData)) {
    const warnings = await trainerConflicts(parsed.data.trainerIds, parsed.data.slots, existing.id);
    const seats = await db.enrollment.count({
      where: { sessionId: existing.id, status: { in: [...SEAT_HOLDING_STATUSES] } },
    });
    if (parsed.data.capacityMax < seats) {
      warnings.push(
        `La capacité maximale (${parsed.data.capacityMax}) est inférieure au nombre d'inscrits confirmés (${seats}).`,
      );
    }
    if (warnings.length > 0) return { status: "warning", warnings, values: formValues(formData) };
  }

  let promoted: string[] = [];
  try {
    await db.$transaction(async (tx) => {
      await updateSessionRecord(tx, existing.id, parsed.data);
      const before = {
        ...existing,
        slots: slotsSummary(existing.slots),
        trainerIds: existing.trainers.map((t) => t.trainerId).sort(),
      };
      const after = {
        ...sessionData(parsed.data),
        slots: slotsSummary(parsed.data.slots),
        trainerIds: [...parsed.data.trainerIds].sort(),
      };
      const changes = diff(before, after);
      if (changes)
        await audit(tx, { userId: actor.id, action: "update", entity: "session", entityId: existing.id, ...changes });
      promoted = await applyCapacityChange(tx, existing.id, actor.id);
    });
  } catch (error) {
    if (error instanceof SessionError) return errorState(formData, error.message);
    throw error;
  }
  scheduleEnrollmentNotices(promotionNotices(promoted));
  redirect(`/admin/sessions/${existing.id}?modifie=1`);
}

export async function duplicateSession(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const source = id
    ? await db.trainingSession.findUnique({ where: { id }, include: { slots: true, trainers: true } })
    : null;
  if (!source) return;

  const copy = await db.$transaction(async (tx) => {
    const firstSlot = [...source.slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const reference = await allocateReference(tx, parisYear(firstSlot?.startsAt ?? new Date()));
    const created = await tx.trainingSession.create({
      data: {
        trainingId: source.trainingId,
        reference,
        status: "draft",
        location: source.location,
        videoLink: source.videoLink,
        capacityMax: source.capacityMax,
        capacityMin: source.capacityMin,
        registrationDeadline: source.registrationDeadline,
        openToInternal: source.openToInternal,
        openToExternal: source.openToExternal,
        qualiopiScope: source.qualiopiScope,
        accessInfo: source.accessInfo,
        internalNotes: source.internalNotes,
        slots: { create: source.slots.map(({ startsAt, endsAt }) => ({ startsAt, endsAt })) },
        trainers: { create: source.trainers.map(({ trainerId }) => ({ trainerId })) },
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "create",
      entity: "session",
      entityId: created.id,
      after: { duplicatedFrom: source.reference, reference },
    });
    return created;
  });
  redirect(`/admin/sessions/${copy.id}/modifier?duplique=1`);
}

async function changeStatus(
  formData: FormData,
  allowed: (status: Parameters<typeof canPublish>[0]) => boolean,
  status: "published" | "draft",
  action: string,
) {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const session = id ? await db.trainingSession.findUnique({ where: { id } }) : null;
  if (!session || !allowed(session.status)) return;
  const promoted = await db.$transaction(async (tx) => {
    await tx.trainingSession.update({ where: { id: session.id }, data: { status } });
    await audit(tx, {
      userId: actor.id,
      action,
      entity: "session",
      entityId: session.id,
      before: { status: session.status },
      after: { status },
    });
    // A published session at capacity becomes full immediately.
    return status === "published" ? applyCapacityChange(tx, session.id, actor.id) : [];
  });
  scheduleEnrollmentNotices(promotionNotices(promoted));
  refresh();
}

export async function publishSession(formData: FormData): Promise<void> {
  await changeStatus(formData, canPublish, "published", "publish");
}

export async function unpublishSession(formData: FormData): Promise<void> {
  await changeStatus(formData, canUnpublish, "draft", "unpublish");
}

export async function cancelSession(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const reason = text(formData, "reason");
  const session = id ? await db.trainingSession.findUnique({ where: { id } }) : null;
  if (!session) return errorState(formData, "Session introuvable.");
  if (!canCancel(session.status)) return errorState(formData, "Cette session ne peut plus être annulée.");
  if (!reason) return errorState(formData, "Indiquez le motif de l'annulation.", { reason: "Obligatoire." });

  await db.trainingSession.update({
    where: { id: session.id },
    data: { status: "cancelled", cancelledAt: new Date(), cancellationReason: reason },
  });
  await audit(db, {
    userId: actor.id,
    action: "cancel",
    entity: "session",
    entityId: session.id,
    before: { status: session.status },
    after: { status: "cancelled", reason },
  });
  after(async () => {
    try {
      await notifySessionCancellation(session.id);
    } catch (error) {
      console.error("Cancellation emails failed", session.id, error);
    }
  });
  refresh();
  return {
    status: "success",
    message: "La session a été annulée. Les inscrits et les formateurs sont prévenus par email.",
  };
}

export async function deleteSession(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const session = id
    ? await db.trainingSession.findUnique({ where: { id }, include: { _count: { select: { enrollments: true } } } })
    : null;
  if (!session || !canDeleteSession(session._count.enrollments)) return;

  await db.$transaction(async (tx) => {
    await tx.document.deleteMany({ where: { sessionId: session.id } });
    await tx.trainingSession.delete({ where: { id: session.id } });
    await audit(tx, {
      userId: actor.id,
      action: "delete",
      entity: "session",
      entityId: session.id,
      before: { reference: session.reference },
    });
  });
  redirect("/admin/sessions");
}

/** Same form fields as the session screen, so that an imported session goes through the same checks. */
function sessionFormData(row: SessionImportRow, trainingId: string, trainerIds: string[]): FormData {
  const formData = new FormData();
  const set = (key: string, value: string | null) => {
    if (value) formData.set(key, value);
  };
  set("trainingId", trainingId);
  set("location", row.location);
  set("videoLink", row.videoLink);
  set("capacityMax", row.capacityMax);
  set("capacityMin", row.capacityMin);
  set("registrationDeadline", row.registrationDeadline);
  set("openToInternal", row.openToInternal ? "on" : null);
  set("openToExternal", row.openToExternal ? "on" : null);
  set("qualiopiScope", row.qualiopiScope ? "on" : null);
  set("accessInfo", row.accessInfo);
  set("internalNotes", row.internalNotes);
  for (const trainerId of trainerIds) formData.append("trainerIds", trainerId);
  for (const slot of row.slots) {
    formData.append("slotId", "");
    formData.append("slotDate", slot.date);
    formData.append("slotStart", slot.start);
    formData.append("slotEnd", slot.end);
  }
  return formData;
}

/**
 * CSV import of sessions, created as drafts: one line per session, the
 * training by its exact title (or slug), the trainers by their email.
 */
export async function importSessionsCsv(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const upload = await readCsvUpload(formData);
  if (!upload.ok) return upload.state;
  const parsed = parseSessionImport(upload.rows);
  const errors = [...parsed.errors];
  if (parsed.rows.length === 0) return nothingToImport(formData, errors);

  const trainings = await db.training.findMany({ select: { id: true, title: true, slug: true, active: true } });
  const trainingsByKey = new Map<string, (typeof trainings)[number][]>();
  for (const training of trainings) {
    for (const key of new Set([normalizeHeader(training.title), training.slug.toLowerCase()])) {
      trainingsByKey.set(key, [...(trainingsByKey.get(key) ?? []), training]);
    }
  }
  const emails = [...new Set(parsed.rows.flatMap((row) => row.trainerEmails))];
  const trainers = await db.trainer.findMany({
    where: { active: true, email: { in: emails, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });

  const valid: { line: number; input: SessionInput; trainingTitle: string }[] = [];
  for (const row of parsed.rows) {
    const matches = trainingsByKey.get(normalizeHeader(row.training)) ?? trainingsByKey.get(row.training.toLowerCase());
    const training = matches?.length === 1 ? matches[0] : null;
    if (!matches) {
      errors.push({ line: row.line, message: `formation « ${row.training} » introuvable` });
      continue;
    }
    if (!training) {
      errors.push({
        line: row.line,
        message: `plusieurs formations s'appellent « ${row.training} » : indiquez son slug`,
      });
      continue;
    }
    if (!training.active) {
      errors.push({ line: row.line, message: `formation « ${training.title} » archivée` });
      continue;
    }
    const trainerIds: string[] = [];
    const unknown: string[] = [];
    for (const email of row.trainerEmails) {
      const trainer = trainers.find((candidate) => candidate.email.toLowerCase() === email);
      if (trainer) trainerIds.push(trainer.id);
      else unknown.push(email);
    }
    if (unknown.length > 0) {
      errors.push({ line: row.line, message: `formateur introuvable : ${unknown.join(", ")}` });
      continue;
    }
    const session = parseSessionForm(sessionFormData(row, training.id, trainerIds));
    if (!session.ok) {
      errors.push({ line: row.line, message: [...new Set(Object.values(session.fieldErrors))].join(" ") });
      continue;
    }
    valid.push({ line: row.line, input: session.data, trainingTitle: training.title });
  }
  if (valid.length === 0) return nothingToImport(formData, errors);

  // Trainer conflicts stay non-blocking, as on the session screen: they are listed in the report.
  const notes: string[] = [];
  for (const { line, input } of valid) {
    for (const conflict of await trainerConflicts(input.trainerIds, input.slots))
      notes.push(`ligne ${line} : ${conflict}`);
  }

  const references = await db.$transaction(
    async (tx) => {
      const created: string[] = [];
      for (const { input } of valid) {
        const session = await createSessionRecord(tx, input);
        await audit(tx, {
          userId: actor.id,
          action: "create",
          entity: "session",
          entityId: session.id,
          after: { ...session, slots: slotsSummary(input.slots), trainerIds: input.trainerIds },
        });
        created.push(session.reference);
      }
      await audit(tx, {
        userId: actor.id,
        action: "import",
        entity: "session",
        entityId: "list",
        after: { file: upload.name, created, errors: errors.length },
      });
      return created;
    },
    { timeout: 60_000 },
  );

  refresh();
  const message = importReport(
    [`${references.length} session(s) créée(s) en brouillon (${references.join(", ")})`],
    errors,
    notes,
  );
  return { status: "success", message };
}
