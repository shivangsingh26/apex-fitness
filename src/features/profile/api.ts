import { supabase } from "../../lib/supabase";
import { ProfileInput, GoalInput } from "./validation";

export type UserRow = {
  id: string;
  email: string | null;
  sex: string | null;
  birthdate: string | null;
  height_cm: number | null;
  activity_level: string | null;
  units: string;
};

export type GoalRow = {
  id: string;
  user_id: string;
  target_weight_kg: number | null;
  target_bf_pct: number | null;
  target_date: string | null;
  start_weight_kg: number | null;
};

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function getProfile(): Promise<UserRow | null> {
  const { data, error } = await supabase.from("users").select("*").maybeSingle();
  if (error) throw error;
  return data as UserRow | null;
}

export async function saveProfile(input: ProfileInput): Promise<void> {
  const id = await uid();
  const { error } = await supabase
    .from("users")
    .update({
      sex: input.sex,
      birthdate: input.birthdate,
      height_cm: input.heightCm,
      activity_level: input.activityLevel,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function getGoal(): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as GoalRow | null;
}

export async function saveGoal(input: GoalInput): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase.from("goals").insert({
    user_id,
    start_weight_kg: input.startWeightKg,
    target_weight_kg: input.targetWeightKg,
    target_bf_pct: input.targetBfPct,
    target_date: input.targetDate,
  });
  if (error) throw error;
}
