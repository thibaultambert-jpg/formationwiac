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
  /**
   * Split of the revenue by source when several payers share it (subrogation:
   * the funder's part and the company's remainder). Defaults to the whole
   * revenue under `fundingType`.
   */
  revenueShares?: { fundingType: FundingTypeValue; amount: number }[];
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
 * Trainees and hours by the funding of the enrollment; revenue by the source
 * that actually pays it (revenue shares).
 */
function byFunding(rows: readonly BpfEnrollment[]): BpfLine[] {
  const lines = new Map(groupBy(rows, (row) => row.fundingType).map((item) => [item.key, { ...item, revenue: 0 }]));
  for (const row of rows) {
    for (const share of row.revenueShares ?? [{ fundingType: row.fundingType, amount: row.revenue }]) {
      const target = lines.get(share.fundingType) ?? { key: share.fundingType, trainees: 0, hours: 0, revenue: 0 };
      target.revenue = round(target.revenue + share.amount);
      lines.set(share.fundingType, target);
    }
  }
  return [...lines.values()].sort((a, b) => b.hours - a.hours);
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
    subcontracted: line(
      "subcontracted",
      kept.filter((row) => row.subcontracted),
    ),
    byFunding: byFunding(kept),
    byPublic: groupBy(kept, (row) => row.participantType),
  };
}
