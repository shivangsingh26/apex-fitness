# Apex — Phase 4: AI Food Vision — Design

**Date:** 2026-06-28
**Status:** Approved design. Feeds writing-plans next.
**Master design:** `docs/superpowers/specs/2026-06-26-apex-fitness-design.md` (Phase 4).

---

## 1. Goal

Take a food photo, send it to a Supabase Edge Function that calls an OpenAI vision model,
get back a list of detected foods with estimated grams and macros, let the user review/edit,
then log each item into the Phase 3 diary.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Provider | **OpenAI** vision model with JSON-schema structured output |
| Model id | An OpenAI vision-capable model; **exact id confirmed against OpenAI docs at build time** (do not guess — training may be stale) |
| Secret | `OPENAI_API_KEY` lives **only** in the Edge Function env/secrets; never in the app, never printed to logs/chat |
| Output | **Multi-item list** per photo; each item `{ name, grams, kcal, protein, carb, fat, fiber, confidence }` — absolute macros for the estimated portion (not per-100g) |
| Review | **Always review + edit** before logging (editable fields + meal picker) |
| Logging | Each confirmed item → `food_logs` with `food_id=null`, `scan_method='vision'`, estimate stored as the macro snapshot |
| Photo storage | Stored in private Supabase Storage bucket `food-photos` (owner-only RLS); path saved to `food_logs.photo_path` |
| Cost | One model call per photo; client downscales image before upload; confidence surfaced to guide edits |
| Testing | Pure parser/validator unit-tested with a fixture; one live end-to-end smoke test (user supplies `OPENAI_API_KEY` locally) |

---

## 3. Architecture

```
[Camera / library photo]
   → downscale client-side → base64
   → supabase.functions.invoke("estimate-food", { image })
                         │
        [Edge Function: estimate-food]  (Deno)
          - reads OPENAI_API_KEY from env (secret)
          - calls OpenAI vision w/ JSON-schema response
          - returns { items: VisionItem[] }
                         │
   ← items ←
[photo-review screen] edit name/grams/macros + pick meal
   → upload photo to Storage (food-photos/<uid>/<uuid>.jpg)
   → insert one food_log per item (food_id null, snapshot, scan_method='vision', photo_path)
   → back to diary
```

The Edge Function is the only place holding the OpenAI key. The app authenticates to the
function with the user's Supabase JWT (functions.invoke passes it automatically).

---

## 4. Pure parser/validator — TDD (the testable brain)

File: `src/features/food/vision.ts`

```
type VisionItem = { name: string; grams: number; kcal: number; protein: number;
                    carb: number; fat: number; fiber: number; confidence: number }

parseVisionResponse(raw: unknown): VisionItem[]
  - accepts the model's parsed JSON object { items: [...] }
  - for each item: coerce numbers, clamp negatives to 0, default missing to 0,
    require a non-empty name (drop nameless), clamp confidence to [0,1]
  - malformed / missing items → []
```

No network. Fully unit-tested with a saved JSON fixture + malformed cases.

---

## 5. Edge Function — `supabase/functions/estimate-food/index.ts`

- Deno function. Reads `OPENAI_API_KEY` from `Deno.env`.
- Input: `{ image: string }` (base64 data URL or raw base64 + mime).
- Calls OpenAI vision chat completion with a **JSON schema** describing
  `{ items: [{ name, grams, kcal, protein, carb, fat, fiber, confidence }] }` and a prompt:
  "Identify each distinct food in this image. Estimate portion grams and the macros for that
  portion. Give confidence 0-1. Return only the structured object."
- Parses model output, returns `{ items }` (the app re-validates via `parseVisionResponse`).
- Errors (no key, OpenAI failure) → HTTP 500 with a safe message (no secret leakage).
- **Local run:** `supabase functions serve estimate-food` with `OPENAI_API_KEY` in
  `supabase/functions/.env` (gitignored). Deploy later: `supabase functions deploy` +
  `supabase secrets set OPENAI_API_KEY=...`.

---

## 6. App glue

File: `src/features/food/visionApi.ts`

```
estimateFromImage(base64: string): Promise<VisionItem[]>
  - supabase.functions.invoke("estimate-food", { body: { image: base64 } })
  - returns parseVisionResponse(data)

uploadFoodPhoto(localUri: string): Promise<string>   // returns storage path
  - upload to food-photos/<uid>/<uuid>.jpg, return path

logVisionItem(date, meal, item: VisionItem, photoPath: string | null): Promise<void>
  - insert food_logs row: food_id null, grams=item.grams, snapshot=item macros,
    scan_method='vision', photo_path
```

---

## 7. Screens

- `app/food/photo.tsx` — take photo (expo-camera) or pick (expo-image-picker), downscale
  (expo-image-manipulator), call `estimateFromImage`, show spinner, route to review.
- `app/food/photo-review.tsx` — list of `VisionItem` with editable name/grams/kcal/protein,
  meal picker, confidence badge; "Log all" uploads photo + inserts each item.
- Entry: a "Photo" button on the Food tab (`app/(tabs)/food.tsx`) alongside Add/Scan.

---

## 8. Schema / storage delta (migration `0004_food_photos.sql`)

```sql
insert into storage.buckets (id, name, public) values ('food-photos','food-photos', false)
on conflict do nothing;

-- owner-only access: path is prefixed with the user's id
create policy "food-photos read own" on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "food-photos write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

`food_logs.scan_method` and `photo_path` already exist (Phase 1).

---

## 9. Testing

- `vision.test.ts`: `parseVisionResponse` against a valid fixture (2 items), a malformed
  object (`{}` → []), negative/missing fields clamped to 0, confidence clamp.
- Live smoke: with `OPENAI_API_KEY` set locally, `supabase functions serve`, post a small
  test image, assert `items.length >= 1` and numeric fields. Run once during verification.
- DB/log path: verify a vision food_log inserts with `scan_method='vision'` and appears in
  the diary totals (REST, as prior phases). RLS on `food-photos` checked (other user can't read).
- Device camera/photo picker walkthrough is the user's.

---

## 10. Out of scope

Re-estimate from a stored photo, barcode-in-photo, recipe/ingredient breakdown, on-device
models, switching providers at runtime. Keep Phase 4 to photo → estimate → review → log.
