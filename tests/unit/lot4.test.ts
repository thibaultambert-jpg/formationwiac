import { describe, expect, it } from "vitest";
import {
  attendanceLinkDays,
  closureDue,
  coldEvaluationDue,
  evaluationReminderDue,
  presenceAtClosure,
  reminderDue,
  signingWindowOpen,
} from "@/server/domain/automation";
import { globalScore, summarize, validateAnswers, type Question } from "@/server/domain/evaluations";

const at = (iso: string) => new Date(iso);
// Monday 16/11/2026, Paris = UTC+1.
const slots = [
  { startsAt: at("2026-11-16T08:00:00Z"), endsAt: at("2026-11-16T11:30:00Z") },
  { startsAt: at("2026-11-16T12:30:00Z"), endsAt: at("2026-11-16T16:00:00Z") },
  { startsAt: at("2026-11-17T08:00:00Z"), endsAt: at("2026-11-17T11:30:00Z") },
];

describe("automatic sends windows", () => {
  it("sends the J-3 reminder from 06:00 Paris three days before, until the start", () => {
    expect(reminderDue(slots[0].startsAt, 3, at("2026-11-13T04:59:00Z"))).toBe(false);
    expect(reminderDue(slots[0].startsAt, 3, at("2026-11-13T05:00:00Z"))).toBe(true);
    expect(reminderDue(slots[0].startsAt, 3, at("2026-11-16T07:59:00Z"))).toBe(true);
    expect(reminderDue(slots[0].startsAt, 3, at("2026-11-16T08:00:00Z"))).toBe(false);
  });

  it("sends one attendance link per day, from 06:00 until the day's last slot ends", () => {
    expect(attendanceLinkDays(slots, at("2026-11-16T04:00:00Z"))).toEqual([]);
    expect(attendanceLinkDays(slots, at("2026-11-16T05:10:00Z")).map((day) => day.day)).toEqual(["2026-11-16"]);
    expect(attendanceLinkDays(slots, at("2026-11-16T16:00:00Z"))).toEqual([]);
    expect(attendanceLinkDays(slots, at("2026-11-17T05:15:00Z")).map((day) => day.day)).toEqual(["2026-11-17"]);
  });

  it("closes after the last slot and schedules cold evaluation and reminders", () => {
    expect(closureDue(slots[2].endsAt, at("2026-11-17T11:29:00Z"))).toBe(false);
    expect(closureDue(slots[2].endsAt, at("2026-11-17T11:30:00Z"))).toBe(true);
    expect(coldEvaluationDue(slots[2].endsAt, 60, at("2027-01-16T04:59:00Z"))).toBe(false);
    expect(coldEvaluationDue(slots[2].endsAt, 60, at("2027-01-16T05:00:00Z"))).toBe(true);
    expect(evaluationReminderDue(at("2026-11-17T12:00:00Z"), 5, at("2026-11-22T11:59:00Z"))).toBe(false);
    expect(evaluationReminderDue(at("2026-11-17T12:00:00Z"), 5, at("2026-11-22T12:00:00Z"))).toBe(true);
  });
});

describe("signing window", () => {
  it("opens 30 minutes before the slot and closes at 23:59 Paris the same day", () => {
    expect(signingWindowOpen(slots[0], at("2026-11-16T07:29:00Z"))).toBe(false);
    expect(signingWindowOpen(slots[0], at("2026-11-16T07:30:00Z"))).toBe(true);
    expect(signingWindowOpen(slots[0], at("2026-11-16T22:59:59Z"))).toBe(true);
    expect(signingWindowOpen(slots[0], at("2026-11-16T23:00:00Z"))).toBe(false);
  });

  it("derives presence at closure (rule 8)", () => {
    expect(presenceAtClosure(0)).toBe("absent");
    expect(presenceAtClosure(2)).toBe("present");
  });
});

describe("evaluations", () => {
  const questions: Question[] = [
    { id: "q1", label: "Satisfaction", answerType: "scale_1_5", options: null, required: true },
    {
      id: "q2",
      label: "Objectifs",
      answerType: "single_choice",
      options: ["Oui", "Partiellement", "Non"],
      required: true,
    },
    { id: "q3", label: "Recommandation", answerType: "scale_0_10", options: null, required: true },
    {
      id: "q4",
      label: "Freins",
      answerType: "choice_with_other",
      options: ["Pas d'occasion", "Autre"],
      required: false,
    },
    { id: "q5", label: "Remarques", answerType: "text", options: null, required: false },
    { id: "q6", label: "Clarté", answerType: "scale_1_5", options: null, required: true },
  ];

  it("validates required answers, ranges and options", () => {
    const result = validateAnswers(questions, { q1: "6", q2: "Peut-être", q3: "", q6: "4" });
    expect(result).toEqual({
      ok: false,
      errors: {
        q1: "Choisissez une note de 1 à 5.",
        q2: "Choisissez une des réponses proposées.",
        q3: "Réponse obligatoire.",
      },
    });
  });

  it("stores answers with labels and computes the global score", () => {
    const result = validateAnswers(questions, {
      q1: "5",
      q2: "Oui",
      q3: "9",
      q4: "Autre",
      "q4.other": "Planning",
      q5: " Très bien ",
      q6: "4",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers[3]).toEqual({
      questionId: "q4",
      label: "Freins",
      answerType: "choice_with_other",
      answer: "Autre",
      other: "Planning",
    });
    expect(result.answers[4].answer).toBe("Très bien");
    expect(globalScore(result.answers)).toBe(4.5);
  });

  it("summarizes averages, distributions and verbatims", () => {
    const a = validateAnswers(questions, { q1: "5", q2: "Oui", q3: "10", q5: "Super", q6: "5" });
    const b = validateAnswers(questions, { q1: "3", q2: "Non", q3: "6", q4: "Autre", "q4.other": "Temps", q6: "4" });
    if (!a.ok || !b.ok) throw new Error("invalid fixtures");
    const summary = summarize(questions, [a.answers, b.answers]);
    expect(summary[0]).toMatchObject({ responses: 2, average: 4 });
    expect(summary[0].distribution.find((entry) => entry.value === "5")?.count).toBe(1);
    expect(summary[1].distribution).toEqual([
      { value: "Oui", count: 1 },
      { value: "Partiellement", count: 0 },
      { value: "Non", count: 1 },
    ]);
    expect(summary[3].verbatims).toEqual(["Autre : Temps"]);
    expect(summary[4].verbatims).toEqual(["Super"]);
  });
});
