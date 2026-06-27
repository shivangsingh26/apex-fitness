import { supabase } from "../../lib/supabase";
import { parseVisionResponse, VisionItem } from "./vision";
import { Meal } from "./api";

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function estimateFromImage(base64: string): Promise<VisionItem[]> {
  const { data, error } = await supabase.functions.invoke("estimate-food", {
    body: { image: base64 },
  });
  if (error) throw error;
  return parseVisionResponse(data);
}

export async function uploadFoodPhoto(localUri: string): Promise<string> {
  const id = await uid();
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const res = await fetch(localUri);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const { error } = await supabase.storage
    .from("food-photos")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function logVisionItem(
  date: string,
  meal: Meal,
  item: VisionItem,
  photoPath: string | null
): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase.from("food_logs").insert({
    user_id,
    date,
    meal,
    food_id: null,
    grams: item.grams,
    kcal: item.kcal,
    protein_g: item.protein,
    carb_g: item.carb,
    fat_g: item.fat,
    fiber_g: item.fiber,
    scan_method: "vision",
    photo_path: photoPath,
  });
  if (error) throw error;
}
