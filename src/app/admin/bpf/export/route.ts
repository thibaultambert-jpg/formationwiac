import { formatDate } from "@/lib/dates";
import { FUNDING_TYPE_LABELS, PARTICIPANT_TYPE_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/server/auth/guards";
import { bpfSummary, type BpfLine } from "@/server/domain/bpf";
import { toCsv } from "@/server/domain/csv";
import { formatDecimal } from "@/server/domain/numbers";
import { csvResponse, requestFilters } from "@/server/csv-response";
import { bpfRows } from "@/server/services/bpf";
import { readBpfFilters } from "../filters";

// BPF export (B7): synthesis by funding and public, or the detail per trainee.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const params = requestFilters(request);
  const filters = readBpfFilters(params);
  const rows = await bpfRows(filters.year);
  const trace = { userId: user.id, entity: "bpf", entityId: String(filters.year), filters: params };

  if (params.vue === "detail") {
    const kept = rows.filter((row) => filters.includeInternal || row.participantType === "external");
    const csv = toCsv(
      [
        "Session",
        "Formation",
        "Début",
        "Stagiaire",
        "Entreprise",
        "Public",
        "Financement",
        "Heures signées",
        "Prix HT",
      ],
      kept.map((row) => [
        row.session,
        row.training,
        formatDate(row.firstSlot),
        row.participant,
        row.company,
        PARTICIPANT_TYPE_LABELS[row.participantType],
        FUNDING_TYPE_LABELS[row.fundingType],
        formatDecimal(row.hours),
        formatDecimal(row.revenue),
      ]),
    );
    return csvResponse(csv, `bpf-${filters.year}-detail`, { ...trace, rows: kept.length });
  }

  const summary = bpfSummary(rows, filters.includeInternal);
  const lines: [string, string, BpfLine][] = [
    ...summary.byFunding.map((line): [string, string, BpfLine] => [
      "Financement",
      FUNDING_TYPE_LABELS[line.key as keyof typeof FUNDING_TYPE_LABELS] ?? line.key,
      line,
    ]),
    ...summary.byPublic.map((line): [string, string, BpfLine] => [
      "Public",
      PARTICIPANT_TYPE_LABELS[line.key as keyof typeof PARTICIPANT_TYPE_LABELS] ?? line.key,
      line,
    ]),
    ["Sous-traitance", "Formateurs externes", summary.subcontracted],
    ["Total", "Total", summary.total],
  ];
  const csv = toCsv(
    ["Axe", "Catégorie", "Stagiaires", "Heures-stagiaires", "Produits HT"],
    lines.map(([axis, label, line]) => [
      axis,
      label,
      line.trainees,
      formatDecimal(line.hours),
      formatDecimal(line.revenue),
    ]),
  );
  return csvResponse(csv, `bpf-${filters.year}`, { ...trace, rows: lines.length });
}
