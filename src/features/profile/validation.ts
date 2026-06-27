export function ageFromBirthdate(birthdate: string, today: Date = new Date()): number {
  const b = new Date(birthdate);
  let age = today.getFullYear() - b.getFullYear();
  const monthDiff = today.getMonth() - b.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export type ProfileInput = {
  sex: string;
  birthdate: string;
  heightCm: number;
  activityLevel: string;
};

const ACTIVITY = ["sedentary", "light", "moderate", "active", "very_active"];

export function validateProfile(input: ProfileInput): string[] {
  const errors: string[] = [];
  if (input.sex !== "male" && input.sex !== "female") errors.push("Sex must be male or female");
  const age = ageFromBirthdate(input.birthdate);
  if (Number.isNaN(age) || age < 13 || age > 100) errors.push("Age must be between 13 and 100");
  if (!(input.heightCm >= 100 && input.heightCm <= 250)) errors.push("Height must be between 100 and 250 cm");
  if (!ACTIVITY.includes(input.activityLevel)) errors.push("Activity level is invalid");
  return errors;
}

export type GoalInput = {
  startWeightKg: number;
  targetWeightKg: number;
  targetBfPct: number;
  targetDate: string;
};

export function validateGoal(input: GoalInput, today: Date = new Date()): string[] {
  const errors: string[] = [];
  if (!(input.startWeightKg > 0)) errors.push("Start weight must be positive");
  if (!(input.targetWeightKg > 0)) errors.push("Target weight must be positive");
  if (input.targetWeightKg >= input.startWeightKg) errors.push("Target weight must be below start weight");
  if (!(input.targetBfPct >= 3 && input.targetBfPct <= 50)) errors.push("Target body-fat % must be between 3 and 50");
  if (new Date(input.targetDate) <= today) errors.push("Target date must be in the future");
  return errors;
}
