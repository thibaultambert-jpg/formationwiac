export const SESSION_REFERENCE_PREFIX = "FORM";

/** FORM-2026-014: fixed prefix, year, yearly sequence padded to 3 digits. */
export function formatSessionReference(year: number, sequence: number): string {
  return `${SESSION_REFERENCE_PREFIX}-${year}-${String(sequence).padStart(3, "0")}`;
}

/** Next sequence for the year, given the highest sequence already used (or null). */
export function nextReferenceSequence(highestUsed: number | null): number {
  return (highestUsed ?? 0) + 1;
}
