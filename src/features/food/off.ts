import { Macros } from "./nutrition";

export type FoodData = {
  name: string;
  brand: string | null;
  barcode: string | null;
  per100: Macros;
  servingG: number | null;
};

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

export function mapOffProduct(raw: any): FoodData | null {
  if (!raw || !raw.product_name) return null;
  const n = raw.nutriments ?? {};
  const kcal = n["energy-kcal_100g"];
  if (kcal == null) return null;
  const servingQ = raw.serving_quantity != null ? num(raw.serving_quantity) : 0;
  return {
    name: raw.product_name,
    brand: raw.brands ?? null,
    barcode: raw.code ?? null,
    per100: {
      kcal: num(kcal),
      protein: num(n["proteins_100g"]),
      carb: num(n["carbohydrates_100g"]),
      fat: num(n["fat_100g"]),
      fiber: num(n["fiber_100g"]),
    },
    servingG: servingQ > 0 ? servingQ : null,
  };
}

export async function lookupBarcode(code: string): Promise<FoodData | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status !== 1) return null;
  return mapOffProduct(json.product);
}

export async function searchFoods(query: string): Promise<FoodData[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&json=1&page_size=20`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  const products = (json.products ?? []) as any[];
  return products.map(mapOffProduct).filter((x): x is FoodData => x !== null);
}
