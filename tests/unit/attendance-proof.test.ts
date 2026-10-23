import { describe, expect, it } from "vitest";
import {
  attended,
  canonicalJson,
  correctionRecordHash,
  insideWindow,
  linkWindow,
  sheetFingerprint,
  signatureRecordHash,
  signedHours,
  slotAttendance,
} from "@/server/domain/attendance-proof";

const slot = { startsAt: new Date("2026-11-16T08:00:00Z"), endsAt: new Date("2026-11-16T11:30:00Z") };

describe("personal attendance link window (C2)", () => {
  it("opens before the slot and closes after its end", () => {
    const window = linkWindow(slot, { before: 30, after: 60 });
    expect(window.validFrom.toISOString()).toBe("2026-11-16T07:30:00.000Z");
    expect(window.expiresAt.toISOString()).toBe("2026-11-16T12:30:00.000Z");
    expect(insideWindow(window, new Date("2026-11-16T07:29:59Z"))).toBe(false);
    expect(insideWindow(window, new Date("2026-11-16T09:00:00Z"))).toBe(true);
    expect(insideWindow(window, new Date("2026-11-16T12:30:01Z"))).toBe(false);
  });
});

describe("fingerprints (C5, C7)", () => {
  const record = {
    kind: "participant" as const,
    personId: "p",
    sessionId: "s",
    slotId: "sl",
    signedAt: new Date("2026-11-16T08:05:00Z"),
    method: "participant_link",
    signatureSha256: "abc",
    tokenId: "t",
  };

  it("is stable and independent of key order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(signatureRecordHash(record)).toBe(signatureRecordHash({ ...record }));
    expect(signatureRecordHash(record)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any proof element changes", () => {
    expect(signatureRecordHash({ ...record, signedAt: new Date("2026-11-16T08:05:01Z") })).not.toBe(
      signatureRecordHash(record),
    );
    expect(signatureRecordHash({ ...record, signatureSha256: "abd" })).not.toBe(signatureRecordHash(record));
    const correction = {
      enrollmentId: "e",
      slotId: "sl",
      state: "absent" as const,
      eventAt: null,
      reason: "Malade",
      authorUserId: null,
      authorTrainerId: "tr",
      createdAt: new Date("2026-11-16T09:00:00Z"),
    };
    expect(correctionRecordHash(correction)).not.toBe(correctionRecordHash({ ...correction, reason: "Autre" }));
  });

  it("fingerprints a sheet independently of the record order", () => {
    expect(sheetFingerprint(["b", "a"])).toBe(sheetFingerprint(["a", "b"]));
    expect(sheetFingerprint(["a"])).not.toBe(sheetFingerprint(["a", "b"]));
  });
});

describe("attendance state of a slot", () => {
  const signature = { present: true, method: "participant_link", signedAt: new Date() };

  it("is present when signed, unknown without anything", () => {
    expect(slotAttendance({ attendance: signature, corrections: [] })).toEqual({
      state: "present",
      signed: true,
      corrected: false,
    });
    expect(slotAttendance({ attendance: null, corrections: [] }).state).toBe("unknown");
  });

  it("lets the latest correction win without hiding the signature", () => {
    const view = slotAttendance({
      attendance: signature,
      corrections: [
        { state: "absent", createdAt: new Date("2026-11-16T09:00:00Z") },
        { state: "late", createdAt: new Date("2026-11-16T10:00:00Z") },
      ],
    });
    expect(view).toEqual({ state: "late", signed: true, corrected: true });
    expect(attended(view.state)).toBe(true);
    expect(attended("absent")).toBe(false);
  });

  it("keeps legacy admin marks (without signature) as declared", () => {
    expect(slotAttendance({ attendance: { present: true, method: null, signedAt: null }, corrections: [] })).toEqual({
      state: "present",
      signed: false,
      corrected: false,
    });
  });
});

describe("signed hours (B6)", () => {
  it("counts only signed slots not corrected to an absence", () => {
    const morning = { ...slot };
    const afternoon = { startsAt: new Date("2026-11-16T12:30:00Z"), endsAt: new Date("2026-11-16T16:00:00Z") };
    expect(
      signedHours([
        { ...morning, attendance: { state: "present", signed: true, corrected: false } },
        { ...afternoon, attendance: { state: "present", signed: false, corrected: true } },
      ]),
    ).toBe(3.5);
    expect(signedHours([{ ...morning, attendance: { state: "absent", signed: true, corrected: true } }])).toBe(0);
  });
});
