import "server-only";
import type { ComplaintStatus, ImprovementSource, ImprovementStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";

export type ComplaintInput = {
  receivedAt: Date;
  complainant: string;
  channel: string | null;
  sessionId: string | null;
  subject: string;
  description: string;
  treatment: string | null;
  response: string | null;
  status: ComplaintStatus;
};

/** Closing date follows the status: set when closed, cleared when reopened. */
function closedAt(status: string, closedValue: string, previous: Date | null | undefined): Date | null {
  return status === closedValue ? (previous ?? new Date()) : null;
}

/** Complaints register (D10): every creation and change is audited. */
export async function saveComplaint(id: string | null, input: ComplaintInput, actorId: string) {
  if (!id) {
    const created = await db.complaint.create({
      data: { ...input, closedAt: closedAt(input.status, "closed", null), createdById: actorId },
    });
    await audit(db, { userId: actorId, action: "create", entity: "complaint", entityId: created.id, after: input });
    return created;
  }
  const existing = await db.complaint.findUniqueOrThrow({ where: { id } });
  const data = { ...input, closedAt: closedAt(input.status, "closed", existing.closedAt) };
  const updated = await db.complaint.update({ where: { id }, data });
  const changes = diff(existing, data);
  if (changes) await audit(db, { userId: actorId, action: "update", entity: "complaint", entityId: id, ...changes });
  return updated;
}

export type ImprovementInput = {
  source: ImprovementSource;
  complaintId: string | null;
  origin: string | null;
  action: string;
  owner: string | null;
  dueDate: Date | null;
  status: ImprovementStatus;
  result: string | null;
};

/** Continuous improvement register (D11). */
export async function saveImprovement(id: string | null, input: ImprovementInput, actorId: string) {
  const done = (status: string) => status === "done" || status === "abandoned";
  if (!id) {
    const created = await db.improvementAction.create({
      data: { ...input, closedAt: done(input.status) ? new Date() : null, createdById: actorId },
    });
    await audit(db, {
      userId: actorId,
      action: "create",
      entity: "improvement_action",
      entityId: created.id,
      after: input,
    });
    return created;
  }
  const existing = await db.improvementAction.findUniqueOrThrow({ where: { id } });
  const data = { ...input, closedAt: done(input.status) ? (existing.closedAt ?? new Date()) : null };
  const updated = await db.improvementAction.update({ where: { id }, data });
  const changes = diff(existing, data);
  if (changes)
    await audit(db, { userId: actorId, action: "update", entity: "improvement_action", entityId: id, ...changes });
  return updated;
}
