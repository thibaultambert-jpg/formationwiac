import "server-only";
import { db } from "@/lib/db";
import { toParisDateInput } from "@/lib/dates";
import { audit } from "@/server/audit";

export type ExportTrace = {
  userId: string;
  /** Audited entity: "session", "company", "settings"… and its id ("list" for lists). */
  entity: string;
  entityId: string;
  /** Filters of the list (query string) and row count, kept in the audit log (G2). */
  filters?: Record<string, string>;
  rows: number;
};

/** CSV download; every export is written to the audit log (compliance audit G2). */
export async function csvResponse(csv: string, baseName: string, trace: ExportTrace): Promise<Response> {
  const filename = `${baseName}-${toParisDateInput(new Date())}.csv`;
  await audit(db, {
    userId: trace.userId,
    action: "export",
    entity: trace.entity,
    entityId: trace.entityId,
    after: { file: filename, rows: trace.rows, filters: trace.filters ?? {} },
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Query string of a request as a plain object (filters of an exported list). */
export function requestFilters(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
