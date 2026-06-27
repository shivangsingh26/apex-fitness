export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

export type SetInput = { weightKg: number; reps: number };
export type ExerciseBests = { bestWeightKg: number; best1RM: number };

export function detectPRs(
  set: SetInput,
  bests: ExerciseBests
): { est1RM: number; isWeightPr: boolean; is1RmPr: boolean } {
  const est1RM = epley1RM(set.weightKg, set.reps);
  return {
    est1RM,
    isWeightPr: set.weightKg > bests.bestWeightKg,
    is1RmPr: est1RM > bests.best1RM,
  };
}
