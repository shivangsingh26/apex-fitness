# Apex — Phase 2: Workout Logger — Design

**Date:** 2026-06-27
**Status:** Approved design. Feeds writing-plans next.
**Master design:** `docs/superpowers/specs/2026-06-26-apex-fitness-design.md` (Phase 2).

---

## 1. Goal

Log gym workouts: start a session, pick exercises, record sets (reps / weight / RPE),
auto-detect personal records, run a rest timer between sets, and review history with
per-exercise strength trend and per-workout volume.

Builds on Phase 1 (Expo + expo-router, Supabase, auth, RLS). Tables `exercises`,
`workouts`, `workout_sets` already exist from Phase 1's `0001_init.sql`.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| PR rule | Both: heaviest weight **and** best estimated 1RM (Epley) per exercise |
| 1RM formula | Epley: `weight × (1 + reps/30)` |
| Exercise library | ~50 curated common exercises seeded; custom add supported |
| Rest timer | Included. In-app countdown, default 90s, adjustable. No background/push (Phase 6) |
| History volume | Show per-workout total volume = Σ(reps × weight); plus per-exercise est-1RM trend |
| Testing | PR engine fully unit-tested (ts-jest); API/screens verified vs local Supabase REST |
| Units | Metric (kg), consistent with Phase 1 |

---

## 3. Schema delta (one migration: `0002_workout_logger.sql`)

`workout_sets` currently has a single `is_pr boolean`. Replace with explicit PR flags
and a stored est-1RM (so history trend reads without recomputation):

```sql
alter table public.workout_sets drop column is_pr;
alter table public.workout_sets add column is_weight_pr boolean not null default false;
alter table public.workout_sets add column is_1rm_pr boolean not null default false;
alter table public.workout_sets add column est_1rm numeric;
```

Seed curated exercises (idempotent) — `is_custom=false`, `owner_id=null` so they are
the shared library (readable by all per existing `"exercises read"` RLS policy):

```sql
insert into public.exercises (name, muscle_group, type, is_custom)
values ('Barbell Bench Press','chest','barbell',false), ... ~50 rows ...
on conflict do nothing;
```

No new RLS needed — existing policies on `workouts`/`workout_sets`/`exercises` cover it.

---

## 4. PR engine — pure logic (TDD, the testable brain)

File: `src/features/workouts/prEngine.ts`

```
epley1RM(weightKg: number, reps: number): number
  → weightKg * (1 + reps / 30); reps<=0 or weight<=0 → 0

type SetInput = { weightKg: number; reps: number }
type ExerciseBests = { bestWeightKg: number; best1RM: number }   // prior bests, 0 if none

detectPRs(set: SetInput, bests: ExerciseBests):
  { est1RM: number; isWeightPr: boolean; is1RmPr: boolean }
  - est1RM = epley1RM(set.weightKg, set.reps)
  - isWeightPr = set.weightKg > bests.bestWeightKg
  - is1RmPr   = est1RM > bests.best1RM
```

Deterministic, no I/O. UI/API call it and persist the returned flags. Fully unit-tested.

---

## 5. Modules / files

```
src/features/workouts/
  prEngine.ts              # Epley + PR detection (TESTED)
  prEngine.test.ts
  api.ts                   # CRUD against Supabase
app/(tabs)/
  workouts.tsx             # workout history list + "Start workout"
app/workout/
  _layout.tsx              # stack
  [id].tsx                 # active workout: exercises + sets, PR badges, rest timer
  exercise-picker.tsx      # search library + add custom
src/features/workouts/
  RestTimer.tsx            # countdown component
```

API surface (`api.ts`):

```
listExercises(query?: string): Promise<ExerciseRow[]>
addCustomExercise(name, muscleGroup, type): Promise<ExerciseRow>
startWorkout(date): Promise<WorkoutRow>
addSet(workoutId, exerciseId, setNo, reps, weightKg, rpe):
  Promise<WorkoutSetRow>   // computes est_1rm + PR flags via prEngine before insert
exerciseBests(exerciseId): Promise<ExerciseBests>   // max weight + max est_1rm to date
listWorkouts(): Promise<WorkoutSummary[]>            // date, exercise count, total volume
workoutDetail(id): Promise<{ workout, sets }>
exerciseTrend(exerciseId): Promise<{ date, est1RM }[]>
```

---

## 6. Logging flow

1. Tap **Start workout** → `startWorkout(today)` → navigate to `app/workout/[id]`.
2. **Add exercise** → exercise-picker (search seed library or add custom).
3. For each set: enter reps / weight / RPE → **Save set**:
   - `exerciseBests(exerciseId)` fetched (cached per exercise during session)
   - `detectPRs` computes est_1rm + flags
   - `addSet` inserts row with flags; PR badge shown if either flag true
   - rest timer auto-starts (default 90s; skip/adjust)
4. Finish → back to workouts list.

---

## 7. Rest timer

`RestTimer.tsx`: local-state countdown (setInterval), props `seconds` + `onDone`.
Controls: start/pause/skip, +15s/−15s. No notifications/background (Phase 6).

---

## 8. History

- `app/(tabs)/workouts.tsx`: list workouts (date, # exercises, total volume Σ reps×weight).
- Workout detail: sets grouped by exercise, PR badges.
- Per-exercise trend: est-1RM over time as a simple list/sparkline (full charts later phase).

---

## 9. Testing

- `prEngine.test.ts`: Epley values, weight-PR boundary, 1RM-PR boundary, no-history case,
  zero/negative guards. Full unit coverage via ts-jest (Phase 1 setup).
- API + screens: verified against running local Supabase via REST as an authed user
  (same approach as Phase 1) — insert workout/sets, confirm PR flags + volume readback,
  confirm RLS isolation holds. Device UI walkthrough is the user's.

---

## 10. Out of scope (later phases)

Charts library, supersets/circuits, workout templates/routines, background rest-timer
notifications, Apple Health workout write-back. Keep Phase 2 to log + PR + history.
