# Apex — Phase 3: Food Logger (no AI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log food via barcode scan, Open Food Facts text search, or manual entry; choose grams or servings; record to a daily diary grouped by meal with totals vs targets.

**Architecture:** A pure nutrition engine (`nutrition.ts`) and pure OFF mapper (`mapOffProduct`) are unit-tested with no I/O. `off.ts` adds network lookups, `api.ts` wraps Supabase CRUD and calls the engine to store a macro snapshot per log. Expo Router screens render diary/add/scan. One migration repurposes `food_logs` to a grams+snapshot model.

**Tech Stack:** Expo + expo-router, TypeScript, Supabase, expo-camera (barcode), ts-jest (node) for unit tests, Open Food Facts API.

## Global Constraints

- App name: **Apex**. TypeScript `strict`. Units metric (g, kcal).
- Data source: Open Food Facts only, no API key. Cache hits into `foods` (match by barcode).
- Portion model: store nutrients **per 100g**; log grams or N servings (`servings × serving_g`).
- Log integrity: `food_logs` stores resolved `grams` + macro snapshot; never recompute old logs.
- Meals: `breakfast` / `lunch` / `dinner` / `snack`.
- Targets: `goals.daily_calorie_target` / `daily_protein_target`, may be null → show totals always, "vs target" only when set.
- Pure logic unit-tested via ts-jest (`tsconfig.test.json`); app `tsconfig.json` excludes `*.test.ts`. Network funcs not unit-tested.
- Local Supabase via Docker (`[analytics] enabled=false`); DB queries via `docker exec -i supabase_db_personal-fitness psql -U postgres`. Local anon key in `.env.local`.

---

## File Structure

```
supabase/migrations/0003_food_logger.sql
src/features/food/
  nutrition.ts        # macros math (TESTED)
  nutrition.test.ts
  off.ts              # OFF mapper (TESTED via fixture) + fetch
  off.test.ts
  off.fixture.json
  api.ts              # Supabase CRUD + OFF + cache
app/(tabs)/
  _layout.tsx         # MODIFY: add Food tab
  food.tsx            # diary: date nav, meals, totals vs targets
app/food/
  _layout.tsx
  add.tsx             # search/manual -> portion+meal -> log
  scan.tsx            # camera barcode -> lookup -> portion+meal -> log
```

---

### Task 1: Schema migration — grams + snapshot model

**Files:**
- Create: `supabase/migrations/0003_food_logger.sql`

**Interfaces:**
- Consumes: Phase 1 tables `food_logs`, `foods`.
- Produces: `food_logs.grams`, `foods.per_100g`; `food_logs.qty` removed.

- [ ] **Step 1: Write the migration**

```sql
alter table public.food_logs drop column if exists qty;
alter table public.food_logs add column grams numeric;
alter table public.foods add column per_100g boolean not null default true;
```

- [ ] **Step 2: Apply**

Run: `npx supabase db reset --local`
Expected: applies `0001`, `0002`, `0003`, no errors.

- [ ] **Step 3: Verify columns**

Run:
```bash
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select column_name from information_schema.columns where table_name='food_logs' and column_name in ('grams','qty');"
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select column_name from information_schema.columns where table_name='foods' and column_name='per_100g';"
```
Expected: first prints `grams` only (no `qty`); second prints `per_100g`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_food_logger.sql
git commit -m "feat: food_logs grams + snapshot schema"
```

---

### Task 2: Nutrition engine (pure logic, TDD)

**Files:**
- Create: `src/features/food/nutrition.ts`, `src/features/food/nutrition.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Macros = { kcal: number; protein: number; carb: number; fat: number; fiber: number }`
  - `macrosForGrams(per100: Macros, grams: number): Macros`
  - `gramsFromServings(servingG: number, n: number): number`
  - `dayTotals(snapshots: Macros[]): Macros`
  - `remaining(totals: Macros, targetKcal: number | null, targetProtein: number | null): { kcalLeft: number | null; proteinLeft: number | null }`

- [ ] **Step 1: Write failing tests `src/features/food/nutrition.test.ts`**

```ts
import { macrosForGrams, gramsFromServings, dayTotals, remaining, Macros } from "./nutrition";

const per100: Macros = { kcal: 200, protein: 10, carb: 20, fat: 8, fiber: 3 };

describe("macrosForGrams", () => {
  it("scales by grams/100", () => {
    expect(macrosForGrams(per100, 150)).toEqual({ kcal: 300, protein: 15, carb: 30, fat: 12, fiber: 4.5 });
  });
  it("zeros on non-positive grams", () => {
    expect(macrosForGrams(per100, 0)).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 });
    expect(macrosForGrams(per100, -50)).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 });
  });
});

describe("gramsFromServings", () => {
  it("multiplies serving size", () => {
    expect(gramsFromServings(30, 2)).toBe(60);
  });
  it("guards non-positive", () => {
    expect(gramsFromServings(0, 2)).toBe(0);
    expect(gramsFromServings(30, -1)).toBe(0);
  });
});

describe("dayTotals", () => {
  it("sums element-wise", () => {
    const a: Macros = { kcal: 100, protein: 5, carb: 10, fat: 2, fiber: 1 };
    const b: Macros = { kcal: 200, protein: 10, carb: 20, fat: 4, fiber: 2 };
    expect(dayTotals([a, b])).toEqual({ kcal: 300, protein: 15, carb: 30, fat: 6, fiber: 3 });
  });
  it("returns zeros for empty", () => {
    expect(dayTotals([])).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 });
  });
});

describe("remaining", () => {
  const totals: Macros = { kcal: 1800, protein: 120, carb: 150, fat: 60, fiber: 20 };
  it("computes left when targets set", () => {
    expect(remaining(totals, 2200, 165)).toEqual({ kcalLeft: 400, proteinLeft: 45 });
  });
  it("nulls when target null", () => {
    expect(remaining(totals, null, null)).toEqual({ kcalLeft: null, proteinLeft: null });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx jest src/features/food/nutrition.test.ts`
Expected: FAIL — `Cannot find module './nutrition'`.

- [ ] **Step 3: Implement `src/features/food/nutrition.ts`**

```ts
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx jest src/features/food/nutrition.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/food/nutrition.ts src/features/food/nutrition.test.ts
git commit -m "feat: add tested nutrition engine"
```

---

### Task 3: Open Food Facts mapper + fetch (mapper TDD via fixture)

**Files:**
- Create: `src/features/food/off.ts`, `src/features/food/off.test.ts`, `src/features/food/off.fixture.json`

**Interfaces:**
- Consumes: `Macros` (Task 2).
- Produces:
  - `type FoodData = { name: string; brand: string | null; barcode: string | null; per100: Macros; servingG: number | null }`
  - `mapOffProduct(raw: any): FoodData | null`
  - `lookupBarcode(code: string): Promise<FoodData | null>`
  - `searchFoods(query: string): Promise<FoodData[]>`

- [ ] **Step 1: Create fixture `src/features/food/off.fixture.json`**

```json
{
  "code": "3017620422003",
  "product_name": "Nutella",
  "brands": "Ferrero",
  "serving_quantity": "15",
  "nutriments": {
    "energy-kcal_100g": 539,
    "proteins_100g": 6.3,
    "carbohydrates_100g": 57.5,
    "fat_100g": 30.9,
    "fiber_100g": 0
  }
}
```

- [ ] **Step 2: Write failing tests `src/features/food/off.test.ts`**

```ts
import { mapOffProduct } from "./off";
import fixture from "./off.fixture.json";

describe("mapOffProduct", () => {
  it("maps a valid OFF product to per-100g FoodData", () => {
    const r = mapOffProduct(fixture);
    expect(r).not.toBeNull();
    expect(r!.name).toBe("Nutella");
    expect(r!.brand).toBe("Ferrero");
    expect(r!.barcode).toBe("3017620422003");
    expect(r!.servingG).toBe(15);
    expect(r!.per100.kcal).toBe(539);
    expect(r!.per100.protein).toBeCloseTo(6.3, 2);
    expect(r!.per100.fiber).toBe(0);
  });
  it("returns null when name missing", () => {
    expect(mapOffProduct({ nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });
  it("returns null when energy missing", () => {
    expect(mapOffProduct({ product_name: "X", nutriments: {} })).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npx jest src/features/food/off.test.ts`
Expected: FAIL — `Cannot find module './off'`.

- [ ] **Step 4: Implement `src/features/food/off.ts`**

```ts
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
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx jest src/features/food/off.test.ts`
Expected: all pass.

- [ ] **Step 6: Ensure JSON imports allowed; typecheck**

If `npx tsc --noEmit` errors with "Cannot find module './off.fixture.json'", add `"resolveJsonModule": true` to `tsconfig.json` compilerOptions and `tsconfig.test.json` inherits it.

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 7: Commit**

```bash
git add src/features/food/off.ts src/features/food/off.test.ts src/features/food/off.fixture.json tsconfig.json
git commit -m "feat: add Open Food Facts mapper and lookup"
```

---

### Task 4: Food API (Supabase CRUD + OFF + cache)

**Files:**
- Create: `src/features/food/api.ts`

**Interfaces:**
- Consumes: `supabase`; `Macros`, `macrosForGrams`, `dayTotals` (Task 2); `FoodData`, `lookupBarcode`, `searchFoods` (Task 3).
- Produces:
  - `type Meal = "breakfast" | "lunch" | "dinner" | "snack"`
  - `type FoodRow = { id: string; name: string; brand: string | null; barcode: string | null; kcal: number | null; protein_g: number | null; carb_g: number | null; fat_g: number | null; fiber_g: number | null; serving_g: number | null }`
  - `type FoodLogRow = { id: string; date: string; meal: string; food_id: string | null; grams: number | null; kcal: number | null; protein_g: number | null; carb_g: number | null; fat_g: number | null; fiber_g: number | null }`
  - `type DiaryDay = { totals: Macros; targets: { kcal: number | null; protein: number | null }; byMeal: Record<Meal, FoodLogRow[]> }`
  - `upsertFoodFromOff(data: FoodData): Promise<FoodRow>`
  - `searchAll(query: string): Promise<FoodData[]>`
  - `scanBarcode(code: string): Promise<FoodData | null>`
  - `addManualFood(name: string, per100: Macros, servingG: number | null): Promise<FoodRow>`
  - `logFood(date: string, meal: Meal, foodId: string, grams: number): Promise<FoodLogRow>`
  - `getDiary(date: string): Promise<DiaryDay>`
  - `deleteLog(id: string): Promise<void>`

- [ ] **Step 1: Implement `src/features/food/api.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 3: Verify end-to-end against local Supabase**

Create temp `scratchpad/verify_food.mjs` (not committed): sign up a fresh user; insert a manual food (per-100g: kcal 200, protein 10) via REST; insert a food_log with grams=150 and the computed snapshot (kcal 300, protein 15); read `food_logs` for the date and sum kcal; also do one live OFF barcode call.

```js
const ANON = process.env.ANON;
const BASE = "http://127.0.0.1:54321";
const H = { apikey: ANON, "Content-Type": "application/json" };
const email = `food_${Date.now()}@apex.local`, password = "password123";
await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) });
const tok = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) })).json();
const A = { ...H, Authorization: `Bearer ${tok.access_token}`, Prefer: "return=representation" };
const uid = tok.user.id;
const food = (await (await fetch(`${BASE}/rest/v1/foods`, { method: "POST", headers: A, body: JSON.stringify({ source: "manual", name: "TestChicken", kcal: 200, protein_g: 10, carb_g: 0, fat_g: 8, fiber_g: 0, per_100g: true }) })).json())[0];
await fetch(`${BASE}/rest/v1/food_logs`, { method: "POST", headers: A, body: JSON.stringify({ user_id: uid, date: "2026-06-27", meal: "lunch", food_id: food.id, grams: 150, kcal: 300, protein_g: 15, carb_g: 0, fat_g: 12, fiber_g: 0 }) });
const logs = await (await fetch(`${BASE}/rest/v1/food_logs?select=kcal,protein_g&date=eq.2026-06-27`, { headers: A })).json();
const kcal = logs.reduce((a, l) => a + l.kcal, 0);
console.log("day kcal (expect 300):", kcal, "protein (expect 15):", logs.reduce((a, l) => a + l.protein_g, 0));
const off = await (await fetch(`https://world.openfoodfacts.org/api/v2/product/3017620422003.json`)).json();
console.log("OFF live name (expect Nutella-ish):", off.status === 1 ? off.product.product_name : "MISS");
```

Run: `ANON="<anon key from .env.local>" node scratchpad/verify_food.mjs`
Expected: `day kcal (expect 300): 300 protein (expect 15): 15` and an OFF product name printed.

- [ ] **Step 4: Commit**

```bash
git add src/features/food/api.ts
git commit -m "feat: add food API with OFF cache, logging, and diary"
```

---

### Task 5: Food tab — daily diary with date nav + totals

**Files:**
- Modify: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/food.tsx`

**Interfaces:**
- Consumes: `getDiary`, `deleteLog`, `DiaryDay`, `Meal`, `FoodLogRow` (Task 4); `remaining` (Task 2).
- Produces: Food tab showing a date's diary; navigates to add/scan.

- [ ] **Step 1: Add the Food tab in `app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="workouts" options={{ title: "Workouts" }} />
      <Tabs.Screen name="food" options={{ title: "Food" }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create `app/(tabs)/food.tsx`**

```tsx
import { useCallback, useState } from "react";
import { View, Text, Button, ScrollView, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getDiary, deleteLog, DiaryDay, Meal } from "../../src/features/food/api";
import { remaining } from "../../src/features/food/nutrition";

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Food() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [diary, setDiary] = useState<DiaryDay | null>(null);

  const load = useCallback(() => {
    getDiary(date).then(setDiary).catch((e) => Alert.alert("Load failed", String(e)));
  }, [date]);

  useFocusEffect(load);

  async function remove(id: string) {
    try {
      await deleteLog(id);
      load();
    } catch (e) {
      Alert.alert("Delete failed", String(e));
    }
  }

  const left = diary ? remaining(diary.totals, diary.targets.kcal, diary.targets.protein) : null;

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Button title="‹" onPress={() => setDate((d) => shiftDate(d, -1))} />
        <Text style={{ fontWeight: "700" }}>{date}</Text>
        <Button title="›" onPress={() => setDate((d) => shiftDate(d, 1))} />
      </View>

      {diary && (
        <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
          <Text style={{ fontWeight: "600" }}>
            {Math.round(diary.totals.kcal)} kcal · P {Math.round(diary.totals.protein)}g · C{" "}
            {Math.round(diary.totals.carb)}g · F {Math.round(diary.totals.fat)}g
          </Text>
          {left && left.kcalLeft != null && (
            <Text style={{ color: left.kcalLeft >= 0 ? "green" : "red" }}>
              {Math.round(left.kcalLeft)} kcal left · {Math.round(left.proteinLeft ?? 0)}g protein left
            </Text>
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Add food" onPress={() => router.push({ pathname: "/food/add", params: { date } })} />
        <Button title="Scan" onPress={() => router.push({ pathname: "/food/scan", params: { date } })} />
      </View>

      <ScrollView>
        {MEALS.map((m) => (
          <View key={m} style={{ paddingVertical: 8 }}>
            <Text style={{ fontWeight: "700", textTransform: "capitalize" }}>{m}</Text>
            {(diary?.byMeal[m] ?? []).length === 0 && <Text style={{ color: "#999" }}>—</Text>}
            {(diary?.byMeal[m] ?? []).map((l) => (
              <Pressable key={l.id} onLongPress={() => remove(l.id)} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                <Text>{l.grams}g</Text>
                <Text>{Math.round(l.kcal ?? 0)} kcal</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/_layout.tsx" "app/(tabs)/food.tsx"
git commit -m "feat: add food tab diary with date nav and totals"
```

---

### Task 6: Add-food screen — search / manual → portion + meal → log

**Files:**
- Create: `app/food/_layout.tsx`, `app/food/add.tsx`

**Interfaces:**
- Consumes: `searchAll`, `upsertFoodFromOff`, `addManualFood`, `logFood`, `Meal`, `FoodRow` (Task 4); `gramsFromServings` (Task 2); `FoodData` (Task 3).
- Produces: a screen that creates/caches a food and writes a `food_logs` row, then returns to the diary.

- [ ] **Step 1: Create `app/food/_layout.tsx`**

```tsx
import { Stack } from "expo-router";

export default function FoodLayout() {
  return <Stack screenOptions={{ headerShown: true, headerTitle: "Food" }} />;
}
```

- [ ] **Step 2: Create `app/food/add.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, Button, FlatList, Pressable, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { searchAll, upsertFoodFromOff, addManualFood, logFood, FoodRow, Meal } from "../../src/features/food/api";
import { gramsFromServings } from "../../src/features/food/nutrition";
import { FoodData } from "../../src/features/food/off";

export default function AddFood() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodData[]>([]);
  const [selected, setSelected] = useState<FoodRow | null>(null);
  const [meal, setMeal] = useState<Meal>("breakfast");
  const [grams, setGrams] = useState("100");
  const [servings, setServings] = useState("");
  // manual entry fields
  const [mName, setMName] = useState("");
  const [mKcal, setMKcal] = useState("");
  const [mProtein, setMProtein] = useState("");

  async function doSearch() {
    try {
      setResults(await searchAll(query));
    } catch (e) {
      Alert.alert("Search failed", String(e));
    }
  }

  async function pick(d: FoodData) {
    try {
      const row = await upsertFoodFromOff(d);
      setSelected(row);
      setResults([]);
    } catch (e) {
      Alert.alert("Select failed", String(e));
    }
  }

  async function createManual() {
    if (!mName.trim()) return Alert.alert("Name required");
    try {
      const row = await addManualFood(
        mName.trim(),
        { kcal: Number(mKcal) || 0, protein: Number(mProtein) || 0, carb: 0, fat: 0, fiber: 0 },
        null
      );
      setSelected(row);
    } catch (e) {
      Alert.alert("Create failed", String(e));
    }
  }

  async function save() {
    if (!selected) return;
    const g = servings && selected.serving_g
      ? gramsFromServings(selected.serving_g, Number(servings))
      : Number(grams);
    if (g <= 0) return Alert.alert("Enter grams or servings");
    try {
      await logFood(date, meal, selected.id, g);
      router.back();
    } catch (e) {
      Alert.alert("Log failed", String(e));
    }
  }

  if (selected) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>{selected.name}</Text>
        <Text>{selected.kcal ?? 0} kcal / 100g{selected.serving_g ? ` · serving ${selected.serving_g}g` : ""}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["breakfast", "lunch", "dinner", "snack"] as Meal[]).map((m) => (
            <Pressable key={m} onPress={() => setMeal(m)} style={{ padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: meal === m ? "#ddd" : "white" }}>
              <Text style={{ textTransform: "capitalize" }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={grams} onChangeText={setGrams} keyboardType="numeric" placeholder="grams"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
        {selected.serving_g != null && (
          <TextInput value={servings} onChangeText={setServings} keyboardType="numeric"
            placeholder={`servings (× ${selected.serving_g}g)`} style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
        )}
        <Button title="Log it" onPress={save} />
        <Button title="Back" onPress={() => setSelected(null)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search Open Food Facts"
        autoCapitalize="none" style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <Button title="Search" onPress={doSearch} />
      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: "#666" }}>{item.brand ?? ""} · {Math.round(item.per100.kcal)} kcal/100g</Text>
          </Pressable>
        )}
      />
      <Text style={{ fontWeight: "700", marginTop: 8 }}>Or add manually</Text>
      <TextInput value={mName} onChangeText={setMName} placeholder="name"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={mKcal} onChangeText={setMKcal} keyboardType="numeric" placeholder="kcal/100g"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
        <TextInput value={mProtein} onChangeText={setMProtein} keyboardType="numeric" placeholder="protein/100g"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
      </View>
      <Button title="Create manual food" onPress={createManual} />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Commit**

```bash
git add app/food/_layout.tsx app/food/add.tsx
git commit -m "feat: add food search/manual entry and logging screen"
```

---

### Task 7: Barcode scan screen

**Files:**
- Create: `app/food/scan.tsx`

**Interfaces:**
- Consumes: `scanBarcode`, `upsertFoodFromOff`, `logFood`, `Meal` (Task 4); expo-camera.
- Produces: scans a barcode, looks it up on OFF, logs at a default 1 serving (or 100g).

- [ ] **Step 1: Install expo-camera**

Run: `npx expo install expo-camera`
Then add the plugin to `app.json` `expo.plugins`: `["expo-camera", { "cameraPermission": "Apex uses the camera to scan food barcodes." }]`.

- [ ] **Step 2: Create `app/food/scan.tsx`**

```tsx
import { useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { scanBarcode, upsertFoodFromOff, logFood, Meal } from "../../src/features/food/api";

export default function Scan() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  if (!permission) return <Text>Loading…</Text>;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text>Camera access needed to scan barcodes.</Text>
        <Button title="Grant permission" onPress={requestPermission} />
      </View>
    );
  }

  async function onScan(code: string) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await scanBarcode(code);
      if (!data) {
        Alert.alert("Not found", "No product for this barcode.", [{ text: "OK", onPress: () => setBusy(false) }]);
        return;
      }
      const food = await upsertFoodFromOff(data);
      const grams = food.serving_g ?? 100;
      await logFood(date, "snack" as Meal, food.id, grams);
      Alert.alert("Logged", `${food.name} · ${grams}g`, [{ text: "OK", onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert("Scan failed", String(e), [{ text: "OK", onPress: () => setBusy(false) }]);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => onScan(data)}
      />
      <Button title="Cancel" onPress={() => router.back()} />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Run full test suite**

Run: `npx jest`
Expected: all suites pass (Phase 1 + Phase 2 + Phase 3 nutrition + off).

- [ ] **Step 5: Commit**

```bash
git add app/food/scan.tsx app.json
git commit -m "feat: add barcode scan screen"
```

---

## Self-Review

**Spec coverage:**
- Schema delta (grams + per_100g, drop qty) → Task 1 ✓
- Nutrition engine (macrosForGrams, gramsFromServings, dayTotals, remaining) → Task 2 ✓
- OFF mapper + lookup + search → Task 3 ✓
- API (cache, manual, log w/ snapshot, diary w/ targets, delete) → Task 4 ✓
- Diary UI w/ date nav + totals vs targets → Task 5 ✓
- Search / manual entry + portion (grams/servings) + meal → Task 6 ✓
- Barcode scan (expo-camera) → Task 7 ✓
- Open Food Facts only, no key; cache by barcode → Tasks 3, 4 ✓
- Meals breakfast/lunch/dinner/snack → Tasks 4, 5, 6 ✓
- Targets nullable → `remaining` (Task 2) + `getDiary` (Task 4) + UI guard (Task 5) ✓

**Placeholder scan:** none — all steps carry full code, commands, expected output. Fixture is concrete.

**Type consistency:** `Macros` (Task 2) consumed by Tasks 3/4/5. `FoodData` (Task 3) consumed by Tasks 4/6. `FoodRow`/`FoodLogRow`/`DiaryDay`/`Meal` (Task 4) consumed unchanged by Tasks 5/6/7. `logFood(date, meal, foodId, grams)` signature identical across Tasks 4/6/7. Snapshot columns written in `logFood` match those summed in `getDiary`.

**Note:** `resolveJsonModule` may need enabling for the fixture import (handled in Task 3 Step 6). The verify scripts hardcode snapshot values because they bypass `api.ts` and hit REST directly; the app path always computes snapshots via the nutrition engine.
