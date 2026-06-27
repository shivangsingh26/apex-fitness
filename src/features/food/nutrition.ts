export type Macros = { kcal: number; protein: number; carb: number; fat: number; fiber: number };

const ZERO: Macros = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 };

export function macrosForGrams(per100: Macros, grams: number): Macros {
  if (grams <= 0) return { ...ZERO };
  const f = grams / 100;
  return {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carb: per100.carb * f,
    fat: per100.fat * f,
    fiber: per100.fiber * f,
  };
}

export function gramsFromServings(servingG: number, n: number): number {
  if (servingG <= 0 || n <= 0) return 0;
  return servingG * n;
}

export function dayTotals(snapshots: Macros[]): Macros {
  return snapshots.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carb: acc.carb + m.carb,
      fat: acc.fat + m.fat,
      fiber: acc.fiber + m.fiber,
    }),
    { ...ZERO }
  );
}

export function remaining(
  totals: Macros,
  targetKcal: number | null,
  targetProtein: number | null
): { kcalLeft: number | null; proteinLeft: number | null } {
  return {
    kcalLeft: targetKcal == null ? null : targetKcal - totals.kcal,
    proteinLeft: targetProtein == null ? null : targetProtein - totals.protein,
  };
}
