import { describe, expect, it } from "vitest";
import { documentState, missingSubcontractingContract } from "@/server/domain/trainer-documents";

const now = new Date("2026-10-24T10:00:00Z");

describe("trainer documents (D7, D12)", () => {
  it("flags expired and soon expiring documents", () => {
    expect(documentState(null, now)).toBe("valid");
    expect(documentState(new Date("2026-10-01"), now)).toBe("expired");
    expect(documentState(new Date("2026-11-10"), now)).toBe("expiring");
    expect(documentState(new Date("2027-06-01"), now)).toBe("valid");
  });

  it("expects a subcontracting contract in force for external trainers only", () => {
    const contract = { type: "subcontracting_contract", expiresAt: new Date("2027-01-01"), archivedAt: null };
    expect(missingSubcontractingContract({ type: "internal" }, [], now)).toBe(false);
    expect(missingSubcontractingContract({ type: "external" }, [], now)).toBe(true);
    expect(missingSubcontractingContract({ type: "external" }, [contract], now)).toBe(false);
    expect(
      missingSubcontractingContract({ type: "external" }, [{ ...contract, expiresAt: new Date("2026-01-01") }], now),
    ).toBe(true);
    expect(missingSubcontractingContract({ type: "external" }, [{ ...contract, archivedAt: now }], now)).toBe(true);
  });
});
