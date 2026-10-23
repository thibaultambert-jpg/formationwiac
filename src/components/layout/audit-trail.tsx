import { formatDateTime } from "@/lib/dates";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  ENROLLMENT_STATUS_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/labels";

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  createdAt: Date;
  before: unknown;
  after: unknown;
  actor: string;
  subject?: string;
};

const FIELD_LABELS: Record<string, string> = {
  status: "statut",
  reason: "motif",
  capacityMax: "capacité max",
  capacityMin: "capacité min",
  location: "lieu",
  videoLink: "lien visio",
  registrationDeadline: "date limite",
  openToInternal: "ouverte aux internes",
  openToExternal: "ouverte aux externes",
  internalNotes: "notes",
  qualiopiScope: "périmètre Qualiopi",
  accessInfo: "accès",
  fundingType: "financement",
  thingsToBring: "à prévoir",
  slots: "créneaux",
  trainerIds: "formateurs",
  trainingId: "formation",
  appliedPrice: "prix",
  billingCompanyId: "entreprise payeuse",
  reference: "référence",
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "status" && typeof value === "string") {
    return (
      (ENROLLMENT_STATUS_LABELS as Record<string, string>)[value] ??
      (SESSION_STATUS_LABELS as Record<string, string>)[value] ??
      value
    );
  }
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (Array.isArray(value)) return value.length > 3 ? `${value.slice(0, 3).join(", ")}…` : value.join(", ");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(new Date(value));
  return String(value);
}

function describe(row: AuditRow): string[] {
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  return Object.keys(FIELD_LABELS)
    .filter((key) => key in after || key in before)
    .filter((key) => !(row.action === "create" && !["status", "reference"].includes(key)))
    .map((key) =>
      key in before
        ? `${FIELD_LABELS[key]} : ${formatValue(key, before[key])} → ${formatValue(key, after[key])}`
        : `${FIELD_LABELS[key]} : ${formatValue(key, after[key])}`,
    );
}

export function AuditTrail({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">Aucun événement enregistré.</p>;
  return (
    <ol className="divide-y rounded-md border">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[11rem_1fr]">
          <time className="text-muted-foreground" dateTime={row.createdAt.toISOString()}>
            {formatDateTime(row.createdAt)}
          </time>
          <div>
            <p>
              <span className="font-medium">{AUDIT_ACTION_LABELS[row.action] ?? row.action}</span>
              {" · "}
              {AUDIT_ENTITY_LABELS[row.entity] ?? row.entity}
              {row.subject ? ` ${row.subject}` : ""}
              <span className="text-muted-foreground"> — {row.actor}</span>
            </p>
            {describe(row).map((line) => (
              <p key={line} className="text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
