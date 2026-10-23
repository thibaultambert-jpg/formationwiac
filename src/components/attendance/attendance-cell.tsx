import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import { formatDateTime, formatTime } from "@/lib/dates";
import { ATTENDANCE_STATE_LABELS, SIGNATURE_METHOD_LABELS } from "@/lib/labels";
import type { SlotAttendance } from "@/server/domain/attendance-proof";

type Cell = {
  attendance: { signedAt: Date | null; method: string | null } | null;
  corrections: {
    state: string;
    eventAt: Date | null;
    reason: string;
    createdAt: Date;
    authorTrainerId: string | null;
  }[];
  view: SlotAttendance;
};

/** One attendance cell: signature (time and method) and the corrections history, latest last. */
export function AttendanceCell({ cell, children }: { cell: Cell; children?: React.ReactNode }) {
  const { view, attendance, corrections } = cell;
  const tone =
    view.state === "present"
      ? "text-emerald-800"
      : view.state === "absent"
        ? "text-destructive"
        : view.state === "unknown"
          ? "text-muted-foreground"
          : "text-amber-800";
  return (
    <div className="flex flex-col items-center gap-0.5 text-xs">
      <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
        {view.state === "present" ? (
          <CheckCircle2 aria-hidden="true" className="size-4" />
        ) : view.state === "late" || view.state === "left_early" ? (
          <Clock aria-hidden="true" className="size-4" />
        ) : view.state === "absent" ? (
          <CircleAlert aria-hidden="true" className="size-4" />
        ) : null}
        {ATTENDANCE_STATE_LABELS[view.state]}
      </span>
      {attendance?.method && attendance.signedAt ? (
        <span className="text-muted-foreground">
          Signé à {formatTime(attendance.signedAt)} · {SIGNATURE_METHOD_LABELS[attendance.method]}
        </span>
      ) : attendance && !attendance.method ? (
        <span className="text-muted-foreground">Saisie BO (avant l&apos;audit)</span>
      ) : null}
      {corrections.length > 0 ? (
        <details className="text-muted-foreground max-w-44 text-left">
          <summary className="cursor-pointer text-center">
            {corrections.length} correction{corrections.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-1 space-y-1">
            {corrections.map((correction, index) => (
              <li key={index}>
                {ATTENDANCE_STATE_LABELS[correction.state as keyof typeof ATTENDANCE_STATE_LABELS]}
                {correction.eventAt ? ` (${formatTime(correction.eventAt)})` : ""} : {correction.reason}
                <span className="block">
                  {correction.authorTrainerId ? "Formateur" : "Admin"}, {formatDateTime(correction.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {children}
    </div>
  );
}
