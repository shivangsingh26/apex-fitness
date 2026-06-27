import { epley1RM, detectPRs } from "./prEngine";

describe("epley1RM", () => {
  it("computes Epley estimate", () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 2);
  });
  it("equals weight at 0 reps base (1 rep)", () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.333, 2);
  });
  it("guards non-positive input", () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(-10, 5)).toBe(0);
  });
});

describe("detectPRs", () => {
  it("flags both PRs when no history", () => {
    const r = detectPRs({ weightKg: 100, reps: 5 }, { bestWeightKg: 0, best1RM: 0 });
    expect(r.isWeightPr).toBe(true);
    expect(r.is1RmPr).toBe(true);
    expect(r.est1RM).toBeCloseTo(116.667, 2);
  });
  it("flags 1RM PR but not weight PR (more reps, lighter)", () => {
    const r = detectPRs({ weightKg: 100, reps: 8 }, { bestWeightKg: 110, best1RM: 115 });
    expect(r.isWeightPr).toBe(false);
    expect(r.is1RmPr).toBe(true); // 100*(1+8/30)=126.67 > 115
  });
  it("flags weight PR but not 1RM PR", () => {
    const r = detectPRs({ weightKg: 120, reps: 1 }, { bestWeightKg: 110, best1RM: 130 });
    expect(r.isWeightPr).toBe(true);  // 120 > 110
    expect(r.is1RmPr).toBe(false);    // 120*(1+1/30)=124 < 130
  });
  it("flags neither when below both bests", () => {
    const r = detectPRs({ weightKg: 80, reps: 5 }, { bestWeightKg: 110, best1RM: 130 });
    expect(r.isWeightPr).toBe(false);
    expect(r.is1RmPr).toBe(false);
  });
});
