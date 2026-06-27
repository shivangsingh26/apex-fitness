import { supabase } from "../../lib/supabase";
import { ageFromBirthdate } from "../profile/validation";
import {
  Activity, Sex, dailyTargets, movingAverage, progressPercent, expectedWeight,
  onPace, projectedFinish, daysBetween,
} from "../goal/engine";

export type BodyLogRow = {
  id: string; date: string; weight_kg: number | null; bf_pct: number | null;
  waist_cm: number | null; chest_cm: number | null; arm_cm: number | null;
  hip_cm: number | null; thigh_cm: number | null;
};

export type DashboardData = {
  goal: { startWeightKg: number; targetWeightKg: number; targetDate: string } | null;
  currentWeight: number | null;
  progressPct: number | null;
  daysLeft: number | null;
  kgToGo: number | null;
  pace: { kg: number; status: string } | null;
  calorieTarget: number | null;
  proteinTarget: number | null;
  projectedFinish: string | null;
};

const BODY_COLS = "id,date,weight_kg,bf_pct,waist_cm,chest_cm,arm_cm,hip_cm,thigh_cm";

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function logBody(
  date: string,
  f: { weightKg?: number; bfPct?: number; waist?: number; chest?: number; arm?: number; hip?: number; thigh?: number }
): Promise<BodyLogRow> {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("body_logs")
    .insert({
      user_id, date,
      weight_kg: f.weightKg ?? null, bf_pct: f.bfPct ?? null,
      waist_cm: f.waist ?? null, chest_cm: f.chest ?? null, arm_cm: f.arm ?? null,
      hip_cm: f.hip ?? null, thigh_cm: f.thigh ?? null,
    })
    .select(BODY_COLS)
    .single();
  if (error) throw error;
  if (f.weightKg != null) await recomputeTargets();
  return data as BodyLogRow;
}

export async function logSteps(date: string, steps: number): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase
    .from("daily_steps")
    .upsert({ user_id, date, steps, source: "manual" }, { onConflict: "user_id,date" });
  if (error) throw error;
}

export async function uploadProgressPhoto(localUri: string): Promise<string> {
  const id = await uid();
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const res = await fetch(localUri);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { error } = await supabase.storage
    .from("progress-photos")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function logProgressPhoto(date: string, path: string): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase
    .from("progress_photos")
    .insert({ user_id, date, storage_path: path });
  if (error) throw error;
}

async function loadContext() {
  const { data: profile } = await supabase
    .from("users").select("sex,birthdate,height_cm,activity_level").maybeSingle();
  const { data: goal } = await supabase
    .from("goals").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: bodies } = await supabase
    .from("body_logs").select("date,weight_kg").not("weight_kg", "is", null).order("date");
  const { data: steps } = await supabase
    .from("daily_steps").select("steps").eq("date", todayIso()).maybeSingle();
  return { profile, goal, bodies: bodies ?? [], stepsToday: steps?.steps ?? 0 };
}

export async function recomputeTargets(): Promise<void> {
  const { profile, goal, bodies, stepsToday } = await loadContext();
  if (!profile || !goal || !profile.sex || !profile.birthdate || !profile.height_cm) return;
  if (goal.start_weight_kg == null || goal.target_weight_kg == null || !goal.target_date) return;
  const weights = bodies.map((b: any) => b.weight_kg as number);
  const currentWeight = weights.length ? movingAverage(weights) : goal.start_weight_kg;
  const t = dailyTargets({
    sex: profile.sex as Sex,
    weightKg: currentWeight,
    heightCm: profile.height_cm,
    age: ageFromBirthdate(profile.birthdate),
    activity: (profile.activity_level ?? "moderate") as Activity,
    steps: stepsToday,
    startWeightKg: goal.start_weight_kg,
    targetWeightKg: goal.target_weight_kg,
    targetDate: goal.target_date,
    today: todayIso(),
  });
  const { error } = await supabase
    .from("goals")
    .update({
      daily_calorie_target: Math.round(t.calorieTarget),
      daily_protein_target: Math.round(t.proteinTarget),
    })
    .eq("id", goal.id);
  if (error) throw error;
}

export async function getDashboard(): Promise<DashboardData> {
  const { goal, bodies } = await loadContext();
  if (!goal || goal.start_weight_kg == null || goal.target_weight_kg == null || !goal.target_date) {
    return {
      goal: null, currentWeight: null, progressPct: null, daysLeft: null, kgToGo: null,
      pace: null, calorieTarget: null, proteinTarget: null, projectedFinish: null,
    };
  }
  const weights = bodies.map((b: any) => b.weight_kg as number);
  const currentWeight = weights.length ? movingAverage(weights) : goal.start_weight_kg;
  const today = todayIso();
  const startDate = (goal.created_at ?? today).slice(0, 10);
  const exp = expectedWeight(goal.start_weight_kg, goal.target_weight_kg, goal.target_date, startDate, today);
  return {
    goal: {
      startWeightKg: goal.start_weight_kg,
      targetWeightKg: goal.target_weight_kg,
      targetDate: goal.target_date,
    },
    currentWeight,
    progressPct: progressPercent(goal.start_weight_kg, currentWeight, goal.target_weight_kg),
    daysLeft: Math.max(0, daysBetween(today, goal.target_date)),
    kgToGo: Math.max(0, currentWeight - goal.target_weight_kg),
    pace: onPace(currentWeight, exp),
    calorieTarget: goal.daily_calorie_target ?? null,
    proteinTarget: goal.daily_protein_target ?? null,
    projectedFinish: projectedFinish(goal.start_weight_kg, currentWeight, goal.target_weight_kg, startDate, today),
  };
}

export async function weightSeries(): Promise<{ date: string; weight: number }[]> {
  const { data, error } = await supabase
    .from("body_logs").select("date,weight_kg").not("weight_kg", "is", null).order("date");
  if (error) throw error;
  return (data ?? []).map((b: any) => ({ date: b.date, weight: b.weight_kg }));
}
