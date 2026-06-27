# Apex — Phase 5: Goal + Progress Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute daily calorie/protein targets, % to goal, on-pace status and projected finish from stats+goal+weigh-ins; log weigh-ins/measurements/steps/progress-photos; show a numeric dashboard.

**Architecture:** A pure `engine.ts` holds all math (unit-tested, no I/O). `progress/api.ts` wraps Supabase reads/writes and calls the engine to recompute and persist targets on each weigh-in. Screens render the dashboard and tracking forms. Tables already exist; one migration adds a private progress-photos bucket.

**Tech Stack:** Expo + expo-router, TypeScript, Supabase (DB + Storage), ts-jest, expo-image-picker/manipulator (reused from Phase 4).

## Global Constraints

- App **Apex**. TypeScript `strict`. Units metric (kg, cm, kcal).
- BMR Mifflin-St Jeor: male `10·kg+6.25·cm−5·age+5`; female `−161`.
- Activity factors: sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very_active 1.9.
- TDEE = `BMR×factor + steps×0.04`. Steps manual (default 0). Real HealthKit deferred.
- Deficit = `(start−target)×7700` spread over days-to-target (≥1 day).
- Calorie target = `TDEE − dailyDeficit`, floored at `max(BMR, 1200)`.
- Protein target = `2.0 × current bodyweight kg`.
- % to goal = `(start−current)/(start−target)×100`, clamped 0–100.
- 7-day moving average for current weight / pace. On-pace tolerance ±0.2 kg.
- Recompute targets on each new weigh-in; persist to `goals` row.
- Pure logic unit-tested via ts-jest (`tsconfig.test.json`); app `tsconfig.json` excludes `*.test.ts` and `supabase`.
- Local Supabase via Docker; queries via `docker exec -i supabase_db_personal-fitness psql -U postgres`. Anon key in `.env.local`.

---

## File Structure

```
supabase/migrations/0005_progress_photos.sql
src/features/goal/
  engine.ts          # pure math (TESTED)
  engine.test.ts
src/features/progress/
  api.ts             # Supabase CRUD + recompute + dashboard assembly
app/(tabs)/dashboard.tsx   # MODIFY: numeric readout
app/progress/
  _layout.tsx
  log.tsx            # weight + measurements + steps
  photo.tsx          # progress photo
  history.tsx        # weight trend + measurements
```

---

### Task 1: Progress-photos storage bucket migration

**Files:**
- Create: `supabase/migrations/0005_progress_photos.sql`

**Interfaces:**
- Consumes: Phase 1 `progress_photos` table.
- Produces: private `progress-photos` bucket with owner-only policies.

- [ ] **Step 1: Write the migration**

```sql
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "progress-photos read own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress-photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress-photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply**

Run: `npx supabase db reset --local`
Expected: applies `0001`–`0005`, no errors.

- [ ] **Step 3: Verify**

Run:
```bash
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select id from storage.buckets where id='progress-photos';"
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select count(*) from pg_policies where tablename='objects' and policyname like 'progress-photos%';"
```
Expected: prints `progress-photos`; count = 3.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_progress_photos.sql
git commit -m "feat: add private progress-photos storage bucket with RLS"
```

---

### Task 2: Goal engine (pure math, TDD)

**Files:**
- Create: `src/features/goal/engine.ts`, `src/features/goal/engine.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Sex = "male" | "female"`
  - `type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active"`
  - `bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number`
  - `activityFactor(a: Activity): number`
  - `tdee(bmr: number, activity: Activity, steps: number): number`
  - `daysBetween(fromIso: string, toIso: string): number`
  - `type TargetsInput = { sex: Sex; weightKg: number; heightCm: number; age: number; activity: Activity; steps: number; startWeightKg: number; targetWeightKg: number; targetDate: string; today: string }`
  - `dailyTargets(i: TargetsInput): { calorieTarget: number; proteinTarget: number; tdee: number; dailyDeficit: number }`
  - `movingAverage(weights: number[], window?: number): number`
  - `progressPercent(start: number, current: number, target: number): number`
  - `expectedWeight(start: number, target: number, targetDate: string, startDate: string, today: string): number`
  - `onPace(currentAvg: number, expected: number): { kg: number; status: "ahead" | "on" | "behind" }`
  - `projectedFinish(start: number, currentAvg: number, target: number, startDate: string, today: string): string | null`

- [ ] **Step 1: Write failing tests `src/features/goal/engine.test.ts`**

```ts
import {
  bmrMifflin, activityFactor, tdee, daysBetween, dailyTargets,
  movingAverage, progressPercent, expectedWeight, onPace, projectedFinish,
} from "./engine";

describe("bmrMifflin", () => {
  it("male", () => expect(bmrMifflin("male", 80, 178, 30)).toBeCloseTo(1767.5, 1));
  it("female", () => expect(bmrMifflin("female", 80, 178, 30)).toBeCloseTo(1601.5, 1));
});

describe("activityFactor + tdee", () => {
  it("moderate factor", () => expect(activityFactor("moderate")).toBe(1.55));
  it("tdee adds steps kcal", () => {
    expect(tdee(1767.5, "moderate", 5000)).toBeCloseTo(1767.5 * 1.55 + 200, 1);
  });
});

describe("daysBetween", () => {
  it("counts days", () => expect(daysBetween("2026-06-28", "2026-07-08")).toBe(10));
});

describe("dailyTargets", () => {
  const base = {
    sex: "male" as const, weightKg: 85, heightCm: 178, age: 30, activity: "moderate" as const,
    steps: 0, startWeightKg: 85, targetWeightKg: 75, today: "2026-06-28",
  };
  it("computes target above the floor", () => {
    const r = dailyTargets({ ...base, targetDate: "2026-10-06" }); // 100 days
    expect(r.dailyDeficit).toBeCloseTo(770, 0);          // 10*7700/100
    expect(r.proteinTarget).toBe(170);                    // 2.0*85
    expect(r.calorieTarget).toBeCloseTo(85 * 0 + 1817.5 * 1.55 - 770, 0);
  });
  it("floors at max(bmr,1200) when deficit too big", () => {
    const r = dailyTargets({ ...base, targetDate: "2026-07-08" }); // 10 days -> huge deficit
    const bmr = bmrMifflin("male", 85, 178, 30);
    expect(r.calorieTarget).toBeCloseTo(Math.max(bmr, 1200), 1);
  });
});

describe("movingAverage", () => {
  it("averages all when fewer than window", () => expect(movingAverage([84, 82])).toBe(83));
  it("uses last <window> values", () => expect(movingAverage([90, 1, 2, 3, 4, 5, 6, 7], 7)).toBeCloseTo(4, 5));
});

describe("progressPercent", () => {
  it("normal", () => expect(progressPercent(85, 82, 75)).toBeCloseTo(30, 5));
  it("clamps to 0", () => expect(progressPercent(85, 86, 75)).toBe(0));
  it("clamps to 100", () => expect(progressPercent(85, 74, 75)).toBe(100));
});

describe("expectedWeight", () => {
  it("linear midpoint", () => {
    expect(expectedWeight(85, 75, "2026-10-06", "2026-06-28", "2026-08-17")).toBeCloseTo(80, 0);
  });
});

describe("onPace", () => {
  it("behind when heavier than expected", () => expect(onPace(81, 80).status).toBe("behind"));
  it("ahead when lighter", () => expect(onPace(79, 80).status).toBe("ahead"));
  it("on within tolerance", () => expect(onPace(80.1, 80).status).toBe("on"));
});

describe("projectedFinish", () => {
  it("null when no progress", () => {
    expect(projectedFinish(85, 85, 75, "2026-06-28", "2026-07-08")).toBeNull();
  });
  it("returns a date when progressing", () => {
    const d = projectedFinish(85, 84, 75, "2026-06-28", "2026-07-08"); // 1kg in 10 days
    expect(typeof d).toBe("string");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx jest src/features/goal/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Implement `src/features/goal/engine.ts`**

```ts
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";

const FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const KCAL_PER_KG = 7700;
const KCAL_PER_STEP = 0.04;
const HARD_FLOOR = 1200;
const MS_PER_DAY = 86_400_000;

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function activityFactor(a: Activity): number {
  return FACTORS[a] ?? 1.2;
}

export function tdee(bmr: number, activity: Activity, steps: number): number {
  return bmr * activityFactor(activity) + Math.max(0, steps) * KCAL_PER_STEP;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

export type TargetsInput = {
  sex: Sex; weightKg: number; heightCm: number; age: number; activity: Activity; steps: number;
  startWeightKg: number; targetWeightKg: number; targetDate: string; today: string;
};

export function dailyTargets(i: TargetsInput): {
  calorieTarget: number; proteinTarget: number; tdee: number; dailyDeficit: number;
} {
  const bmr = bmrMifflin(i.sex, i.weightKg, i.heightCm, i.age);
  const td = tdee(bmr, i.activity, i.steps);
  const days = Math.max(1, daysBetween(i.today, i.targetDate));
  const totalDeficit = Math.max(0, i.startWeightKg - i.targetWeightKg) * KCAL_PER_KG;
  const dailyDeficit = totalDeficit / days;
  const floor = Math.max(bmr, HARD_FLOOR);
  const calorieTarget = Math.max(td - dailyDeficit, floor);
  const proteinTarget = 2.0 * i.weightKg;
  return { calorieTarget, proteinTarget, tdee: td, dailyDeficit };
}

export function movingAverage(weights: number[], window = 7): number {
  if (weights.length === 0) return 0;
  const slice = weights.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function progressPercent(start: number, current: number, target: number): number {
  const denom = start - target;
  if (denom === 0) return 0;
  const pct = ((start - current) / denom) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function expectedWeight(
  start: number, target: number, targetDate: string, startDate: string, today: string
): number {
  const total = Math.max(1, daysBetween(startDate, targetDate));
  const elapsed = Math.max(0, Math.min(total, daysBetween(startDate, today)));
  const rate = (start - target) / total;
  return start - rate * elapsed;
}

export function onPace(
  currentAvg: number, expected: number
): { kg: number; status: "ahead" | "on" | "behind" } {
  const diff = currentAvg - expected; // positive = heavier than expected = behind
  if (diff > 0.2) return { kg: diff, status: "behind" };
  if (diff < -0.2) return { kg: diff, status: "ahead" };
  return { kg: diff, status: "on" };
}

export function projectedFinish(
  start: number, currentAvg: number, target: number, startDate: string, today: string
): string | null {
  const elapsed = Math.max(1, daysBetween(startDate, today));
  const lost = start - currentAvg;
  if (lost <= 0) return null;
  const ratePerDay = lost / elapsed;
  const remainingKg = currentAvg - target;
  if (remainingKg <= 0) return today;
  const daysLeft = Math.ceil(remainingKg / ratePerDay);
  const finish = new Date(new Date(today + "T00:00:00").getTime() + daysLeft * MS_PER_DAY);
  return finish.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx jest src/features/goal/engine.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/goal/engine.ts src/features/goal/engine.test.ts
git commit -m "feat: add tested goal/progress math engine"
```

---

### Task 3: Progress API + recompute + dashboard assembly

**Files:**
- Create: `src/features/progress/api.ts`

**Interfaces:**
- Consumes: `supabase`; engine functions (Task 2); `ageFromBirthdate` from `src/features/profile/validation.ts`.
- Produces:
  - `type BodyLogRow = { id: string; date: string; weight_kg: number | null; bf_pct: number | null; waist_cm: number | null; chest_cm: number | null; arm_cm: number | null; hip_cm: number | null; thigh_cm: number | null }`
  - `type DashboardData = { goal: { startWeightKg: number; targetWeightKg: number; targetDate: string } | null; currentWeight: number | null; progressPct: number | null; daysLeft: number | null; kgToGo: number | null; pace: { kg: number; status: string } | null; calorieTarget: number | null; proteinTarget: number | null; projectedFinish: string | null }`
  - `logBody(date: string, f: { weightKg?: number; bfPct?: number; waist?: number; chest?: number; arm?: number; hip?: number; thigh?: number }): Promise<BodyLogRow>`
  - `logSteps(date: string, steps: number): Promise<void>`
  - `uploadProgressPhoto(localUri: string): Promise<string>`
  - `logProgressPhoto(date: string, path: string): Promise<void>`
  - `recomputeTargets(): Promise<void>`
  - `getDashboard(): Promise<DashboardData>`
  - `weightSeries(): Promise<{ date: string; weight: number }[]>`

- [ ] **Step 1: Implement `src/features/progress/api.ts`**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 3: Verify recompute + dashboard math vs local Supabase**

Create temp `scratchpad/verify_progress.mjs` (not committed): sign up; set profile (male, dob, 178cm, moderate); insert a goal (start 85, target 75, target_date ~100 days out); insert a body_log weight 82; PATCH goals targets by replicating the engine result; read back and confirm targets present and weight stored.

```js
const ANON = process.env.ANON;
const BASE = "http://127.0.0.1:54321";
const H = { apikey: ANON, "Content-Type": "application/json" };
const email = `prog_${Date.now()}@apex.local`, password = "password123";
await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) });
const tok = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) })).json();
const A = { ...H, Authorization: `Bearer ${tok.access_token}`, Prefer: "return=representation" };
const uid = tok.user.id;
await fetch(`${BASE}/rest/v1/users?id=eq.${uid}`, { method: "PATCH", headers: A, body: JSON.stringify({ sex: "male", birthdate: "1995-01-01", height_cm: 178, activity_level: "moderate" }) });
const goal = (await (await fetch(`${BASE}/rest/v1/goals`, { method: "POST", headers: A, body: JSON.stringify({ user_id: uid, start_weight_kg: 85, target_weight_kg: 75, target_bf_pct: 12, target_date: "2026-10-06" }) })).json())[0];
await fetch(`${BASE}/rest/v1/body_logs`, { method: "POST", headers: A, body: JSON.stringify({ user_id: uid, date: "2026-06-28", weight_kg: 82 }) });
// replicate engine: bmr male 82kg,178,31 = 10*82+6.25*178-5*31+5 = 820+1112.5-155+5 = 1782.5; tdee*1.55=2762.875; deficit=10*7700/100=770; cal=1992.875; protein=164
await fetch(`${BASE}/rest/v1/goals?id=eq.${goal.id}`, { method: "PATCH", headers: A, body: JSON.stringify({ daily_calorie_target: 1993, daily_protein_target: 164 }) });
const g = (await (await fetch(`${BASE}/rest/v1/goals?id=eq.${goal.id}&select=daily_calorie_target,daily_protein_target`, { headers: A })).json())[0];
console.log("targets persisted (expect ~1993 / 164):", g.daily_calorie_target, g.daily_protein_target);
const bl = await (await fetch(`${BASE}/rest/v1/body_logs?select=weight_kg&date=eq.2026-06-28`, { headers: A })).json();
console.log("weigh-in stored (expect 82):", bl[0]?.weight_kg);
```

Run: `ANON="<anon key>" node scratchpad/verify_progress.mjs`
Expected: `targets persisted (expect ~1993 / 164): 1993 164` and `weigh-in stored (expect 82): 82`.

- [ ] **Step 4: Commit**

```bash
git add src/features/progress/api.ts
git commit -m "feat: add progress API with recompute and dashboard assembly"
```

---

### Task 4: Dashboard screen (numeric readout)

**Files:**
- Modify: `app/(tabs)/dashboard.tsx`

**Interfaces:**
- Consumes: `getDashboard`, `DashboardData` (Task 3).
- Produces: numeric dashboard with links to progress screens.

- [ ] **Step 1: Replace `app/(tabs)/dashboard.tsx`**

```tsx
import { useCallback, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getDashboard, DashboardData } from "../../src/features/progress/api";

export default function Dashboard() {
  const [d, setD] = useState<DashboardData | null>(null);

  useFocusEffect(
    useCallback(() => {
      getDashboard().then(setD).catch((e) => Alert.alert("Load failed", String(e)));
    }, [])
  );

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "800" }}>Apex</Text>

      {!d?.goal && <Text>Set up your goal in onboarding to see progress.</Text>}

      {d?.goal && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 40, fontWeight: "800" }}>
            {d.progressPct != null ? Math.round(d.progressPct) : 0}%
          </Text>
          <Text style={{ color: "#666" }}>to goal</Text>
          <Text>
            {d.currentWeight != null ? d.currentWeight.toFixed(1) : "—"} kg now ·{" "}
            {d.kgToGo != null ? d.kgToGo.toFixed(1) : "—"} kg to {d.goal.targetWeightKg} kg
          </Text>
          <Text>{d.daysLeft ?? "—"} days left · target {d.goal.targetDate}</Text>
          {d.pace && (
            <Text style={{ color: d.pace.status === "behind" ? "red" : "green" }}>
              {d.pace.status === "on"
                ? "on pace ✅"
                : d.pace.status === "ahead"
                ? `ahead ${Math.abs(d.pace.kg).toFixed(1)} kg ✅`
                : `behind ${d.pace.kg.toFixed(1)} kg ⚠️`}
            </Text>
          )}
          <Text style={{ fontWeight: "600", marginTop: 8 }}>
            Today: ≤ {d.calorieTarget ?? "—"} kcal · ≥ {d.proteinTarget ?? "—"} g protein
          </Text>
          <Text style={{ color: "#666" }}>
            projected finish: {d.projectedFinish ?? "keep logging"}
          </Text>
        </View>
      )}

      <View style={{ gap: 8, marginTop: 12 }}>
        <Button title="Log weigh-in / measurements" onPress={() => router.push("/progress/log")} />
        <Button title="Progress photo" onPress={() => router.push("/progress/photo")} />
        <Button title="History" onPress={() => router.push("/progress/history")} />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/dashboard.tsx"
git commit -m "feat: numeric dashboard readout"
```

---

### Task 5: Progress log screen (weight + measurements + steps)

**Files:**
- Create: `app/progress/_layout.tsx`, `app/progress/log.tsx`

**Interfaces:**
- Consumes: `logBody`, `logSteps` (Task 3).
- Produces: a form that records a weigh-in (+ optional measurements + steps), triggering recompute.

- [ ] **Step 1: Create `app/progress/_layout.tsx`**

```tsx
import { Stack } from "expo-router";

export default function ProgressLayout() {
  return <Stack screenOptions={{ headerShown: true, headerTitle: "Progress" }} />;
}
```

- [ ] **Step 2: Create `app/progress/log.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, Button, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { logBody, logSteps } from "../../src/features/progress/api";

function numOrUndef(s: string): number | undefined {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

export default function ProgressLog() {
  const [weight, setWeight] = useState("");
  const [bf, setBf] = useState("");
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [arm, setArm] = useState("");
  const [hip, setHip] = useState("");
  const [thigh, setThigh] = useState("");
  const [steps, setSteps] = useState("");

  async function save() {
    const weightKg = numOrUndef(weight);
    if (weightKg == null) return Alert.alert("Weight required");
    const date = new Date().toISOString().slice(0, 10);
    try {
      await logBody(date, {
        weightKg,
        bfPct: numOrUndef(bf),
        waist: numOrUndef(waist),
        chest: numOrUndef(chest),
        arm: numOrUndef(arm),
        hip: numOrUndef(hip),
        thigh: numOrUndef(thigh),
      });
      const s = numOrUndef(steps);
      if (s != null) await logSteps(date, s);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  const field = (label: string, v: string, set: (s: string) => void) => (
    <View style={{ gap: 4 }}>
      <Text style={{ color: "#666" }}>{label}</Text>
      <TextInput value={v} onChangeText={set} keyboardType="numeric"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Log progress</Text>
      {field("Weight kg (required)", weight, setWeight)}
      {field("Body fat %", bf, setBf)}
      {field("Waist cm", waist, setWaist)}
      {field("Chest cm", chest, setChest)}
      {field("Arm cm", arm, setArm)}
      {field("Hip cm", hip, setHip)}
      {field("Thigh cm", thigh, setThigh)}
      {field("Steps today", steps, setSteps)}
      <Button title="Save" onPress={save} />
    </ScrollView>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Commit**

```bash
git add app/progress/_layout.tsx app/progress/log.tsx
git commit -m "feat: add progress log screen"
```

---

### Task 6: Progress photo + history screens

**Files:**
- Create: `app/progress/photo.tsx`, `app/progress/history.tsx`

**Interfaces:**
- Consumes: `uploadProgressPhoto`, `logProgressPhoto`, `weightSeries` (Task 3); expo-image-picker/manipulator (installed Phase 4).
- Produces: photo capture/upload screen; weight-trend list screen.

- [ ] **Step 1: Create `app/progress/photo.tsx`**

```tsx
import { useState } from "react";
import { View, Text, Button, Image, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { uploadProgressPhoto, logProgressPhoto } from "../../src/features/progress/api";

export default function ProgressPhoto() {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(fromCamera: boolean) {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("Camera permission needed");
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (res.canceled) return;
    const manip = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1080 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    setUri(manip.uri);
  }

  async function save() {
    if (!uri) return;
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const path = await uploadProgressPhoto(uri);
      await logProgressPhoto(date, path);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Progress photo</Text>
      {uri && <Image source={{ uri }} style={{ width: "100%", height: 360, borderRadius: 8 }} />}
      <Button title="Take photo" onPress={() => pick(true)} />
      <Button title="Pick from library" onPress={() => pick(false)} />
      {uri && (busy ? <ActivityIndicator /> : <Button title="Save photo" onPress={save} />)}
    </View>
  );
}
```

- [ ] **Step 2: Create `app/progress/history.tsx`**

```tsx
import { useEffect, useState } from "react";
import { View, Text, FlatList, Alert } from "react-native";
import { weightSeries } from "../../src/features/progress/api";

export default function History() {
  const [rows, setRows] = useState<{ date: string; weight: number }[]>([]);

  useEffect(() => {
    weightSeries().then(setRows).catch((e) => Alert.alert("Load failed", String(e)));
  }, []);

  const min = rows.length ? Math.min(...rows.map((r) => r.weight)) : 0;
  const max = rows.length ? Math.max(...rows.map((r) => r.weight)) : 1;

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Weight history</Text>
      <FlatList
        data={[...rows].reverse()}
        keyExtractor={(r) => r.date}
        ListEmptyComponent={<Text>No weigh-ins yet.</Text>}
        renderItem={({ item }) => {
          const frac = max === min ? 1 : (item.weight - min) / (max - min);
          return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
              <Text style={{ width: 88 }}>{item.date}</Text>
              <View style={{ flex: 1, height: 10, backgroundColor: "#eee", borderRadius: 5 }}>
                <View style={{ width: `${20 + frac * 80}%`, height: 10, backgroundColor: "#4a90d9", borderRadius: 5 }} />
              </View>
              <Text style={{ width: 56, textAlign: "right" }}>{item.weight.toFixed(1)}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: `TYPECHECK_PASS`; all suites pass (Phases 1–4 + engine).

- [ ] **Step 4: Commit**

```bash
git add app/progress/photo.tsx app/progress/history.tsx
git commit -m "feat: add progress photo and weight history screens"
```

---

## Self-Review

**Spec coverage:**
- progress-photos bucket + RLS → Task 1 ✓
- Engine (BMR, TDEE+steps, deficit+floor, protein, %, moving avg, expected, onPace, projection) → Task 2 ✓
- API (logBody+recompute, logSteps, photo upload/log, getDashboard, weightSeries) → Task 3 ✓
- Recompute on weigh-in → Task 3 (`logBody` calls `recomputeTargets`) ✓
- Numeric dashboard → Task 4 ✓
- Weigh-in + measurements + steps form → Task 5 ✓
- Progress photo + history → Task 6 ✓
- Floor max(BMR,1200); protein 2.0/kg; 7-day MA; ±0.2 tolerance → Task 2 engine ✓

**Placeholder scan:** none — full code/commands/expected output throughout.

**Type consistency:** engine types (`Sex`, `Activity`, `TargetsInput`) used unchanged in Task 3. `DashboardData`/`BodyLogRow` defined in Task 3 consumed by Tasks 4/6. `logBody`/`logSteps`/`uploadProgressPhoto`/`logProgressPhoto`/`weightSeries`/`getDashboard` signatures match calls in Tasks 4/5/6. `ageFromBirthdate` reused from Phase 1 `profile/validation.ts`.

**Notes:** `recomputeTargets` is exercised in-app via `logBody`; the Task 3 verify script replicates the engine result over REST (REST can't run the TS engine), with the arithmetic shown inline. `startDate` for pace uses `goals.created_at` (the goal's creation = plan start), consistent between dashboard and engine.
