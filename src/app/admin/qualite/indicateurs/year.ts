import { parisYear } from "@/lib/dates";

/** Year filter of the indicators (current year by default). */
export function readYear(params: Record<string, string | string[] | undefined>, now = new Date()): number {
  const raw = Number(typeof params.annee === "string" ? params.annee : NaN);
  return Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : parisYear(now);
}
