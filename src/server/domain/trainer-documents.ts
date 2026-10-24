// Supporting documents of trainers (compliance audit D7, D12). Pure rules.

export type TrainerDocumentState = "valid" | "expiring" | "expired";

/** A document expiring within 30 days is flagged as expiring. */
export function documentState(expiresAt: Date | null, now: Date): TrainerDocumentState {
  if (!expiresAt) return "valid";
  if (expiresAt < now) return "expired";
  return expiresAt.getTime() - now.getTime() <= 30 * 86_400_000 ? "expiring" : "valid";
}

/** An external trainer is a subcontractor: a subcontracting contract in force is expected (D12). */
export function missingSubcontractingContract(
  trainer: { type: "internal" | "external" },
  documents: readonly { type: string; expiresAt: Date | null; archivedAt: Date | null }[],
  now: Date,
): boolean {
  if (trainer.type !== "external") return false;
  return !documents.some(
    (document) =>
      document.type === "subcontracting_contract" &&
      !document.archivedAt &&
      documentState(document.expiresAt, now) !== "expired",
  );
}
