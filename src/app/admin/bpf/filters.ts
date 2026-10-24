import { parisYear } from "@/lib/dates";

export type BpfFilters = { year: number; includeInternal: boolean };

/** Filters of the BPF page and export, read from the query string. */
export function readBpfFilters(params: Record<string, string | string[] | undefined>, now = new Date()): BpfFilters {
  const raw = Number(typeof params.annee === "string" ? params.annee : NaN);
  const year = Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : parisYear(now) - 1;
  return { year, includeInternal: params.internes === "1" };
}
