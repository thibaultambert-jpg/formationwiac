// Data for the annual pedagogical and financial report (bilan pédagogique et
// financier, compliance audit B7). Hours come from signed slots only (B6).
// Pure functions, unit tested.
import type { FundingTypeValue, ParticipantTypeValue } from "./compliance";

export type BpfEnrollment = {
  participantType: ParticipantTypeValue;
  fundingType: FundingTypeValue;
  /** Hours signed during the year. */
  hours: number;
  /** Price excluding tax invoiced for the enrollment (externals), counted in the year of its first slot. */
  revenue: number;
  /** The session is run by an external trainer (subcontracting, D12). */
  subcontracted?: boolean;
};

export type BpfLine = { key: string; trainees: number; hours: number; revenue: number };

export type BpfSummary = {
  total: BpfLine;
  /** Trainee-hours delivered by subcontracted (external) trainers (D12). */
  subcontracted: BpfLine;
  byFunding: BpfLine[];
  byPublic: BpfLine[];
};

const round = (value: number) => Math.round(value * 100) / 100;

function line(key: string, rows: readonly BpfEnrollment[]): BpfLine {
  return {
    key,
    trainees: rows.length,
    hours: round(rows.reduce((sum, row) => sum + row.hours, 0)),
    revenue: round(rows.reduce((sum, row) => sum + row.revenue, 0)),
  };
}

function groupBy<K extends string>(rows: readonly BpfEnrollment[], key: (row: BpfEnrollment) => K): BpfLine[] {
  const groups = new Map<K, BpfEnrollment[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return [...groups.entries()].map(([name, items]) => line(name, items)).sort((a, b) => b.hours - a.hours);
}

/**
 * Trainees, trainee-hours and revenue of the year, by funding type and by
 * public. Enrollments without any signed hour are not trainees of the year.
 * Internals are left out unless `includeInternal` (decision: filterable).
 */
export function bpfSummary(rows: readonly BpfEnrollment[], includeInternal: boolean): BpfSummary {
  const kept = rows.filter((row) => row.hours > 0 && (includeInternal || row.participantType === "external"));
  return {
    total: line("total", kept),
    subcontracted: line("subcontracted", kept.filter((row) => row.subcontracted)),
    byFunding: groupBy(kept, (row) => row.fundingType),
    byPublic: groupBy(kept, (row) => row.participantType),
  };
}
