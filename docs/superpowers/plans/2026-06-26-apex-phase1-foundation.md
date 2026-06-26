# Apex — Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Apex app skeleton — Expo app, Supabase backend, full database schema with row-level security, email auth, and an onboarding wizard that captures user stats and goal, ending at a dashboard placeholder.

**Architecture:** React Native (Expo Router) app talks to Supabase over HTTPS with a JWT session. Postgres holds all data with RLS isolating rows by `user_id`. Pure business logic (validation, derived values) lives in plain TypeScript modules that are unit-tested; screens are thin wrappers over those modules and the Supabase client.

**Tech Stack:** Expo (SDK 54+), TypeScript, expo-router, Supabase (Postgres, Auth, JS client `@supabase/supabase-js`), Jest (`jest-expo` preset) for unit tests, Supabase CLI for local DB + migrations.

## Global Constraints

- App name: **Apex**.
- Language: TypeScript everywhere; `strict` mode on.
- Units: metric (kg, cm) stored in DB; `users.units` column allows display conversion later.
- Multi-user from day one: every user-owned table has `user_id uuid` and an RLS policy; never disable RLS.
- Secrets: no third-party vendor key (Anthropic, etc.) ships in the app. Phase 1 has none yet; keep the rule.
- Supabase keys: only the `anon` public key and project URL go in the app via `EXPO_PUBLIC_` env vars. Service-role key never touches the app.
- Online-only: no offline/local-DB layer in Phase 1.
- Pure logic (validation, date math) is unit-tested with Jest; screens are not unit-tested in Phase 1.

---

## File Structure

```
/ (repo root)
  app/                              # expo-router routes
    _layout.tsx                     # root layout + auth session provider
    index.tsx                       # entry redirect (auth/onboarding/dashboard)
    (auth)/sign-in.tsx              # email sign-in / sign-up
    (onboarding)/_layout.tsx        # onboarding stack
    (onboarding)/profile.tsx        # capture stats
    (onboarding)/goal.tsx           # capture goal + target date
    (tabs)/_layout.tsx              # tab navigator
    (tabs)/dashboard.tsx            # placeholder dashboard
  src/
    lib/supabase.ts                 # Supabase client singleton
    lib/session.tsx                 # auth session context/hook
    features/profile/validation.ts  # pure validation + helpers (TESTED)
    features/profile/validation.test.ts
    features/profile/api.ts         # read/write profile + goal to Supabase
  supabase/
    migrations/0001_init.sql        # tables + RLS
    migrations/0002_rls_check.sql   # (no-op marker; RLS lives in 0001)
  app.json                          # expo config
  package.json
  tsconfig.json
  jest.config.js
  .env.local                        # EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (gitignored)
```

---

### Task 1: Scaffold Expo + TypeScript + router + folders

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/dashboard.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a booting Expo Router app with a `dashboard` route.

- [ ] **Step 1: Create the Expo app (TypeScript, expo-router template)**

```bash
npx create-expo-app@latest . --template blank-typescript
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

- [ ] **Step 2: Set entry + scheme in `app.json`**

In `app.json`, inside `expo`, ensure:

```json
{
  "expo": {
    "name": "Apex",
    "slug": "apex",
    "scheme": "apex",
    "newArchEnabled": true,
    "plugins": ["expo-router"]
  }
}
```

Set `"main": "expo-router/entry"` in `package.json`.

- [ ] **Step 3: Create root layout `app/_layout.tsx`**

```tsx
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: Create entry redirect `app/index.tsx` (temporary — always dashboard)**

```tsx
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/(tabs)/dashboard" />;
}
```

- [ ] **Step 5: Create tabs layout `app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: true }} />;
}
```

- [ ] **Step 6: Create `app/(tabs)/dashboard.tsx`**

```tsx
import { View, Text } from "react-native";

export default function Dashboard() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Apex</Text>
    </View>
  );
}
```

- [ ] **Step 7: Verify it boots**

Run: `npx expo start` (then press `w` for web, or scan with Expo Go).
Expected: app loads and shows "Apex" on the dashboard screen, no red error.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Expo app with router and dashboard placeholder"
```

---

### Task 2: Supabase project, local dev, client + env

**Files:**
- Create: `supabase/` (via CLI), `src/lib/supabase.ts`, `.env.local`, modify `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `supabase` client exported from `src/lib/supabase.ts` (type `SupabaseClient`).

- [ ] **Step 1: Install Supabase deps**

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
npm install -D supabase
```

- [ ] **Step 2: Init local Supabase**

```bash
npx supabase init
npx supabase start
```

Expected: prints local `API URL` (e.g. `http://127.0.0.1:54321`) and an `anon key`.

- [ ] **Step 3: Put keys in `.env.local`**

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
```

Add `.env.local` and `supabase/.temp` to `.gitignore`.

- [ ] **Step 4: Create the client `src/lib/supabase.ts`**

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 5: Verify client imports without crashing**

Add a temporary log in `app/(tabs)/dashboard.tsx`: `import { supabase } from "../../src/lib/supabase"; console.log("supabase ready", !!supabase);`
Run: `npx expo start`. Expected: log prints `supabase ready true`, no crash. Remove the temp log after.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client and local dev config"
```

---

### Task 3: Database schema migration (all core tables)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Consumes: a running local Supabase (Task 2).
- Produces: tables `users, goals, body_logs, progress_photos, exercises, workouts, workout_sets, foods, food_logs, daily_steps, water_logs, sleep_logs, supplements, supplement_logs`.

- [ ] **Step 1: Write the migration `supabase/migrations/0001_init.sql`**

```sql
-- USERS profile (1:1 with auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  sex text check (sex in ('male','female')),
  birthdate date,
  height_cm numeric,
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  units text not null default 'metric',
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null default 'lean_athletic',
  start_weight_kg numeric,
  target_weight_kg numeric,
  target_bf_pct numeric,
  target_date date,
  daily_calorie_target numeric,
  daily_protein_target numeric,
  created_at timestamptz not null default now()
);

create table public.body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  weight_kg numeric,
  bf_pct numeric,
  waist_cm numeric,
  chest_cm numeric,
  arm_cm numeric,
  hip_cm numeric,
  thigh_cm numeric,
  notes text
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  storage_path text not null,
  ai_bf_estimate numeric
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  type text,
  is_custom boolean not null default false,
  owner_id uuid references public.users(id) on delete cascade
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  notes text
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  set_no int not null,
  reps int,
  weight_kg numeric,
  rpe numeric,
  is_pr boolean not null default false
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  source text,
  barcode text,
  name text not null,
  brand text,
  kcal numeric,
  protein_g numeric,
  carb_g numeric,
  fat_g numeric,
  fiber_g numeric,
  serving_desc text,
  serving_g numeric
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  meal text,
  food_id uuid references public.foods(id),
  qty numeric,
  kcal numeric,
  protein_g numeric,
  carb_g numeric,
  fat_g numeric,
  fiber_g numeric,
  scan_method text,
  photo_path text
);

create table public.daily_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  steps int,
  source text,
  unique (user_id, date)
);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  ml int not null
);

create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  hours numeric,
  quality int check (quality between 1 and 5),
  unique (user_id, date)
);

create table public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  default_dose numeric,
  unit text,
  schedule text
);

create table public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  supplement_id uuid references public.supplements(id) on delete cascade,
  date date not null,
  dose numeric,
  taken_at timestamptz not null default now()
);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up`
Expected: "Applying migration 0001_init.sql..." then success, no errors.

- [ ] **Step 3: Verify tables exist**

Run: `npx supabase db diff` (expects no diff after up) and check Studio at `http://127.0.0.1:54323` → Tables shows all 14 tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add core database schema migration"
```

---

### Task 4: Row-level security policies + verification test

**Files:**
- Modify: `supabase/migrations/0001_init.sql` (append RLS block)
- Create: `supabase/migrations/0003_rls_test.sql` (pgTAP test)

**Interfaces:**
- Consumes: tables from Task 3.
- Produces: RLS enabled; each user-owned table readable/writable only by its owner.

- [ ] **Step 1: Write the failing RLS test `supabase/migrations/0003_rls_test.sql`**

Note: run this as a script (not a migration) to assert isolation. It impersonates a user and asserts they cannot see another user's rows.

```sql
-- Run with: psql "$DB_URL" -f supabase/migrations/0003_rls_test.sql
-- Seed two auth users + profiles + a body_log each, then check isolation.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','a@test.com'),
  ('00000000-0000-0000-0000-0000000000b2','b@test.com');
insert into public.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','a@test.com'),
  ('00000000-0000-0000-0000-0000000000b2','b@test.com');
insert into public.body_logs (user_id, date, weight_kg) values
  ('00000000-0000-0000-0000-0000000000a1', current_date, 80),
  ('00000000-0000-0000-0000-0000000000b2', current_date, 90);

-- Impersonate user A via JWT claim.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

do $$
declare cnt int;
begin
  select count(*) into cnt from public.body_logs;
  if cnt <> 1 then
    raise exception 'RLS FAIL: user A sees % body_logs, expected 1', cnt;
  end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the test — expect FAIL (RLS not enabled yet)**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/0003_rls_test.sql`
Expected: raises `RLS FAIL: user A sees 2 body_logs, expected 1` (because RLS is off, user sees all rows).

- [ ] **Step 3: Append RLS policies to `supabase/migrations/0001_init.sql`**

```sql
-- Enable RLS on all user-owned tables
alter table public.users enable row level security;
alter table public.goals enable row level security;
alter table public.body_logs enable row level security;
alter table public.progress_photos enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_sets enable row level security;
alter table public.food_logs enable row level security;
alter table public.daily_steps enable row level security;
alter table public.water_logs enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.supplements enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.exercises enable row level security;
alter table public.foods enable row level security;

-- users: a row is its own owner (id == auth.uid())
create policy "users self" on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

-- helper macro pattern: owner via user_id
create policy "goals owner" on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "body_logs owner" on public.body_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "progress_photos owner" on public.progress_photos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workouts owner" on public.workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "food_logs owner" on public.food_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "daily_steps owner" on public.daily_steps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "water_logs owner" on public.water_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sleep_logs owner" on public.sleep_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "supplements owner" on public.supplements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "supplement_logs owner" on public.supplement_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- workout_sets: ownership via parent workout
create policy "workout_sets owner" on public.workout_sets
  for all using (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())
  );

-- exercises: shared library readable by all; custom rows owned by creator
create policy "exercises read" on public.exercises for select using (true);
create policy "exercises write own" on public.exercises
  for insert with check (owner_id = auth.uid());
create policy "exercises update own" on public.exercises
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "exercises delete own" on public.exercises
  for delete using (owner_id = auth.uid());

-- foods: shared reference DB readable by all; inserts allowed for authenticated
create policy "foods read" on public.foods for select using (true);
create policy "foods insert" on public.foods for insert to authenticated with check (true);
```

- [ ] **Step 4: Reset DB so the amended migration applies cleanly**

Run: `npx supabase db reset`
Expected: re-applies `0001_init.sql` with RLS, no errors.

- [ ] **Step 5: Run the RLS test again — expect PASS**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/0003_rls_test.sql`
Expected: no exception; transaction rolls back cleanly (exit code 0).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_init.sql supabase/migrations/0003_rls_test.sql
git commit -m "feat: add row-level security policies with isolation test"
```

---

### Task 5: Profile validation + helpers (pure logic, TDD)

**Files:**
- Create: `src/features/profile/validation.ts`, `src/features/profile/validation.test.ts`
- Create: `jest.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ageFromBirthdate(birthdate: string, today?: Date): number`
  - `type ProfileInput = { sex: string; birthdate: string; heightCm: number; activityLevel: string }`
  - `validateProfile(input: ProfileInput): string[]` (returns array of error messages; empty = valid)
  - `type GoalInput = { startWeightKg: number; targetWeightKg: number; targetBfPct: number; targetDate: string }`
  - `validateGoal(input: GoalInput, today?: Date): string[]`

- [ ] **Step 1: Add Jest config `jest.config.js`**

```js
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
```

Install: `npm install -D jest jest-expo @types/jest`. Add to `package.json` scripts: `"test": "jest"`.

- [ ] **Step 2: Write failing tests `src/features/profile/validation.test.ts`**

```ts
import { ageFromBirthdate, validateProfile, validateGoal } from "./validation";

describe("ageFromBirthdate", () => {
  it("computes age before birthday this year", () => {
    expect(ageFromBirthdate("1995-12-31", new Date("2026-06-26"))).toBe(30);
  });
  it("computes age after birthday this year", () => {
    expect(ageFromBirthdate("1995-01-01", new Date("2026-06-26"))).toBe(31);
  });
});

describe("validateProfile", () => {
  const ok = { sex: "male", birthdate: "1995-01-01", heightCm: 178, activityLevel: "moderate" };
  it("accepts a valid profile", () => {
    expect(validateProfile(ok)).toEqual([]);
  });
  it("rejects bad sex", () => {
    expect(validateProfile({ ...ok, sex: "x" })).toContain("Sex must be male or female");
  });
  it("rejects impossible height", () => {
    expect(validateProfile({ ...ok, heightCm: 10 })).toContain("Height must be between 100 and 250 cm");
  });
});

describe("validateGoal", () => {
  const ok = { startWeightKg: 85, targetWeightKg: 75, targetBfPct: 12, targetDate: "2026-12-01" };
  it("accepts a valid goal", () => {
    expect(validateGoal(ok, new Date("2026-06-26"))).toEqual([]);
  });
  it("rejects a target date in the past", () => {
    expect(validateGoal({ ...ok, targetDate: "2026-01-01" }, new Date("2026-06-26")))
      .toContain("Target date must be in the future");
  });
  it("rejects target heavier than start for a lean goal", () => {
    expect(validateGoal({ ...ok, targetWeightKg: 95 }, new Date("2026-06-26")))
      .toContain("Target weight must be below start weight");
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test`
Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 4: Implement `src/features/profile/validation.ts`**

```ts
export function ageFromBirthdate(birthdate: string, today: Date = new Date()): number {
  const b = new Date(birthdate);
  let age = today.getFullYear() - b.getFullYear();
  const monthDiff = today.getMonth() - b.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export type ProfileInput = {
  sex: string;
  birthdate: string;
  heightCm: number;
  activityLevel: string;
};

const ACTIVITY = ["sedentary", "light", "moderate", "active", "very_active"];

export function validateProfile(input: ProfileInput): string[] {
  const errors: string[] = [];
  if (input.sex !== "male" && input.sex !== "female") errors.push("Sex must be male or female");
  const age = ageFromBirthdate(input.birthdate);
  if (Number.isNaN(age) || age < 13 || age > 100) errors.push("Age must be between 13 and 100");
  if (!(input.heightCm >= 100 && input.heightCm <= 250)) errors.push("Height must be between 100 and 250 cm");
  if (!ACTIVITY.includes(input.activityLevel)) errors.push("Activity level is invalid");
  return errors;
}

export type GoalInput = {
  startWeightKg: number;
  targetWeightKg: number;
  targetBfPct: number;
  targetDate: string;
};

export function validateGoal(input: GoalInput, today: Date = new Date()): string[] {
  const errors: string[] = [];
  if (!(input.startWeightKg > 0)) errors.push("Start weight must be positive");
  if (!(input.targetWeightKg > 0)) errors.push("Target weight must be positive");
  if (input.targetWeightKg >= input.startWeightKg) errors.push("Target weight must be below start weight");
  if (!(input.targetBfPct >= 3 && input.targetBfPct <= 50)) errors.push("Target body-fat % must be between 3 and 50");
  if (new Date(input.targetDate) <= today) errors.push("Target date must be in the future");
  return errors;
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/profile/validation.ts src/features/profile/validation.test.ts jest.config.js package.json
git commit -m "feat: add tested profile and goal validation"
```

---

### Task 6: Auth session + sign-in screen + auth gate

**Files:**
- Create: `src/lib/session.tsx`, `app/(auth)/sign-in.tsx`
- Modify: `app/_layout.tsx`, `app/index.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2).
- Produces: `useSession(): { session: Session | null; loading: boolean }` and `SessionProvider`.

- [ ] **Step 1: Create session context `src/lib/session.tsx`**

```tsx
import { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Ctx = { session: Session | null; loading: boolean };
const SessionContext = createContext<Ctx>({ session: null, loading: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
```

- [ ] **Step 2: Wrap the app in `SessionProvider` (`app/_layout.tsx`)**

```tsx
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/lib/session";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 3: Gate the entry in `app/index.tsx`**

```tsx
import { Redirect } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../src/lib/session";

export default function Index() {
  const { session, loading } = useSession();
  if (loading) return <Text>Loading…</Text>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
```

- [ ] **Step 4: Create sign-in screen `app/(auth)/sign-in.tsx`**

```tsx
import { useState } from "react";
import { View, TextInput, Button, Text, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(mode: "in" | "up") {
    const fn = mode === "in" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) return Alert.alert("Auth error", error.message);
    router.replace("/");
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Apex</Text>
      <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <Button title="Sign in" onPress={() => submit("in")} />
      <Button title="Create account" onPress={() => submit("up")} />
    </View>
  );
}
```

- [ ] **Step 5: Verify the auth gate**

Run: `npx expo start`. With no session you land on sign-in. Create an account (local Supabase auto-confirms emails by default in dev). Expected: after sign-up you are redirected and reach the dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add auth session provider, sign-in screen, and auth gate"
```

---

### Task 7: Profile API + auto-create profile row on first login

**Files:**
- Create: `src/features/profile/api.ts`
- Modify: `supabase/migrations/0001_init.sql` (append trigger to create `public.users` row on signup)

**Interfaces:**
- Consumes: `supabase`, validation types from Task 5.
- Produces:
  - `getProfile(): Promise<UserRow | null>`
  - `saveProfile(input: ProfileInput): Promise<void>`
  - `saveGoal(input: GoalInput): Promise<void>`
  - `getGoal(): Promise<GoalRow | null>`

- [ ] **Step 1: Append a signup trigger to `supabase/migrations/0001_init.sql`**

```sql
-- Auto-create a profile row when an auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Reset DB to apply the trigger**

Run: `npx supabase db reset`
Expected: applies cleanly.

- [ ] **Step 3: Implement `src/features/profile/api.ts`**

```ts
import { supabase } from "../../lib/supabase";
import { ProfileInput, GoalInput } from "./validation";

export type UserRow = {
  id: string; email: string | null; sex: string | null; birthdate: string | null;
  height_cm: number | null; activity_level: string | null; units: string;
};
export type GoalRow = {
  id: string; user_id: string; target_weight_kg: number | null;
  target_bf_pct: number | null; target_date: string | null; start_weight_kg: number | null;
};

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function getProfile(): Promise<UserRow | null> {
  const { data, error } = await supabase.from("users").select("*").maybeSingle();
  if (error) throw error;
  return data as UserRow | null;
}

export async function saveProfile(input: ProfileInput): Promise<void> {
  const id = await uid();
  const { error } = await supabase.from("users").update({
    sex: input.sex, birthdate: input.birthdate,
    height_cm: input.heightCm, activity_level: input.activityLevel,
  }).eq("id", id);
  if (error) throw error;
}

export async function getGoal(): Promise<GoalRow | null> {
  const { data, error } = await supabase.from("goals")
    .select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as GoalRow | null;
}

export async function saveGoal(input: GoalInput): Promise<void> {
  const user_id = await uid();
  const { error } = await supabase.from("goals").insert({
    user_id,
    start_weight_kg: input.startWeightKg,
    target_weight_kg: input.targetWeightKg,
    target_bf_pct: input.targetBfPct,
    target_date: input.targetDate,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Verify profile row exists for a new user**

Run: `npx expo start`, sign up a fresh user, then in Supabase Studio (`:54323`) → `users` table: a row with the new user's id and email exists (created by the trigger).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add profile/goal API and auto-create profile trigger"
```

---

### Task 8: Onboarding wizard (profile → goal) + completion routing

**Files:**
- Create: `app/(onboarding)/_layout.tsx`, `app/(onboarding)/profile.tsx`, `app/(onboarding)/goal.tsx`
- Modify: `app/index.tsx` (route to onboarding if profile incomplete)

**Interfaces:**
- Consumes: `validateProfile`, `validateGoal` (Task 5); `saveProfile`, `saveGoal`, `getProfile`, `getGoal` (Task 7).
- Produces: completed onboarding leaves a fully-filled `users` row + a `goals` row, then routes to dashboard.

- [ ] **Step 1: Onboarding layout `app/(onboarding)/_layout.tsx`**

```tsx
import { Stack } from "expo-router";
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerTitle: "Set up Apex" }} />;
}
```

- [ ] **Step 2: Profile step `app/(onboarding)/profile.tsx`**

```tsx
import { useState } from "react";
import { View, TextInput, Button, Text } from "react-native";
import { router } from "expo-router";
import { validateProfile } from "../../src/features/profile/validation";
import { saveProfile } from "../../src/features/profile/api";

export default function ProfileStep() {
  const [sex, setSex] = useState("male");
  const [birthdate, setBirthdate] = useState("1995-01-01");
  const [heightCm, setHeightCm] = useState("178");
  const [activityLevel, setActivityLevel] = useState("moderate");
  const [errors, setErrors] = useState<string[]>([]);

  async function next() {
    const input = { sex, birthdate, heightCm: Number(heightCm), activityLevel };
    const errs = validateProfile(input);
    setErrors(errs);
    if (errs.length) return;
    await saveProfile(input);
    router.push("/(onboarding)/goal");
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>About you</Text>
      <TextInput value={sex} onChangeText={setSex} placeholder="sex (male/female)"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={birthdate} onChangeText={setBirthdate} placeholder="birthdate YYYY-MM-DD"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="height cm"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={activityLevel} onChangeText={setActivityLevel} placeholder="activity level"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      {errors.map((e) => <Text key={e} style={{ color: "red" }}>{e}</Text>)}
      <Button title="Next" onPress={next} />
    </View>
  );
}
```

- [ ] **Step 3: Goal step `app/(onboarding)/goal.tsx`**

```tsx
import { useState } from "react";
import { View, TextInput, Button, Text } from "react-native";
import { router } from "expo-router";
import { validateGoal } from "../../src/features/profile/validation";
import { saveGoal } from "../../src/features/profile/api";

export default function GoalStep() {
  const [startWeightKg, setStart] = useState("85");
  const [targetWeightKg, setTarget] = useState("75");
  const [targetBfPct, setBf] = useState("12");
  const [targetDate, setDate] = useState("2026-12-01");
  const [errors, setErrors] = useState<string[]>([]);

  async function finish() {
    const input = {
      startWeightKg: Number(startWeightKg), targetWeightKg: Number(targetWeightKg),
      targetBfPct: Number(targetBfPct), targetDate,
    };
    const errs = validateGoal(input);
    setErrors(errs);
    if (errs.length) return;
    await saveGoal(input);
    router.replace("/(tabs)/dashboard");
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Your goal</Text>
      <TextInput value={startWeightKg} onChangeText={setStart} keyboardType="numeric" placeholder="start weight kg"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={targetWeightKg} onChangeText={setTarget} keyboardType="numeric" placeholder="target weight kg"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={targetBfPct} onChangeText={setBf} keyboardType="numeric" placeholder="target body-fat %"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={targetDate} onChangeText={setDate} placeholder="target date YYYY-MM-DD"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      {errors.map((e) => <Text key={e} style={{ color: "red" }}>{e}</Text>)}
      <Button title="Finish setup" onPress={finish} />
    </View>
  );
}
```

- [ ] **Step 4: Route to onboarding when profile incomplete (`app/index.tsx`)**

```tsx
import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../src/lib/session";
import { getProfile } from "../src/features/profile/api";

export default function Index() {
  const { session, loading } = useSession();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session) return;
    getProfile().then((p) => setProfileComplete(!!(p && p.sex && p.birthdate && p.height_cm)));
  }, [session]);

  if (loading) return <Text>Loading…</Text>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profileComplete === null) return <Text>Loading…</Text>;
  if (!profileComplete) return <Redirect href="/(onboarding)/profile" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
```

- [ ] **Step 5: Verify the full flow end-to-end**

Run: `npx expo start`. Sign up a fresh user → routed to onboarding profile → fill + Next → goal → Finish → dashboard. In Studio confirm the `users` row is filled and one `goals` row exists for that user.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add onboarding wizard with profile and goal capture"
```

---

## Self-Review

**Spec coverage (Phase 1 scope from master design):**
- Supabase project + local dev → Task 2 ✓
- Auth → Task 6 ✓
- Profile → Tasks 5 (validation), 7 (API), 8 (capture) ✓
- Full data model + RLS → Tasks 3, 4 ✓
- Expo skeleton + navigation → Tasks 1, 6, 8 ✓
- Onboarding wizard (stats + target date) → Task 8 ✓

Phases 2–6 (workout logger, food logger, AI vision, goal/progress engine, AI coach) are intentionally out of scope for this plan.

**Placeholder scan:** none — every code step has full code; every run step has command + expected output.

**Type consistency:** `ProfileInput`/`GoalInput` defined in Task 5 are consumed unchanged in Tasks 7 and 8. `getProfile`/`saveProfile`/`saveGoal`/`getGoal` signatures match between Task 7 (definition) and Task 8 (use). `useSession` shape matches between Task 6 definition and `app/index.tsx` use.
