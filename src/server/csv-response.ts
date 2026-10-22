import "server-only";
import { toParisDateInput } from "@/lib/dates";

export function csvResponse(csv: string, baseName: string): Response {
  const filename = `${baseName}-${toParisDateInput(new Date())}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
