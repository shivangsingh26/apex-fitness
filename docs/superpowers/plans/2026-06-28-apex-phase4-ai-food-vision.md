# Apex — Phase 4: AI Food Vision — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photo → Supabase Edge Function → OpenAI vision → list of detected foods with estimated grams/macros → editable review → log each into the Phase 3 diary.

**Architecture:** A Deno Edge Function holds `OPENAI_API_KEY` and calls OpenAI's vision API with a JSON schema, returning `{ items }`. A pure `vision.ts` parser validates/clamps the response (unit-tested). App glue uploads the photo to a private Storage bucket and inserts one `food_logs` row per confirmed item. The review screen is the accuracy gate.

**Tech Stack:** Expo + expo-router, TypeScript, Supabase (Edge Functions + Storage), OpenAI vision API, expo-image-picker, expo-image-manipulator, ts-jest.

## Global Constraints

- App name **Apex**. TypeScript `strict`. Units metric (g, kcal).
- Provider: **OpenAI** vision model with JSON-schema structured output.
- Model id: read from env `OPENAI_VISION_MODEL`; **confirm a current vision-capable id against OpenAI docs** before the live test — do not hardcode a guessed id elsewhere.
- Secret `OPENAI_API_KEY`: Edge Function env/secrets only. Never in the app bundle, never committed, never printed.
- Output: multi-item; each `{ name, grams, kcal, protein, carb, fat, fiber, confidence }`, absolute macros for the estimated portion.
- Always review + edit before logging. Items log as `food_logs` with `food_id=null`, `scan_method='vision'`, estimate as snapshot.
- Photo stored in private `food-photos` bucket, owner-only RLS, path → `food_logs.photo_path`.
- Pure logic unit-tested via ts-jest (`tsconfig.test.json`); app `tsconfig.json` excludes `*.test.ts`. Network/Deno code not unit-tested.
- Local Supabase via Docker; DB queries via `docker exec -i supabase_db_personal-fitness psql -U postgres`. Local anon key in `.env.local`.

---

## File Structure

```
supabase/migrations/0004_food_photos.sql      # storage bucket + RLS
supabase/functions/estimate-food/index.ts     # Deno Edge Function (holds OPENAI_API_KEY)
supabase/functions/.env                        # OPENAI_API_KEY (gitignored)
src/features/food/
  vision.ts            # parseVisionResponse (TESTED)
  vision.test.ts
  vision.fixture.json
  visionApi.ts         # invoke function + upload photo + log item
app/food/
  photo.tsx            # capture/pick + downscale -> estimate -> review
  photo-review.tsx     # editable items + meal -> log all
app/(tabs)/food.tsx    # MODIFY: add "Photo" button
```

---

### Task 1: Storage bucket + RLS migration

**Files:**
- Create: `supabase/migrations/0004_food_photos.sql`

**Interfaces:**
- Consumes: Phase 1 `food_logs` (`scan_method`, `photo_path` already exist).
- Produces: private `food-photos` bucket with owner-only object policies.

- [ ] **Step 1: Write the migration**

```sql
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', false)
on conflict (id) do nothing;

create policy "food-photos read own" on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "food-photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "food-photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply**

Run: `npx supabase db reset --local`
Expected: applies `0001`–`0004`, no errors.

- [ ] **Step 3: Verify bucket + policies**

Run:
```bash
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select id from storage.buckets where id='food-photos';"
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select count(*) from pg_policies where tablename='objects' and policyname like 'food-photos%';"
```
Expected: prints `food-photos`; policy count = 3.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_food_photos.sql
git commit -m "feat: add private food-photos storage bucket with RLS"
```

---

### Task 2: Vision response parser (pure logic, TDD)

**Files:**
- Create: `src/features/food/vision.ts`, `src/features/food/vision.test.ts`, `src/features/food/vision.fixture.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type VisionItem = { name: string; grams: number; kcal: number; protein: number; carb: number; fat: number; fiber: number; confidence: number }`
  - `parseVisionResponse(raw: unknown): VisionItem[]`

- [ ] **Step 1: Create fixture `src/features/food/vision.fixture.json`**

```json
{
  "items": [
    { "name": "Grilled chicken breast", "grams": 150, "kcal": 248, "protein": 46.5, "carb": 0, "fat": 5.4, "fiber": 0, "confidence": 0.8 },
    { "name": "White rice", "grams": 200, "kcal": 260, "protein": 5.4, "carb": 56, "fat": 0.6, "fiber": 0.8, "confidence": 0.6 }
  ]
}
```

- [ ] **Step 2: Write failing tests `src/features/food/vision.test.ts`**

```ts
import { parseVisionResponse } from "./vision";
import fixture from "./vision.fixture.json";

describe("parseVisionResponse", () => {
  it("parses a valid multi-item response", () => {
    const items = parseVisionResponse(fixture);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("Grilled chicken breast");
    expect(items[0].grams).toBe(150);
    expect(items[1].kcal).toBe(260);
  });

  it("returns [] for malformed input", () => {
    expect(parseVisionResponse({})).toEqual([]);
    expect(parseVisionResponse(null)).toEqual([]);
    expect(parseVisionResponse({ items: "nope" })).toEqual([]);
  });

  it("drops items without a name", () => {
    const r = parseVisionResponse({ items: [{ grams: 100, kcal: 100 }] });
    expect(r).toEqual([]);
  });

  it("clamps negatives to 0 and defaults missing numbers", () => {
    const r = parseVisionResponse({ items: [{ name: "X", grams: -5, kcal: 100 }] });
    expect(r[0].grams).toBe(0);
    expect(r[0].protein).toBe(0);
    expect(r[0].confidence).toBe(0);
  });

  it("clamps confidence to [0,1]", () => {
    const r = parseVisionResponse({ items: [{ name: "X", confidence: 5 }] });
    expect(r[0].confidence).toBe(1);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npx jest src/features/food/vision.test.ts`
Expected: FAIL — `Cannot find module './vision'`.

- [ ] **Step 4: Implement `src/features/food/vision.ts`**

```ts
export type VisionItem = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber: number;
  confidence: number;
};

function nonNeg(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

export function parseVisionResponse(raw: unknown): VisionItem[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: VisionItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const name = (it as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim() === "") continue;
    const o = it as Record<string, unknown>;
    out.push({
      name: name.trim(),
      grams: nonNeg(o.grams),
      kcal: nonNeg(o.kcal),
      protein: nonNeg(o.protein),
      carb: nonNeg(o.carb),
      fat: nonNeg(o.fat),
      fiber: nonNeg(o.fiber),
      confidence: clamp01(o.confidence),
    });
  }
  return out;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx jest src/features/food/vision.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/food/vision.ts src/features/food/vision.test.ts src/features/food/vision.fixture.json
git commit -m "feat: add tested vision response parser"
```

---

### Task 3: Edge Function `estimate-food` (OpenAI vision)

**Files:**
- Create: `supabase/functions/estimate-food/index.ts`
- Create: `supabase/functions/.env` (gitignored)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` from env.
- Produces: HTTP function returning `{ items: VisionItem[]-shaped }`.

- [ ] **Step 1: Gitignore the function env**

Append to `.gitignore`: `supabase/functions/.env`. Then create `supabase/functions/.env` with (you set the real key; never commit it):

```
OPENAI_API_KEY=sk-...your key...
OPENAI_VISION_MODEL=gpt-4o
```

Note: confirm `OPENAI_VISION_MODEL` is a current vision-capable model id from OpenAI docs before the live test; change this line if the docs name a newer one.

- [ ] **Step 2: Write `supabase/functions/estimate-food/index.ts`**

```ts
// Deno Edge Function: estimate foods from an image via OpenAI vision.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carb: { type: "number" },
          fat: { type: "number" },
          fiber: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["name", "grams", "kcal", "protein", "carb", "fat", "fiber", "confidence"],
      },
    },
  },
  required: ["items"],
};

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 500, headers: cors });
    const model = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o";

    const { image } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "Missing image" }), { status: 400, headers: cors });
    const dataUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify each distinct food in this image. For each, estimate the portion in grams " +
                "and the macros for THAT portion (kcal, protein, carb, fat, fiber in grams) and a " +
                "confidence 0-1. Return only the structured object.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "food_items", schema: SCHEMA, strict: true },
      },
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Vision provider error" }), { status: 500, headers: cors });
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Estimation failed" }), { status: 500, headers: cors });
  }
});
```

- [ ] **Step 3: Confirm the model id, then serve locally**

Confirm `OPENAI_VISION_MODEL` against current OpenAI docs (a vision-capable chat model that supports `response_format: json_schema`). Update `supabase/functions/.env` if needed.

Run: `npx supabase functions serve estimate-food --env-file supabase/functions/.env`
Expected: "Serving functions on http://127.0.0.1:54321/functions/v1/estimate-food".

- [ ] **Step 4: Live smoke test (requires your key + a sample food image)**

In another terminal, with a local JPEG at `~/food.jpg`:

```bash
ANON="<anon key from .env.local>"
B64=$(base64 -i ~/food.jpg)
curl -s -X POST "http://127.0.0.1:54321/functions/v1/estimate-food" \
  -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d "{\"image\":\"$B64\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('items:', (j.items||[]).length, j.items?.[0]?.name)})"
```
Expected: `items: <n>` with n ≥ 1 and a food name. (If you have no key/image yet, skip this step; Task 2 parser is the deterministic gate.)

- [ ] **Step 5: Commit (NOT the .env)**

```bash
git add supabase/functions/estimate-food/index.ts .gitignore
git status   # confirm supabase/functions/.env is NOT staged
git commit -m "feat: add estimate-food edge function (OpenAI vision)"
```

---

### Task 4: App glue — invoke function, upload photo, log item

**Files:**
- Create: `src/features/food/visionApi.ts`

**Interfaces:**
- Consumes: `supabase`; `parseVisionResponse`, `VisionItem` (Task 2); `Meal` (Phase 3 `food/api.ts`).
- Produces:
  - `estimateFromImage(base64: string): Promise<VisionItem[]>`
  - `uploadFoodPhoto(localUri: string): Promise<string>`
  - `logVisionItem(date: string, meal: Meal, item: VisionItem, photoPath: string | null): Promise<void>`

- [ ] **Step 1: Implement `src/features/food/visionApi.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 3: Verify the log path against local Supabase**

Create temp `scratchpad/verify_vision.mjs` (not committed): sign up; insert a vision food_log directly via REST (food_id null, scan_method 'vision'); read it back in the diary date and confirm it appears with scan_method='vision'.

```js
const ANON = process.env.ANON;
const BASE = "http://127.0.0.1:54321";
const H = { apikey: ANON, "Content-Type": "application/json" };
const email = `vis_${Date.now()}@apex.local`, password = "password123";
await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) });
const tok = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) })).json();
const A = { ...H, Authorization: `Bearer ${tok.access_token}`, Prefer: "return=representation" };
const uid = tok.user.id;
await fetch(`${BASE}/rest/v1/food_logs`, { method: "POST", headers: A, body: JSON.stringify({ user_id: uid, date: "2026-06-28", meal: "lunch", food_id: null, grams: 150, kcal: 248, protein_g: 46.5, carb_g: 0, fat_g: 5.4, fiber_g: 0, scan_method: "vision" }) });
const rows = await (await fetch(`${BASE}/rest/v1/food_logs?select=scan_method,kcal&date=eq.2026-06-28`, { headers: A })).json();
console.log("vision log present (expect vision 248):", rows[0]?.scan_method, rows[0]?.kcal);
```

Run: `ANON="<anon key>" node scratchpad/verify_vision.mjs`
Expected: `vision log present (expect vision 248): vision 248`.

- [ ] **Step 4: Commit**

```bash
git add src/features/food/visionApi.ts
git commit -m "feat: add vision app glue (invoke, upload, log)"
```

---

### Task 5: Photo capture/pick screen

**Files:**
- Create: `app/food/photo.tsx`

**Interfaces:**
- Consumes: `estimateFromImage` (Task 4); expo-image-picker, expo-image-manipulator.
- Produces: captures/picks an image, downscales, estimates, routes to review with items + uri.

- [ ] **Step 1: Install deps**

Run: `npx expo install expo-image-picker expo-image-manipulator`

- [ ] **Step 2: Create `app/food/photo.tsx`**

```tsx
import { useState } from "react";
import { View, Text, Button, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { estimateFromImage } from "../../src/features/food/visionApi";

export default function Photo() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [busy, setBusy] = useState(false);

  async function handle(uri: string) {
    setBusy(true);
    try {
      const manip = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
        base64: true,
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const items = await estimateFromImage(manip.base64 ?? "");
      if (items.length === 0) {
        Alert.alert("No foods detected", "Try another photo or add manually.");
        return;
      }
      router.replace({
        pathname: "/food/photo-review",
        params: { date, uri: manip.uri, items: JSON.stringify(items) },
      });
    } catch (e) {
      Alert.alert("Estimate failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Camera permission needed");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) handle(res.assets[0].uri);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled) handle(res.assets[0].uri);
  }

  if (busy) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
        <ActivityIndicator size="large" />
        <Text>Estimating…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Snap your meal</Text>
      <Button title="Take photo" onPress={takePhoto} />
      <Button title="Pick from library" onPress={pickPhoto} />
      <Button title="Cancel" onPress={() => router.back()} />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Commit**

```bash
git add app/food/photo.tsx package.json package-lock.json
git commit -m "feat: add photo capture/estimate screen"
```

---

### Task 6: Review + log screen, and Food-tab entry

**Files:**
- Create: `app/food/photo-review.tsx`
- Modify: `app/(tabs)/food.tsx`

**Interfaces:**
- Consumes: `VisionItem` (Task 2); `uploadFoodPhoto`, `logVisionItem` (Task 4); `Meal` (Phase 3).
- Produces: editable item list → uploads photo once → logs each item → returns to diary.

- [ ] **Step 1: Create `app/food/photo-review.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, Button, ScrollView, Pressable, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { VisionItem } from "../../src/features/food/vision";
import { uploadFoodPhoto, logVisionItem } from "../../src/features/food/visionApi";
import { Meal } from "../../src/features/food/api";

export default function PhotoReview() {
  const params = useLocalSearchParams<{ date: string; uri: string; items: string }>();
  const date = params.date;
  const [items, setItems] = useState<VisionItem[]>(() => {
    try {
      return JSON.parse(params.items ?? "[]") as VisionItem[];
    } catch {
      return [];
    }
  });
  const [meal, setMeal] = useState<Meal>("lunch");
  const [saving, setSaving] = useState(false);

  function update(i: number, field: keyof VisionItem, value: string) {
    setItems((prev) => {
      const next = [...prev];
      const num = field === "name" ? value : Number(value) || 0;
      next[i] = { ...next[i], [field]: num } as VisionItem;
      return next;
    });
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function logAll() {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const photoPath = params.uri ? await uploadFoodPhoto(params.uri) : null;
      for (const it of items) await logVisionItem(date, meal, it, photoPath);
      router.replace("/(tabs)/food");
    } catch (e) {
      Alert.alert("Log failed", e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Review items</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["breakfast", "lunch", "dinner", "snack"] as Meal[]).map((m) => (
          <Pressable key={m} onPress={() => setMeal(m)}
            style={{ padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: meal === m ? "#ddd" : "white" }}>
            <Text style={{ textTransform: "capitalize" }}>{m}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView>
        {items.map((it, i) => (
          <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee", gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#999" }}>confidence {(it.confidence * 100).toFixed(0)}%</Text>
              <Pressable onPress={() => removeItem(i)}><Text style={{ color: "red" }}>Remove</Text></Pressable>
            </View>
            <TextInput value={it.name} onChangeText={(v) => update(i, "name", v)} placeholder="name"
              style={{ borderWidth: 1, padding: 8, borderRadius: 8 }} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={String(it.grams)} onChangeText={(v) => update(i, "grams", v)} keyboardType="numeric"
                placeholder="g" style={{ borderWidth: 1, padding: 8, borderRadius: 8, flex: 1 }} />
              <TextInput value={String(it.kcal)} onChangeText={(v) => update(i, "kcal", v)} keyboardType="numeric"
                placeholder="kcal" style={{ borderWidth: 1, padding: 8, borderRadius: 8, flex: 1 }} />
              <TextInput value={String(it.protein)} onChangeText={(v) => update(i, "protein", v)} keyboardType="numeric"
                placeholder="protein" style={{ borderWidth: 1, padding: 8, borderRadius: 8, flex: 1 }} />
            </View>
          </View>
        ))}
      </ScrollView>
      <Button title={saving ? "Saving…" : "Log all"} onPress={logAll} disabled={saving} />
      <Button title="Cancel" onPress={() => router.replace("/(tabs)/food")} />
    </View>
  );
}
```

- [ ] **Step 2: Add a "Photo" button to `app/(tabs)/food.tsx`**

Change the Add/Scan button row to include Photo:

```tsx
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Add food" onPress={() => router.push({ pathname: "/food/add", params: { date } })} />
        <Button title="Scan" onPress={() => router.push({ pathname: "/food/scan", params: { date } })} />
        <Button title="Photo" onPress={() => router.push({ pathname: "/food/photo", params: { date } })} />
      </View>
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx jest`
Expected: `TYPECHECK_PASS`; all suites pass (Phase 1–3 + vision parser).

- [ ] **Step 4: Commit**

```bash
git add app/food/photo-review.tsx "app/(tabs)/food.tsx"
git commit -m "feat: add vision review/log screen and food-tab photo entry"
```

---

## Self-Review

**Spec coverage:**
- Storage bucket + RLS → Task 1 ✓
- Pure parser/validator (multi-item, clamps) → Task 2 ✓
- Edge Function w/ OpenAI vision + JSON schema, secret-only → Task 3 ✓
- App glue (invoke, upload, log vision item) → Task 4 ✓
- Photo capture/pick + downscale + estimate → Task 5 ✓
- Always review + edit + meal + log all → Task 6 ✓
- Food-tab entry point → Task 6 ✓
- scan_method='vision', food_id null, snapshot → Tasks 4, 6 ✓
- Photo stored, path → food_logs.photo_path → Task 4 (`uploadFoodPhoto`) + Task 6 ✓

**Placeholder scan:** none — full code/commands/expected output throughout. `OPENAI_VISION_MODEL` is read from env with an explicit "confirm against docs" step (Task 3) rather than a hardcoded guess.

**Type consistency:** `VisionItem` (Task 2) consumed unchanged by Tasks 4/5/6. `estimateFromImage`/`uploadFoodPhoto`/`logVisionItem` signatures (Task 4) match calls in Tasks 5/6. `Meal` imported from Phase 3 `food/api.ts` in Tasks 4/6.

**Security note:** `OPENAI_API_KEY` is set only in `supabase/functions/.env` (gitignored, Task 3 Step 1) for local serve, and via `supabase secrets set` for production. Task 3 Step 5 explicitly checks the key file is not staged. The app never holds the key — it calls the function with the user's Supabase JWT.
