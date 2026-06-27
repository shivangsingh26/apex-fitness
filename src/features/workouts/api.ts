import { supabase } from "../../lib/supabase";
import { detectPRs, ExerciseBests } from "./prEngine";

export type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string | null;
  type: string | null;
  is_custom: boolean;
};
export type WorkoutRow = {
  id: string;
  user_id: string;
  date: string;
  notes: string | null;
};
export type WorkoutSetRow = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_no: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  est_1rm: number | null;
  is_weight_pr: boolean;
  is_1rm_pr: boolean;
};
export type WorkoutSummary = {
  id: string;
  date: string;
  exerciseCount: number;
  totalVolume: number;
};

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function listExercises(query?: string): Promise<ExerciseRow[]> {
  let q = supabase.from("exercises").select("id,name,muscle_group,type,is_custom").order("name");
  if (query) q = q.ilike("name", `%${query}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ExerciseRow[];
}

export async function addCustomExercise(
  name: string,
  muscleGroup: string,
  type: string
): Promise<ExerciseRow> {
  const owner_id = await uid();
  const { data, error } = await supabase
    .from("exercises")
    .insert({ name, muscle_group: muscleGroup, type, is_custom: true, owner_id })
    .select("id,name,muscle_group,type,is_custom")
    .single();
  if (error) throw error;
  return data as ExerciseRow;
}

export async function startWorkout(date: string): Promise<WorkoutRow> {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id, date })
    .select("id,user_id,date,notes")
    .single();
  if (error) throw error;
  return data as WorkoutRow;
}

export async function exerciseBests(exerciseId: string): Promise<ExerciseBests> {
  // RLS already restricts workout_sets to the user's own workouts.
  const { data, error } = await supabase
    .from("workout_sets")
    .select("weight_kg,est_1rm,workouts!inner(user_id)")
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  let bestWeightKg = 0;
  let best1RM = 0;
  for (const row of data ?? []) {
    const w = (row as { weight_kg: number | null }).weight_kg ?? 0;
    const e = (row as { est_1rm: number | null }).est_1rm ?? 0;
    if (w > bestWeightKg) bestWeightKg = w;
    if (e > best1RM) best1RM = e;
  }
  return { bestWeightKg, best1RM };
}

export async function addSet(
  workoutId: string,
  exerciseId: string,
  setNo: number,
  reps: number,
  weightKg: number,
  rpe: number | null
): Promise<WorkoutSetRow> {
  const bests = await exerciseBests(exerciseId);
  const pr = detectPRs({ weightKg, reps }, bests);
  const { data, error } = await supabase
    .from("workout_sets")
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_no: setNo,
      reps,
      weight_kg: weightKg,
      rpe,
      est_1rm: pr.est1RM,
      is_weight_pr: pr.isWeightPr,
      is_1rm_pr: pr.is1RmPr,
    })
    .select(
      "id,workout_id,exercise_id,set_no,reps,weight_kg,rpe,est_1rm,is_weight_pr,is_1rm_pr"
    )
    .single();
  if (error) throw error;
  return data as WorkoutSetRow;
}

export async function listWorkouts(): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id,date,workout_sets(reps,weight_kg,exercise_id)")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((w: any) => {
    const sets = (w.workout_sets ?? []) as {
      reps: number | null;
      weight_kg: number | null;
      exercise_id: string;
    }[];
    const totalVolume = sets.reduce((acc, s) => acc + (s.reps ?? 0) * (s.weight_kg ?? 0), 0);
    const exerciseCount = new Set(sets.map((s) => s.exercise_id)).size;
    return { id: w.id, date: w.date, exerciseCount, totalVolume };
  });
}

export async function workoutDetail(
  id: string
): Promise<{ workout: WorkoutRow; sets: WorkoutSetRow[] }> {
  const { data: workout, error: e1 } = await supabase
    .from("workouts")
    .select("id,user_id,date,notes")
    .eq("id", id)
    .single();
  if (e1) throw e1;
  const { data: sets, error: e2 } = await supabase
    .from("workout_sets")
    .select(
      "id,workout_id,exercise_id,set_no,reps,weight_kg,rpe,est_1rm,is_weight_pr,is_1rm_pr"
    )
    .eq("workout_id", id)
    .order("set_no");
  if (e2) throw e2;
  return { workout: workout as WorkoutRow, sets: (sets ?? []) as WorkoutSetRow[] };
}

export async function exerciseTrend(
  exerciseId: string
): Promise<{ date: string; est1RM: number }[]> {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("est_1rm,workouts!inner(date,user_id)")
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  const byDate = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const date = row.workouts.date as string;
    const e = (row.est_1rm as number | null) ?? 0;
    byDate.set(date, Math.max(byDate.get(date) ?? 0, e));
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, est1RM]) => ({ date, est1RM }));
}
