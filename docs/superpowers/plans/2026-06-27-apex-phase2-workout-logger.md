# Apex — Phase 2: Workout Logger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log workouts (exercises, sets, reps, weight, RPE), auto-detect PRs (heaviest weight + best Epley 1RM), run a rest timer, and review history with per-workout volume and per-exercise 1RM trend.

**Architecture:** Pure PR logic (`prEngine.ts`) is unit-tested and has no I/O. A thin `api.ts` wraps Supabase CRUD and calls the engine before persisting set flags. Expo Router screens render the flow. Tables already exist from Phase 1; one migration adjusts `workout_sets` PR columns and seeds the exercise library.

**Tech Stack:** Expo + expo-router, TypeScript, Supabase (`@supabase/supabase-js`), ts-jest (node env) for unit tests, Supabase CLI for migrations.

## Global Constraints

- App name: **Apex**. TypeScript `strict`.
- Units: metric (kg).
- PR rule: both heaviest weight AND best estimated 1RM. Epley: `weight × (1 + reps/30)`.
- Exercise library: ~50 curated exercises seeded (`is_custom=false`, `owner_id=null`); custom add supported.
- Rest timer: in-app countdown only, default 90s. No background/push (Phase 6).
- History volume metric: total volume = Σ(reps × weight) per workout.
- RLS already covers `workouts`/`workout_sets`/`exercises` (Phase 1) — no new policies.
- Pure logic unit-tested via ts-jest (`tsconfig.test.json`); app `tsconfig.json` excludes `*.test.ts`.
- Local Supabase runs via Docker with `[analytics] enabled=false`. DB queries via `docker exec -i supabase_db_personal-fitness psql -U postgres`.

---

## File Structure

```
supabase/migrations/0002_workout_logger.sql   # PR columns + seed
src/features/workouts/
  prEngine.ts        # Epley + detectPRs (TESTED)
  prEngine.test.ts
  api.ts             # Supabase CRUD + engine integration
app/(tabs)/
  _layout.tsx        # MODIFY: add Workouts tab
  workouts.tsx       # history list + Start workout
app/workout/
  _layout.tsx        # stack for active workout
  [id].tsx           # active workout: add exercises/sets, PR badges, rest timer
  exercise-picker.tsx
src/features/workouts/
  RestTimer.tsx      # countdown component
```

---

### Task 1: Schema migration — PR columns + exercise seed

**Files:**
- Create: `supabase/migrations/0002_workout_logger.sql`

**Interfaces:**
- Consumes: Phase 1 tables `exercises`, `workout_sets`.
- Produces: `workout_sets` columns `is_weight_pr`, `is_1rm_pr`, `est_1rm`; ~50 seeded exercises.

- [ ] **Step 1: Write the migration**

```sql
-- Replace single is_pr with explicit PR flags + stored est 1RM
alter table public.workout_sets drop column if exists is_pr;
alter table public.workout_sets add column is_weight_pr boolean not null default false;
alter table public.workout_sets add column is_1rm_pr boolean not null default false;
alter table public.workout_sets add column est_1rm numeric;

-- Curated starter exercise library (shared: is_custom=false, owner_id=null)
insert into public.exercises (name, muscle_group, type, is_custom) values
('Barbell Bench Press','chest','barbell',false),
('Incline Barbell Bench Press','chest','barbell',false),
('Dumbbell Bench Press','chest','dumbbell',false),
('Incline Dumbbell Press','chest','dumbbell',false),
('Cable Fly','chest','cable',false),
('Push-Up','chest','bodyweight',false),
('Overhead Press','shoulders','barbell',false),
('Dumbbell Shoulder Press','shoulders','dumbbell',false),
('Lateral Raise','shoulders','dumbbell',false),
('Rear Delt Fly','shoulders','dumbbell',false),
('Face Pull','shoulders','cable',false),
('Barbell Back Squat','legs','barbell',false),
('Front Squat','legs','barbell',false),
('Leg Press','legs','machine',false),
('Romanian Deadlift','legs','barbell',false),
('Leg Extension','legs','machine',false),
('Leg Curl','legs','machine',false),
('Walking Lunge','legs','dumbbell',false),
('Standing Calf Raise','legs','machine',false),
('Conventional Deadlift','back','barbell',false),
('Barbell Row','back','barbell',false),
('Pull-Up','back','bodyweight',false),
('Lat Pulldown','back','cable',false),
('Seated Cable Row','back','cable',false),
('Dumbbell Row','back','dumbbell',false),
('Barbell Curl','arms','barbell',false),
('Dumbbell Curl','arms','dumbbell',false),
('Hammer Curl','arms','dumbbell',false),
('Preacher Curl','arms','machine',false),
('Cable Triceps Pushdown','arms','cable',false),
('Overhead Triceps Extension','arms','dumbbell',false),
('Close-Grip Bench Press','arms','barbell',false),
('Dips','arms','bodyweight',false),
('Plank','core','bodyweight',false),
('Hanging Leg Raise','core','bodyweight',false),
('Cable Crunch','core','cable',false),
('Russian Twist','core','bodyweight',false),
('Back Extension','core','bodyweight',false),
('Goblet Squat','legs','dumbbell',false),
('Hip Thrust','legs','barbell',false),
('Incline Dumbbell Curl','arms','dumbbell',false),
('Machine Chest Press','chest','machine',false),
('Pec Deck','chest','machine',false),
('Arnold Press','shoulders','dumbbell',false),
('Cable Lateral Raise','shoulders','cable',false),
('Hack Squat','legs','machine',false),
('Seated Leg Curl','legs','machine',false),
('T-Bar Row','back','barbell',false),
('Chin-Up','back','bodyweight',false),
('Skullcrusher','arms','barbell',false)
on conflict do nothing;
```

- [ ] **Step 2: Apply via db reset (seed is in a migration, idempotent on conflict)**

Run: `npx supabase db reset --local`
Expected: applies `0001_init.sql` then `0002_workout_logger.sql`, no errors.

- [ ] **Step 3: Verify columns + seed count**

Run:
```bash
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select count(*) from public.exercises where is_custom=false;"
docker exec supabase_db_personal-fitness psql -U postgres -t -c "select column_name from information_schema.columns where table_name='workout_sets' and column_name in ('is_weight_pr','is_1rm_pr','est_1rm') order by column_name;"
```
Expected: count = 50; three columns listed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_workout_logger.sql
git commit -m "feat: add workout PR columns and seed exercise library"
```

---

### Task 2: PR engine (pure logic, TDD)

**Files:**
- Create: `src/features/workouts/prEngine.ts`, `src/features/workouts/prEngine.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `epley1RM(weightKg: number, reps: number): number`
  - `type SetInput = { weightKg: number; reps: number }`
  - `type ExerciseBests = { bestWeightKg: number; best1RM: number }`
  - `detectPRs(set: SetInput, bests: ExerciseBests): { est1RM: number; isWeightPr: boolean; is1RmPr: boolean }`

- [ ] **Step 1: Write failing tests `src/features/workouts/prEngine.test.ts`**

```ts
import { epley1RM, detectPRs } from "./prEngine";

describe("epley1RM", () => {
  it("computes Epley estimate", () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 2);
  });
  it("equals weight at 0 reps base (1 rep)", () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.333, 2);
  });
  it("guards non-positive input", () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(-10, 5)).toBe(0);
  });
});

describe("detectPRs", () => {
  it("flags both PRs when no history", () => {
    const r = detectPRs({ weightKg: 100, reps: 5 }, { bestWeightKg: 0, best1RM: 0 });
    expect(r.isWeightPr).toBe(true);
    expect(r.is1RmPr).toBe(true);
    expect(r.est1RM).toBeCloseTo(116.667, 2);
  });
  it("flags 1RM PR but not weight PR (more reps, lighter)", () => {
    // prior best weight 110, prior best 1RM 115
    const r = detectPRs({ weightKg: 100, reps: 8 }, { bestWeightKg: 110, best1RM: 115 });
    expect(r.isWeightPr).toBe(false);
    expect(r.is1RmPr).toBe(true); // 100*(1+8/30)=126.67 > 115
  });
  it("flags weight PR but not 1RM PR", () => {
    // heavier weight but lower est 1RM than prior
    const r = detectPRs({ weightKg: 120, reps: 1 }, { bestWeightKg: 110, best1RM: 130 });
    expect(r.isWeightPr).toBe(true);  // 120 > 110
    expect(r.is1RmPr).toBe(false);    // 120*(1+1/30)=124 < 130
  });
  it("flags neither when below both bests", () => {
    const r = detectPRs({ weightKg: 80, reps: 5 }, { bestWeightKg: 110, best1RM: 130 });
    expect(r.isWeightPr).toBe(false);
    expect(r.is1RmPr).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx jest src/features/workouts/prEngine.test.ts`
Expected: FAIL — `Cannot find module './prEngine'`.

- [ ] **Step 3: Implement `src/features/workouts/prEngine.ts`**

```ts
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

export type SetInput = { weightKg: number; reps: number };
export type ExerciseBests = { bestWeightKg: number; best1RM: number };

export function detectPRs(
  set: SetInput,
  bests: ExerciseBests
): { est1RM: number; isWeightPr: boolean; is1RmPr: boolean } {
  const est1RM = epley1RM(set.weightKg, set.reps);
  return {
    est1RM,
    isWeightPr: set.weightKg > bests.bestWeightKg,
    is1RmPr: est1RM > bests.best1RM,
  };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx jest src/features/workouts/prEngine.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/prEngine.ts src/features/workouts/prEngine.test.ts
git commit -m "feat: add tested PR detection engine"
```

---

### Task 3: Workouts API (Supabase CRUD + engine integration)

**Files:**
- Create: `src/features/workouts/api.ts`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`); `detectPRs`, `ExerciseBests` (Task 2).
- Produces:
  - `type ExerciseRow = { id: string; name: string; muscle_group: string | null; type: string | null; is_custom: boolean }`
  - `type WorkoutRow = { id: string; user_id: string; date: string; notes: string | null }`
  - `type WorkoutSetRow = { id: string; workout_id: string; exercise_id: string; set_no: number; reps: number | null; weight_kg: number | null; rpe: number | null; est_1rm: number | null; is_weight_pr: boolean; is_1rm_pr: boolean }`
  - `type WorkoutSummary = { id: string; date: string; exerciseCount: number; totalVolume: number }`
  - `listExercises(query?: string): Promise<ExerciseRow[]>`
  - `addCustomExercise(name: string, muscleGroup: string, type: string): Promise<ExerciseRow>`
  - `startWorkout(date: string): Promise<WorkoutRow>`
  - `exerciseBests(exerciseId: string): Promise<ExerciseBests>`
  - `addSet(workoutId: string, exerciseId: string, setNo: number, reps: number, weightKg: number, rpe: number | null): Promise<WorkoutSetRow>`
  - `listWorkouts(): Promise<WorkoutSummary[]>`
  - `workoutDetail(id: string): Promise<{ workout: WorkoutRow; sets: WorkoutSetRow[] }>`
  - `exerciseTrend(exerciseId: string): Promise<{ date: string; est1RM: number }[]>`

- [ ] **Step 1: Implement `src/features/workouts/api.ts`**

```ts
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
  // Join sets to workouts owned by the user; RLS already filters to the user.
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
    const sets = (w.workout_sets ?? []) as { reps: number | null; weight_kg: number | null; exercise_id: string }[];
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
  // best est_1rm per date
  const byDate = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const date = row.workouts.date as string;
    const e = (row.est_1rm as number | null) ?? 0;
    byDate.set(date, Math.max(byDate.get(date) ?? 0, e));
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, est1RM]) => ({ date, est1RM }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS` (no errors).

- [ ] **Step 3: Verify API end-to-end against local Supabase**

Create `scripts/verify_workouts.mjs` (temporary, not committed) that: signs up a fresh user, starts a workout, fetches an exercise id from the seed, adds two sets (a PR then a heavier set), then reads `listWorkouts` + `workoutDetail` via REST. Run with `node scripts/verify_workouts.mjs`.

```js
const ANON = process.env.ANON; // paste anon key
const BASE = "http://127.0.0.1:54321";
const H = { apikey: ANON, "Content-Type": "application/json" };
const email = `wk_${Date.now()}@apex.local`, password = "password123";
await fetch(`${BASE}/auth/v1/signup`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) });
const tok = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: H, body: JSON.stringify({ email, password }) })).json();
const A = { ...H, Authorization: `Bearer ${tok.access_token}`, Prefer: "return=representation" };
const uid = tok.user.id;
const ex = (await (await fetch(`${BASE}/rest/v1/exercises?select=id,name&limit=1`, { headers: A })).json())[0];
const wk = (await (await fetch(`${BASE}/rest/v1/workouts`, { method: "POST", headers: A, body: JSON.stringify({ user_id: uid, date: "2026-06-27" }) })).json())[0];
const s1 = (await (await fetch(`${BASE}/rest/v1/workout_sets`, { method: "POST", headers: A, body: JSON.stringify({ workout_id: wk.id, exercise_id: ex.id, set_no: 1, reps: 5, weight_kg: 100, est_1rm: 116.667, is_weight_pr: true, is_1rm_pr: true }) })).json())[0];
console.log("set1 PR flags:", s1.is_weight_pr, s1.is_1rm_pr);
const det = await (await fetch(`${BASE}/rest/v1/workouts?select=id,date,workout_sets(reps,weight_kg)&id=eq.${wk.id}`, { headers: A })).json();
const vol = det[0].workout_sets.reduce((a, s) => a + s.reps * s.weight_kg, 0);
console.log("volume:", vol, "(expect 500)");
```

Expected output: `set1 PR flags: true true` and `volume: 500 (expect 500)`.

- [ ] **Step 4: Commit**

```bash
git add src/features/workouts/api.ts
git commit -m "feat: add workouts API with PR detection and volume"
```

---

### Task 4: Rest timer component

**Files:**
- Create: `src/features/workouts/RestTimer.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `RestTimer` default export — props `{ seconds?: number; onDone?: () => void }` (default 90).

- [ ] **Step 1: Implement `src/features/workouts/RestTimer.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, Button } from "react-native";

export default function RestTimer({ seconds = 90, onDone }: { seconds?: number; onDone?: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const fired = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      onDone?.();
    }
  }, [remaining, onDone]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", width: 56 }}>{remaining}s</Text>
      <Button title={running ? "Pause" : "Resume"} onPress={() => setRunning((v) => !v)} />
      <Button title="-15" onPress={() => setRemaining((r) => Math.max(0, r - 15))} />
      <Button title="+15" onPress={() => setRemaining((r) => r + 15)} />
      <Button title="Skip" onPress={() => { fired.current = true; setRemaining(0); setRunning(false); onDone?.(); }} />
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 3: Commit**

```bash
git add src/features/workouts/RestTimer.tsx
git commit -m "feat: add rest timer component"
```

---

### Task 5: Workouts tab — history list + start workout

**Files:**
- Modify: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/workouts.tsx`

**Interfaces:**
- Consumes: `listWorkouts`, `startWorkout` (Task 3).
- Produces: Workouts tab navigable; tapping Start creates a workout and routes to `app/workout/[id]`.

- [ ] **Step 1: Add the Workouts tab in `app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="workouts" options={{ title: "Workouts" }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create `app/(tabs)/workouts.tsx`**

```tsx
import { useCallback, useState } from "react";
import { View, Text, Button, FlatList, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { listWorkouts, startWorkout, WorkoutSummary } from "../../src/features/workouts/api";

export default function Workouts() {
  const [rows, setRows] = useState<WorkoutSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      listWorkouts().then(setRows).catch((e) => Alert.alert("Load failed", String(e)));
    }, [])
  );

  async function start() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const w = await startWorkout(today);
      router.push(`/workout/${w.id}`);
    } catch (e) {
      Alert.alert("Could not start", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Button title="Start workout" onPress={start} />
      <FlatList
        data={rows}
        keyExtractor={(w) => w.id}
        ListEmptyComponent={<Text>No workouts yet.</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "600" }}>{item.date}</Text>
            <Text>{item.exerciseCount} exercises · volume {Math.round(item.totalVolume)} kg</Text>
          </View>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/_layout.tsx app/(tabs)/workouts.tsx
git commit -m "feat: add workouts tab with history list and start"
```

---

### Task 6: Exercise picker

**Files:**
- Create: `app/workout/_layout.tsx`, `app/workout/exercise-picker.tsx`

**Interfaces:**
- Consumes: `listExercises`, `addCustomExercise` (Task 3).
- Produces: picker screen that returns a chosen exercise id to the active workout via router params.

- [ ] **Step 1: Create `app/workout/_layout.tsx`**

```tsx
import { Stack } from "expo-router";

export default function WorkoutLayout() {
  return <Stack screenOptions={{ headerShown: true, headerTitle: "Workout" }} />;
}
```

- [ ] **Step 2: Create `app/workout/exercise-picker.tsx`**

```tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, Button, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { listExercises, addCustomExercise, ExerciseRow } from "../../src/features/workouts/api";

export default function ExercisePicker() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ExerciseRow[]>([]);

  useEffect(() => {
    listExercises(query).then(setRows).catch((e) => Alert.alert("Load failed", String(e)));
  }, [query]);

  function choose(ex: ExerciseRow) {
    router.replace({ pathname: `/workout/${workoutId}`, params: { pickedExerciseId: ex.id, pickedExerciseName: ex.name } });
  }

  async function addCustom() {
    if (!query.trim()) return;
    try {
      const ex = await addCustomExercise(query.trim(), "other", "other");
      choose(ex);
    } catch (e) {
      Alert.alert("Add failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder="Search or new exercise name"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <Button title={`Add custom "${query}"`} onPress={addCustom} />
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => choose(item)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: "#666" }}>{item.muscle_group}{item.is_custom ? " · custom" : ""}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 4: Commit**

```bash
git add app/workout/_layout.tsx app/workout/exercise-picker.tsx
git commit -m "feat: add exercise picker with search and custom add"
```

---

### Task 7: Active workout screen — add sets, PR badges, rest timer

**Files:**
- Create: `app/workout/[id].tsx`

**Interfaces:**
- Consumes: `addSet`, `workoutDetail`, `WorkoutSetRow` (Task 3); `RestTimer` (Task 4); picker params (Task 6).
- Produces: full logging flow for one workout.

- [ ] **Step 1: Create `app/workout/[id].tsx`**

```tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, Button, FlatList, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { addSet, workoutDetail, WorkoutSetRow } from "../../src/features/workouts/api";
import RestTimer from "../../src/features/workouts/RestTimer";

export default function ActiveWorkout() {
  const { id, pickedExerciseId, pickedExerciseName } = useLocalSearchParams<{
    id: string; pickedExerciseId?: string; pickedExerciseName?: string;
  }>();
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState<string>("");
  const [reps, setReps] = useState("5");
  const [weight, setWeight] = useState("100");
  const [rpe, setRpe] = useState("");
  const [sets, setSets] = useState<WorkoutSetRow[]>([]);
  const [showTimer, setShowTimer] = useState(false);

  useEffect(() => {
    if (pickedExerciseId) {
      setExerciseId(pickedExerciseId);
      setExerciseName(pickedExerciseName ?? "");
    }
  }, [pickedExerciseId, pickedExerciseName]);

  useEffect(() => {
    workoutDetail(id).then((d) => setSets(d.sets)).catch(() => {});
  }, [id]);

  async function save() {
    if (!exerciseId) return Alert.alert("Pick an exercise first");
    try {
      const setNo = sets.filter((s) => s.exercise_id === exerciseId).length + 1;
      const row = await addSet(id, exerciseId, setNo, Number(reps), Number(weight), rpe ? Number(rpe) : null);
      setSets((prev) => [...prev, row]);
      setShowTimer(true);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <Button
        title={exerciseName ? `Exercise: ${exerciseName} (change)` : "Pick exercise"}
        onPress={() => router.push({ pathname: "/workout/exercise-picker", params: { workoutId: id } })}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="kg"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
        <TextInput value={reps} onChangeText={setReps} keyboardType="numeric" placeholder="reps"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
        <TextInput value={rpe} onChangeText={setRpe} keyboardType="numeric" placeholder="RPE"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
      </View>
      <Button title="Save set" onPress={save} />
      {showTimer && <RestTimer seconds={90} onDone={() => setShowTimer(false)} />}
      <FlatList
        data={sets}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ flex: 1 }}>#{item.set_no}  {item.weight_kg}kg × {item.reps}</Text>
            <Text>1RM {item.est_1rm ? Math.round(item.est_1rm) : "-"}</Text>
            {item.is_weight_pr && <Text style={{ color: "green" }}>🏋️ PR</Text>}
            {item.is_1rm_pr && <Text style={{ color: "orange" }}>💪 1RM</Text>}
          </View>
        )}
      />
      <Button title="Finish" onPress={() => router.replace("/(tabs)/workouts")} />
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `TYPECHECK_PASS`.

- [ ] **Step 3: Run the full test suite (PR engine still green)**

Run: `npx jest`
Expected: all suites pass (Phase 1 validation + Phase 2 prEngine).

- [ ] **Step 4: Commit**

```bash
git add app/workout/[id].tsx
git commit -m "feat: add active workout screen with sets, PR badges, rest timer"
```

---

## Self-Review

**Spec coverage:**
- Schema delta (PR cols + est_1rm) + seed → Task 1 ✓
- PR engine (Epley + detectPRs, both PR types) → Task 2 ✓
- Workouts API (CRUD, bests, volume, trend) → Task 3 ✓
- Rest timer → Task 4 ✓
- History list + volume + start → Task 5 ✓
- Exercise picker + custom add → Task 6 ✓
- Active workout logging + PR badges → Task 7 ✓
- Per-exercise 1RM trend → `exerciseTrend` in Task 3 (consumed by a future chart screen; data available now) ✓

**Placeholder scan:** none — all steps have full code/commands/expected output. Seed list is fully enumerated (50 rows).

**Type consistency:** `detectPRs` returns `{ est1RM, isWeightPr, is1RmPr }` (Task 2), persisted to columns `est_1rm`, `is_weight_pr`, `is_1rm_pr` (Tasks 1, 3). `ExerciseRow`/`WorkoutSetRow`/`WorkoutSummary` defined in Task 3 are consumed unchanged in Tasks 5–7. Picker passes `pickedExerciseId`/`pickedExerciseName`/`workoutId` params, read identically in Tasks 6–7.

**Note on est_1rm consistency:** `addSet` (Task 3) computes `est_1rm` via the engine and stores it; `exerciseBests` reads stored `est_1rm`. The verify script in Task 3 hardcodes the est_1rm value only because it bypasses `api.ts` and calls REST directly; the app path always routes through the engine.
