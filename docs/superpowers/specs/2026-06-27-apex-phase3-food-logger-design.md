# Apex — Phase 3: Food Logger (no AI) — Design

**Date:** 2026-06-27
**Status:** Approved design. Feeds writing-plans next.
**Master design:** `docs/superpowers/specs/2026-06-26-apex-fitness-design.md` (Phase 3).

---

## 1. Goal

Log food without AI: scan a barcode or search Open Food Facts, or enter manually; choose a
portion (grams or servings); record it to a daily diary grouped by meal; show running
totals (calories + macros) against daily targets when those exist.

Builds on Phase 1 (Supabase, auth, RLS) and reuses tables `foods` and `food_logs`.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Data source | Open Food Facts only (barcode lookup + text search); no API key; cache hits into `foods` |
| Portion model | Store nutrients **per 100g**; log grams or N servings (`servings × serving_g` → grams) |
| Log integrity | `food_logs` stores resolved **grams** + a **macro snapshot**; old logs never shift if a food row changes |
| Meals | breakfast / lunch / dinner / snack |
| Targets | from `goals.daily_calorie_target` / `daily_protein_target`; null until Phase 5 → diary shows totals always, "vs target" only when set |
| Barcode scan | Included (expo-camera) |
| Date navigation | Included — diary can move to past dates and back-fill |
| Units | metric (g, kcal) |
| Testing | nutrition engine + OFF mappers fully unit-tested (ts-jest); api/screens verified vs local Supabase REST |

---

## 3. Schema delta (migration `0003_food_logger.sql`)

Phase 1's `food_logs` has `qty` plus macro columns. Repurpose to an explicit grams +
snapshot model:

```sql
alter table public.food_logs drop column if exists qty;
alter table public.food_logs add column grams numeric;          -- resolved portion
alter table public.foods add column per_100g boolean not null default true;
```

Existing `food_logs` macro columns (`kcal`, `protein_g`, `carb_g`, `fat_g`, `fiber_g`) hold
the computed snapshot at log time. `foods` macro columns hold per-100g values.
No new tables. RLS on `food_logs`/`foods` already exists (Phase 1).

---

## 4. Nutrition engine — pure logic (TDD, the testable brain)

File: `src/features/food/nutrition.ts`

```
type Macros = { kcal: number; protein: number; carb: number; fat: number; fiber: number }

macrosForGrams(per100: Macros, grams: number): Macros
  - each field = per100.field * grams / 100; non-positive grams → all zeros

gramsFromServings(servingG: number, n: number): number
  - servingG * n; guards non-positive → 0

dayTotals(snapshots: Macros[]): Macros
  - element-wise sum

remaining(totals: Macros, targetKcal: number | null, targetProtein: number | null):
  { kcalLeft: number | null; proteinLeft: number | null }
  - null target → null left
```

Deterministic, no I/O. Fully unit-tested.

---

## 5. Open Food Facts client — isolated mappers (TDD on mapping)

File: `src/features/food/off.ts`

```
type OffProduct = (raw OFF JSON shape, minimal)
type FoodData = { name; brand; barcode; per100: Macros; servingG: number | null }

mapOffProduct(raw: OffProduct): FoodData | null
  - reads nutriments per 100g (energy-kcal_100g, proteins_100g, carbohydrates_100g,
    fat_100g, fiber_100g), product_name, brands, serving_quantity
  - returns null if no name or no energy

lookupBarcode(code: string): Promise<FoodData | null>
  - GET https://world.openfoodfacts.org/api/v2/product/<code>.json
  - status !== 1 → null; else mapOffProduct(product)

searchFoods(query: string): Promise<FoodData[]>
  - GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=<q>&json=1&page_size=20
  - map each product, drop nulls
```

`mapOffProduct` is pure → unit-tested with a saved JSON fixture. `lookupBarcode`/`searchFoods`
do network I/O → not unit-tested; exercised once in the verify script as a live smoke check.

---

## 6. API (Supabase CRUD + OFF integration + cache)

File: `src/features/food/api.ts`

```
type FoodRow = { id; name; brand; barcode; kcal; protein_g; carb_g; fat_g; fiber_g; serving_g }
type FoodLogRow = { id; user_id; date; meal; food_id; grams; kcal; protein_g; carb_g; fat_g; fiber_g }
type DiaryDay = { totals: Macros; targets: {kcal:number|null; protein:number|null};
                 byMeal: Record<meal, FoodLogRow[]> }

upsertFoodFromOff(data: FoodData): Promise<FoodRow>     // cache: match by barcode else insert
searchAll(query): Promise<FoodData[]>                    // OFF search (live)
scanBarcode(code): Promise<FoodData | null>              // OFF lookup (live)
addManualFood(name, per100, servingG): Promise<FoodRow>
logFood(date, meal, foodId, grams): Promise<FoodLogRow>  // computes snapshot via nutrition engine
getDiary(date): Promise<DiaryDay>                         // logs for date grouped by meal + totals + targets
deleteLog(id): Promise<void>
```

`logFood` reads the `foods` row (per-100g), calls `macrosForGrams`, stores the snapshot.
`getDiary` reads `food_logs` for the date (RLS-scoped), groups by meal, sums via `dayTotals`,
reads `goals` targets.

---

## 7. Modules / files

```
supabase/migrations/0003_food_logger.sql
src/features/food/
  nutrition.ts      # math engine (TESTED)
  nutrition.test.ts
  off.ts            # OFF mappers + fetch (mapper TESTED via fixture)
  off.test.ts
  off.fixture.json  # saved OFF product sample for the mapper test
  api.ts            # Supabase CRUD + OFF + cache
app/(tabs)/
  _layout.tsx       # MODIFY: add Food tab
  food.tsx          # daily diary: date nav, meals, totals vs targets, add button
app/food/
  _layout.tsx       # stack
  add.tsx           # search OFF / manual entry → portion + meal → log
  scan.tsx          # barcode scan (expo-camera) → lookup → portion + meal → log
```

---

## 8. Flow

1. **Food tab** shows today's diary: per-meal logs, day totals, vs-target (if set), date arrows.
2. **Add** → search OFF (text), or **Scan** (camera barcode), or **manual**.
3. Pick result → choose grams or N servings + meal → `logFood` computes snapshot → insert.
4. Diary refreshes totals. Tap a log to delete.

---

## 9. Testing

- `nutrition.test.ts`: macrosForGrams scaling, zero/negative guards, gramsFromServings,
  dayTotals sum, remaining with null + numeric targets.
- `off.test.ts`: `mapOffProduct` against `off.fixture.json` (valid product) + a missing-energy
  case → null.
- API + screens: verify script against local Supabase — manual food → log 150g → diary totals
  match engine math; RLS isolation holds; one live OFF barcode smoke call (e.g. a known code).
  Device/camera walkthrough is the user's.

---

## 10. Out of scope (later phases)

AI photo estimation (Phase 4), recipes / multi-ingredient meals, favorites/recents UI,
USDA source, water/sleep/supplement UI (Phase 7). Keep Phase 3 to log + diary + totals.
