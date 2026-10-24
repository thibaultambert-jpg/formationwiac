// Result indicators per training (compliance audit D1, Qualiopi indicator 2):
// satisfaction, attendance, dropout, response and learning rates. Pure.

export type IndicatorEnrollment = {
  status: string;
  plannedHours: number;
  signedHours: number;
  hotSent: boolean;
  hotScore: number | null;
  hotSubmitted: boolean;
  learningResult: "acquired" | "partially_acquired" | "not_acquired" | null;
};

export type TrainingIndicators = {
  trainees: number;
  sessions: number;
  /** Average hot evaluation score (out of 5, as stored), null without answers. */
  satisfaction: number | null;
  /** Signed hours / planned hours, in %. */
  attendanceRate: number | null;
  /** Dropouts / trainees, in %. */
  dropoutRate: number | null;
  /** Absent trainees (no attended slot) / trainees, in %. */
  absenceRate: number | null;
  /** Hot evaluations answered / sent, in %. */
  responseRate: number | null;
  /** Acquired or partially acquired / assessed, in %. */
  learningRate: number | null;
};

const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null);
const TRAINEE_STATUSES = ["present", "absent", "dropped_out"];

/** Indicators of a set of enrollments of completed or running sessions (cancelled and waitlisted are ignored). */
export function trainingIndicators(rows: readonly IndicatorEnrollment[], sessions: number): TrainingIndicators {
  const trainees = rows.filter((row) => TRAINEE_STATUSES.includes(row.status));
  const planned = trainees.reduce((sum, row) => sum + row.plannedHours, 0);
  const signed = trainees.reduce((sum, row) => sum + row.signedHours, 0);
  const scores = trainees.filter((row) => row.hotScore !== null).map((row) => row.hotScore!);
  const sent = trainees.filter((row) => row.hotSent);
  const assessed = trainees.filter((row) => row.learningResult !== null);
  return {
    trainees: trainees.length,
    sessions,
    satisfaction: scores.length
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
      : null,
    attendanceRate: percent(signed, planned),
    dropoutRate: percent(trainees.filter((row) => row.status === "dropped_out").length, trainees.length),
    absenceRate: percent(trainees.filter((row) => row.status === "absent").length, trainees.length),
    responseRate: percent(sent.filter((row) => row.hotSubmitted).length, sent.length),
    learningRate: percent(assessed.filter((row) => row.learningResult !== "not_acquired").length, assessed.length),
  };
}
