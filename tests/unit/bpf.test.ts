import { describe, expect, it } from "vitest";
import { bpfSummary, type BpfEnrollment } from "@/server/domain/bpf";

const rows: BpfEnrollment[] = [
  { participantType: "external", fundingType: "opco", hours: 7, revenue: 900, subcontracted: true },
  { participantType: "external", fundingType: "opco", hours: 3.5, revenue: 900 },
  { participantType: "external", fundingType: "company", hours: 14, revenue: 1500.5 },
  { participantType: "external", fundingType: "cpf", hours: 0, revenue: 800 },
  { participantType: "internal", fundingType: "none", hours: 7, revenue: 0 },
];

describe("BPF (B7)", () => {
  it("counts externals only by default, with signed hours", () => {
    const summary = bpfSummary(rows, false);
    expect(summary.total).toEqual({ key: "total", trainees: 3, hours: 24.5, revenue: 3300.5 });
    expect(summary.byFunding).toEqual([
      { key: "company", trainees: 1, hours: 14, revenue: 1500.5 },
      { key: "opco", trainees: 2, hours: 10.5, revenue: 1800 },
    ]);
    expect(summary.byPublic).toEqual([{ key: "external", trainees: 3, hours: 24.5, revenue: 3300.5 }]);
  });

  it("isolates the hours delivered by subcontracted trainers (D12)", () => {
    expect(bpfSummary(rows, false).subcontracted).toEqual({ key: "subcontracted", trainees: 1, hours: 7, revenue: 900 });
  });

  it("includes internals when asked", () => {
    const summary = bpfSummary(rows, true);
    expect(summary.total.trainees).toBe(4);
    expect(summary.byPublic.find((item) => item.key === "internal")).toEqual({
      key: "internal",
      trainees: 1,
      hours: 7,
      revenue: 0,
    });
  });

  it("leaves out enrollments without any signed hour", () => {
    expect(bpfSummary(rows, true).byFunding.some((item) => item.key === "cpf")).toBe(false);
  });
});
