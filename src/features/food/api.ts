import { supabase } from "../../lib/supabase";
import { Macros, macrosForGrams, dayTotals } from "./nutrition";
import { FoodData, lookupBarcode, searchFoods } from "./off";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export type FoodRow = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  serving_g: number | null;
};

export type FoodLogRow = {
  id: string;
  date: string;
  meal: string;
  food_id: string | null;
  grams: number | null;
  kcal: number | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

export type DiaryDay = {
  totals: Macros;
  targets: { kcal: number | null; protein: number | null };
  byMeal: Record<Meal, FoodLogRow[]>;
};

const FOOD_COLS = "id,name,brand,barcode,kcal,protein_g,carb_g,fat_g,fiber_g,serving_g";
const LOG_COLS = "id,date,meal,food_id,grams,kcal,protein_g,carb_g,fat_g,fiber_g";

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function searchAll(query: string): Promise<FoodData[]> {
  return searchFoods(query);
}

export async function scanBarcode(code: string): Promise<FoodData | null> {
  return lookupBarcode(code);
}

export async function upsertFoodFromOff(data: FoodData): Promise<FoodRow> {
  if (data.barcode) {
    const { data: existing, error: e0 } = await supabase
      .from("foods")
      .select(FOOD_COLS)
      .eq("barcode", data.barcode)
      .maybeSingle();
    if (e0) throw e0;
    if (existing) return existing as FoodRow;
  }
  const { data: row, error } = await supabase
    .from("foods")
    .insert({
      source: "openfoodfacts",
      barcode: data.barcode,
      name: data.name,
      brand: data.brand,
      kcal: data.per100.kcal,
      protein_g: data.per100.protein,
      carb_g: data.per100.carb,
      fat_g: data.per100.fat,
      fiber_g: data.per100.fiber,
      serving_g: data.servingG,
      per_100g: true,
    })
    .select(FOOD_COLS)
    .single();
  if (error) throw error;
  return row as FoodRow;
}

export async function addManualFood(
  name: string,
  per100: Macros,
  servingG: number | null
): Promise<FoodRow> {
  const { data: row, error } = await supabase
    .from("foods")
    .insert({
      source: "manual",
      name,
      kcal: per100.kcal,
      protein_g: per100.protein,
      carb_g: per100.carb,
      fat_g: per100.fat,
      fiber_g: per100.fiber,
      serving_g: servingG,
      per_100g: true,
    })
    .select(FOOD_COLS)
    .single();
  if (error) throw error;
  return row as FoodRow;
}

export async function logFood(
  date: string,
  meal: Meal,
  foodId: string,
  grams: number
): Promise<FoodLogRow> {
  const user_id = await uid();
  const { data: food, error: ef } = await supabase
    .from("foods")
    .select("kcal,protein_g,carb_g,fat_g,fiber_g")
    .eq("id", foodId)
    .single();
  if (ef) throw ef;
  const per100: Macros = {
    kcal: food.kcal ?? 0,
    protein: food.protein_g ?? 0,
    carb: food.carb_g ?? 0,
    fat: food.fat_g ?? 0,
    fiber: food.fiber_g ?? 0,
  };
  const snap = macrosForGrams(per100, grams);
  const { data: row, error } = await supabase
    .from("food_logs")
    .insert({
      user_id,
      date,
      meal,
      food_id: foodId,
      grams,
      kcal: snap.kcal,
      protein_g: snap.protein,
      carb_g: snap.carb,
      fat_g: snap.fat,
      fiber_g: snap.fiber,
    })
    .select(LOG_COLS)
    .single();
  if (error) throw error;
  return row as FoodLogRow;
}

export async function getDiary(date: string): Promise<DiaryDay> {
  const { data: logs, error } = await supabase
    .from("food_logs")
    .select(LOG_COLS)
    .eq("date", date)
    .order("meal");
  if (error) throw error;
  const rows = (logs ?? []) as FoodLogRow[];

  const byMeal = { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<Meal, FoodLogRow[]>;
  for (const r of rows) {
    if (MEALS.includes(r.meal as Meal)) byMeal[r.meal as Meal].push(r);
  }
  const totals = dayTotals(
    rows.map((r) => ({
      kcal: r.kcal ?? 0,
      protein: r.protein_g ?? 0,
      carb: r.carb_g ?? 0,
      fat: r.fat_g ?? 0,
      fiber: r.fiber_g ?? 0,
    }))
  );
  const { data: goal } = await supabase
    .from("goals")
    .select("daily_calorie_target,daily_protein_target")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    totals,
    targets: {
      kcal: goal?.daily_calorie_target ?? null,
      protein: goal?.daily_protein_target ?? null,
    },
    byMeal,
  };
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from("food_logs").delete().eq("id", id);
  if (error) throw error;
}
