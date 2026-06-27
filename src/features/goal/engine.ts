export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";

const FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const KCAL_PER_KG = 7700;
const KCAL_PER_STEP = 0.04;
const HARD_FLOOR = 1200;
const MS_PER_DAY = 86_400_000;

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function activityFactor(a: Activity): number {
  return FACTORS[a] ?? 1.2;
}

export function tdee(bmr: number, activity: Activity, steps: number): number {
  return bmr * activityFactor(activity) + Math.max(0, steps) * KCAL_PER_STEP;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

export type TargetsInput = {
  sex: Sex; weightKg: number; heightCm: number; age: number; activity: Activity; steps: number;
  startWeightKg: number; targetWeightKg: number; targetDate: string; today: string;
};

export function dailyTargets(i: TargetsInput): {
  calorieTarget: number; proteinTarget: number; tdee: number; dailyDeficit: number;
} {
  const bmr = bmrMifflin(i.sex, i.weightKg, i.heightCm, i.age);
  const td = tdee(bmr, i.activity, i.steps);
  const days = Math.max(1, daysBetween(i.today, i.targetDate));
  const totalDeficit = Math.max(0, i.startWeightKg - i.targetWeightKg) * KCAL_PER_KG;
  const dailyDeficit = totalDeficit / days;
  const floor = Math.max(bmr, HARD_FLOOR);
  const calorieTarget = Math.max(td - dailyDeficit, floor);
  const proteinTarget = 2.0 * i.weightKg;
  return { calorieTarget, proteinTarget, tdee: td, dailyDeficit };
}

export function movingAverage(weights: number[], window = 7): number {
  if (weights.length === 0) return 0;
  const slice = weights.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function progressPercent(start: number, current: number, target: number): number {
  const denom = start - target;
  if (denom === 0) return 0;
  const pct = ((start - current) / denom) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function expectedWeight(
  start: number, target: number, targetDate: string, startDate: string, today: string
): number {
  const total = Math.max(1, daysBetween(startDate, targetDate));
  const elapsed = Math.max(0, Math.min(total, daysBetween(startDate, today)));
  const rate = (start - target) / total;
  return start - rate * elapsed;
}

export function onPace(
  currentAvg: number, expected: number
): { kg: number; status: "ahead" | "on" | "behind" } {
  const diff = currentAvg - expected; // positive = heavier than expected = behind
  if (diff > 0.2) return { kg: diff, status: "behind" };
  if (diff < -0.2) return { kg: diff, status: "ahead" };
  return { kg: diff, status: "on" };
}

export function projectedFinish(
  start: number, currentAvg: number, target: number, startDate: string, today: string
): string | null {
  const elapsed = Math.max(1, daysBetween(startDate, today));
  const lost = start - currentAvg;
  if (lost <= 0) return null;
  const ratePerDay = lost / elapsed;
  const remainingKg = currentAvg - target;
  if (remainingKg <= 0) return today;
  const daysLeft = Math.ceil(remainingKg / ratePerDay);
  const finish = new Date(new Date(today + "T00:00:00").getTime() + daysLeft * MS_PER_DAY);
  return finish.toISOString().slice(0, 10);
}
