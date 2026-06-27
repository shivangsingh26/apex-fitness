import { ageFromBirthdate, validateProfile, validateGoal } from "./validation";

describe("ageFromBirthdate", () => {
  it("computes age before birthday this year", () => {
    expect(ageFromBirthdate("1995-12-31", new Date("2026-06-26"))).toBe(30);
  });
  it("computes age after birthday this year", () => {
    expect(ageFromBirthdate("1995-01-01", new Date("2026-06-26"))).toBe(31);
  });
});

describe("validateProfile", () => {
  const ok = { sex: "male", birthdate: "1995-01-01", heightCm: 178, activityLevel: "moderate" };
  it("accepts a valid profile", () => {
    expect(validateProfile(ok)).toEqual([]);
  });
  it("rejects bad sex", () => {
    expect(validateProfile({ ...ok, sex: "x" })).toContain("Sex must be male or female");
  });
  it("rejects impossible height", () => {
    expect(validateProfile({ ...ok, heightCm: 10 })).toContain("Height must be between 100 and 250 cm");
  });
});

describe("validateGoal", () => {
  const ok = { startWeightKg: 85, targetWeightKg: 75, targetBfPct: 12, targetDate: "2026-12-01" };
  it("accepts a valid goal", () => {
    expect(validateGoal(ok, new Date("2026-06-26"))).toEqual([]);
  });
  it("rejects a target date in the past", () => {
    expect(validateGoal({ ...ok, targetDate: "2026-01-01" }, new Date("2026-06-26")))
      .toContain("Target date must be in the future");
  });
  it("rejects target heavier than start for a lean goal", () => {
    expect(validateGoal({ ...ok, targetWeightKg: 95 }, new Date("2026-06-26")))
      .toContain("Target weight must be below start weight");
  });
});
