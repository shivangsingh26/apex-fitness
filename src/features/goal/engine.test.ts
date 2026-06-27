import {
  bmrMifflin, activityFactor, tdee, daysBetween, dailyTargets,
  movingAverage, progressPercent, expectedWeight, onPace, projectedFinish,
} from "./engine";

describe("bmrMifflin", () => {
  it("male", () => expect(bmrMifflin("male", 80, 178, 30)).toBeCloseTo(1767.5, 1));
  it("female", () => expect(bmrMifflin("female", 80, 178, 30)).toBeCloseTo(1601.5, 1));
});

describe("activityFactor + tdee", () => {
  it("moderate factor", () => expect(activityFactor("moderate")).toBe(1.55));
  it("tdee adds steps kcal", () => {
    expect(tdee(1767.5, "moderate", 5000)).toBeCloseTo(1767.5 * 1.55 + 200, 1);
  });
});

describe("daysBetween", () => {
  it("counts days", () => expect(daysBetween("2026-06-28", "2026-07-08")).toBe(10));
});

describe("dailyTargets", () => {
  const base = {
    sex: "male" as const, weightKg: 85, heightCm: 178, age: 30, activity: "moderate" as const,
    steps: 0, startWeightKg: 85, targetWeightKg: 75, today: "2026-06-28",
  };
  it("computes target above the floor", () => {
    const r = dailyTargets({ ...base, targetDate: "2026-10-06" }); // 100 days
    expect(r.dailyDeficit).toBeCloseTo(770, 0);
    expect(r.proteinTarget).toBe(170);
    expect(r.calorieTarget).toBeCloseTo(1817.5 * 1.55 - 770, 0);
  });
  it("floors at max(bmr,1200) when deficit too big", () => {
    const r = dailyTargets({ ...base, targetDate: "2026-07-08" }); // 10 days -> huge deficit
    const bmr = bmrMifflin("male", 85, 178, 30);
    expect(r.calorieTarget).toBeCloseTo(Math.max(bmr, 1200), 1);
  });
});

describe("movingAverage", () => {
  it("averages all when fewer than window", () => expect(movingAverage([84, 82])).toBe(83));
  it("uses last <window> values", () => expect(movingAverage([90, 1, 2, 3, 4, 5, 6, 7], 7)).toBeCloseTo(4, 5));
});

describe("progressPercent", () => {
  it("normal", () => expect(progressPercent(85, 82, 75)).toBeCloseTo(30, 5));
  it("clamps to 0", () => expect(progressPercent(85, 86, 75)).toBe(0));
  it("clamps to 100", () => expect(progressPercent(85, 74, 75)).toBe(100));
});

describe("expectedWeight", () => {
  it("linear midpoint", () => {
    expect(expectedWeight(85, 75, "2026-10-06", "2026-06-28", "2026-08-17")).toBeCloseTo(80, 0);
  });
});

describe("onPace", () => {
  it("behind when heavier than expected", () => expect(onPace(81, 80).status).toBe("behind"));
  it("ahead when lighter", () => expect(onPace(79, 80).status).toBe("ahead"));
  it("on within tolerance", () => expect(onPace(80.1, 80).status).toBe("on"));
});

describe("projectedFinish", () => {
  it("null when no progress", () => {
    expect(projectedFinish(85, 85, 75, "2026-06-28", "2026-07-08")).toBeNull();
  });
  it("returns a date when progressing", () => {
    const d = projectedFinish(85, 84, 75, "2026-06-28", "2026-07-08");
    expect(typeof d).toBe("string");
  });
});
