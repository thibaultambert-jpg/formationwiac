import { describe, expect, it } from "vitest";
import { trainingIndicators, type IndicatorEnrollment } from "@/server/domain/indicators";

const base: IndicatorEnrollment = {
  status: "present",
  plannedHours: 7,
  signedHours: 7,
  hotSent: true,
  hotScore: 4.5,
  hotSubmitted: true,
  learningResult: "acquired",
};

describe("training indicators (D1)", () => {
  it("computes satisfaction, attendance, dropout, response and learning rates", () => {
    const result = trainingIndicators(
      [
        base,
        { ...base, signedHours: 3.5, hotScore: 3.5, learningResult: "not_acquired" },
        { ...base, status: "dropped_out", signedHours: 3.5, hotSent: false, hotScore: null, hotSubmitted: false, learningResult: null },
        { ...base, status: "absent", signedHours: 0, hotSent: false, hotScore: null, hotSubmitted: false, learningResult: null },
        { ...base, status: "cancelled" },
      ],
      2,
    );
    expect(result).toEqual({
      trainees: 4,
      sessions: 2,
      satisfaction: 4,
      attendanceRate: 50,
      dropoutRate: 25,
      absenceRate: 25,
      responseRate: 100,
      learningRate: 50,
    });
  });

  it("returns empty indicators without trainees", () => {
    expect(trainingIndicators([], 0)).toMatchObject({ trainees: 0, satisfaction: null, attendanceRate: null });
  });
});
