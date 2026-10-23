// Probative attendance (compliance audit, section C): signing windows,
// SHA-256 fingerprints and the attendance state of a slot. Pure functions.
import { createHash } from "node:crypto";

export type TimeRange = { startsAt: Date; endsAt: Date };
export type AttendanceStateValue = "present" | "absent" | "late" | "left_early";

export type Margins = { before: number; after: number };
export const DEFAULT_MARGINS: Margins = { before: 30, after: 60 };

/** Personal attendance link of a slot: usable from `before` minutes before it starts to `after` minutes after it ends (C2). */
export function linkWindow(slot: TimeRange, margins: Margins): { validFrom: Date; expiresAt: Date } {
  return {
    validFrom: new Date(slot.startsAt.getTime() - margins.before * 60_000),
    expiresAt: new Date(slot.endsAt.getTime() + margins.after * 60_000),
  };
}

export function insideWindow(window: { validFrom: Date | null; expiresAt: Date }, now: Date): boolean {
  return (window.validFrom === null || now >= window.validFrom) && now <= window.expiresAt;
}

export function sha256(data: string | Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Canonical JSON (sorted keys, ISO dates) so that a fingerprint can be recomputed. */
export function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Fingerprint of an attendance record (C5): trainee, session, slot, server timestamp, signature image. */
export function signatureRecordHash(record: {
  kind: "participant" | "trainer";
  personId: string;
  sessionId: string;
  slotId: string;
  signedAt: Date;
  method: string;
  signatureSha256: string | null;
  tokenId: string | null;
}): string {
  return sha256(canonicalJson({ ...record, timezone: "UTC" }));
}

export function correctionRecordHash(record: {
  enrollmentId: string;
  slotId: string;
  state: AttendanceStateValue;
  eventAt: Date | null;
  reason: string;
  authorUserId: string | null;
  authorTrainerId: string | null;
  createdAt: Date;
}): string {
  return sha256(canonicalJson(record));
}

/** Fingerprint of a whole attendance sheet: hash of the sorted record fingerprints (C7). */
export function sheetFingerprint(recordHashes: readonly string[]): string {
  return sha256([...recordHashes].sort().join("\n"));
}

export type SlotEvidence = {
  /** Signature record, if any (`method` null for legacy admin marks without signature). */
  attendance: { present: boolean; method: string | null; signedAt: Date | null } | null;
  corrections: readonly { state: AttendanceStateValue; createdAt: Date; eventAt?: Date | null; reason?: string }[];
};

export type SlotAttendance = {
  state: AttendanceStateValue | "unknown";
  /** A signature (drawn, on the trainer's device or checkbox attestation) exists for the slot. */
  signed: boolean;
  /** The state comes from a correction. */
  corrected: boolean;
};

/** Attendance of one slot: the latest correction wins over the signature; legacy marks count as declared. */
export function slotAttendance(evidence: SlotEvidence): SlotAttendance {
  const signed = Boolean(evidence.attendance?.method);
  const latest = [...evidence.corrections].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (latest) return { state: latest.state, signed, corrected: true };
  if (signed) return { state: "present", signed, corrected: false };
  if (evidence.attendance)
    return { state: evidence.attendance.present ? "present" : "absent", signed, corrected: false };
  return { state: "unknown", signed, corrected: false };
}

/** The trainee attended the slot (fully or partly). */
export function attended(state: SlotAttendance["state"]): boolean {
  return state === "present" || state === "late" || state === "left_early";
}

/**
 * Hours actually signed (B6, certificate of completion): slots with a
 * signature that were not corrected to an absence. Admin marks without a
 * signature do not count.
 */
export function signedHours(slots: readonly (TimeRange & { attendance: SlotAttendance })[]): number {
  const minutes = slots
    .filter((slot) => slot.attendance.signed && slot.attendance.state !== "absent")
    .reduce((sum, slot) => sum + (slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000, 0);
  return Math.round((minutes / 60) * 100) / 100;
}
