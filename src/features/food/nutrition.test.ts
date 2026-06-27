import { macrosForGrams, gramsFromServings, dayTotals, remaining, Macros } from "./nutrition";

const per100: Macros = { kcal: 200, protein: 10, carb: 20, fat: 8, fiber: 3 };

describe("macrosForGrams", () => {
  it("scales by grams/100", () => {
    expect(macrosForGrams(per100, 150)).toEqual({ kcal: 300, protein: 15, carb: 30, fat: 12, fiber: 4.5 });
  });
  it("zeros on non-positive grams", () => {
    expect(macrosForGrams(per100, 0)).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 });
    expect(macrosForGrams(per100, -50)).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 });
  });
});

describe("gramsFromServings", () => {
  it("multiplies serving size", () => {
    expect(gramsFromServings(30, 2)).toBe(60);
  });
  it("guards non-positive", () => {
    expect(gramsFromServings(0, 2)).toBe(0);
    expect(gramsFromServings(30, -1)).toBe(0);
  });
});

describe("dayTotals", () => {
  it("sums element-wise", () => {
    const a: Macros = { kcal: 100, protein: 5, carb: 10, fat: 2, fiber: 1 };
    const b: Macros = { kcal: 200, protein: 10, carb: 20, fat: 4, fiber: 2 };
    expect(dayTotals([a, b])).toEqual({ kcal: 300, protein: 15, carb: 30, fat: 6, fiber: 3 });
  });
  it("returns zeros for empty", () => {
    expect(dayTotals([])).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 });
  });
});

describe("remaining", () => {
  const totals: Macros = { kcal: 1800, protein: 120, carb: 150, fat: 60, fiber: 20 };
  it("computes left when targets set", () => {
    expect(remaining(totals, 2200, 165)).toEqual({ kcalLeft: 400, proteinLeft: 45 });
  });
  it("nulls when target null", () => {
    expect(remaining(totals, null, null)).toEqual({ kcalLeft: null, proteinLeft: null });
  });
});
