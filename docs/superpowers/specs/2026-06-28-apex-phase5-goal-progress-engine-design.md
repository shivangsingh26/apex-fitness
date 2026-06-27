# Apex — Phase 5: Goal + Progress Engine — Design

**Date:** 2026-06-28
**Status:** Approved design. Feeds writing-plans next.
**Master design:** `docs/superpowers/specs/2026-06-26-apex-fitness-design.md` (Phase 5, §6).

---

## 1. Goal

The deterministic brain of Apex: turn the user's stats + goal + weigh-ins into daily calorie
and protein targets, a numeric "% to goal", on-pace status, and a projected finish date.
Plus the tracking UI (weigh-ins, measurements, progress photos, manual steps) and a numeric
dashboard. Reuses Phase 1 tables `goals`, `body_logs`, `progress_photos`, `daily_steps`.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| BMR | Mifflin-St Jeor. male `10·kg + 6.25·cm − 5·age + 5`; female same `− 161` |
| Activity factor | sedentary 1.2 / light 1.375 / moderate 1.55 / active 1.725 / very_active 1.9 |
| Steps | Manual entry; TDEE adds `steps × 0.04` kcal. Real HealthKit auto-read deferred to a later sub-phase |
| TDEE | `BMR × activity + stepsKcal` |
| Deficit | `(startWeight − targetWeight) × 7700 kcal`, spread evenly over days-to-target |
| Calorie target | `TDEE − dailyDeficit`, floored at `max(BMR, 1200)` (never below) |
| Protein target | `2.0 g × current bodyweight (kg)` |
| % to goal | `(start − current) / (start − target) × 100`, clamped 0–100 |
| Smoothing | 7-day moving average of weigh-ins for current weight / pace |
| On-pace | compare moving-average weight to expected weight today; report kg ahead/behind |
| Recompute | on each new weigh-in: recompute TDEE+targets with new weight, persist to `goals` |
| Measurements | weight required; waist/chest/arm/hip/thigh optional, one form |
| Units | metric (kg, cm) |
| Testing | engine fully unit-tested (ts-jest); api/dashboard verified vs local Supabase REST |

---

## 3. Pure engine — TDD (the brain)

File: `src/features/goal/engine.ts`

```
type Sex = "male" | "female"
type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active"

bmrMifflin(sex, weightKg, heightCm, age): number
activityFactor(a: Activity): number
tdee(bmr, activity, steps): number              // bmr*factor + steps*0.04

dailyTargets(input: {
  sex; weightKg; heightCm; age; activity; steps;
  startWeightKg; targetWeightKg; targetDate; today;
}): { calorieTarget: number; proteinTarget: number; tdee: number; dailyDeficit: number }
  // deficit = (start-target)*7700 / daysToTarget (>=1)
  // calorieTarget = max(tdee - deficit, max(bmr, 1200))
  // proteinTarget = 2.0 * weightKg

movingAverage(weights: number[], window = 7): number   // mean of last <=window values
progressPercent(start, current, target): number        // clamped 0..100
expectedWeight(start, target, targetDate, startDate, today): number  // linear
onPace(currentAvg, expected): { kg: number; status: "ahead" | "on" | "behind" }
  // diff = currentAvg - expected; behind if diff > 0.2, ahead if < -0.2, else on
projectedFinish(start, currentAvg, target, startDate, today): string | null
  // from actual rate; null if no progress yet
```

Deterministic, no I/O. Fully unit-tested.

---

## 4. Progress API

File: `src/features/progress/api.ts`

```
type BodyLogRow = { id; date; weight_kg; bf_pct; waist_cm; chest_cm; arm_cm; hip_cm; thigh_cm }
type GoalSnapshot = { startWeightKg; targetWeightKg; targetBfPct; targetDate;
                      calorieTarget; proteinTarget }
type DashboardData = {
  goal: GoalSnapshot | null;
  currentWeight: number | null; progressPct: number | null;
  daysLeft: number | null; kgToGo: number | null;
  pace: { kg: number; status: string } | null;
  calorieTarget: number | null; proteinTarget: number | null;
}

logBody(date, fields: { weightKg?; bfPct?; waist?; chest?; arm?; hip?; thigh? }): Promise<BodyLogRow>
logSteps(date, steps): Promise<void>                      // upsert daily_steps
uploadProgressPhoto(localUri): Promise<string>            // progress-photos bucket
logProgressPhoto(date, path): Promise<void>               // progress_photos row
recomputeTargets(): Promise<void>                         // reads profile+goal+latest weight, writes goals targets
getDashboard(): Promise<DashboardData>                    // assembles via engine
weightSeries(): Promise<{ date: string; weight: number }[]>
```

`logBody` (when weight present) calls `recomputeTargets()`. `recomputeTargets` pulls
`users` (sex/birthdate/height/activity), latest `goals` row, recent `body_logs` (moving avg),
today's `daily_steps`, runs `dailyTargets`, updates the `goals` row's targets.

---

## 5. Screens

- `app/(tabs)/dashboard.tsx` (replace placeholder) — numeric readout:
  "Day X/Y · down A of B kg → P% · on pace ✅ / ⚠️ behind Δkg · today ≤K kcal, ≥G g protein ·
  projected finish: date". Reads `getDashboard()`.
- `app/progress/_layout.tsx` — stack.
- `app/progress/log.tsx` — weight (required) + measurements (optional) + steps; save → recompute.
- `app/progress/photo.tsx` — capture/pick progress photo (expo-image-picker/manipulator) → upload + row.
- `app/progress/history.tsx` — weight trend (simple sparkline/list) + measurement history.
- Dashboard has buttons routing to progress log/photo/history.

---

## 6. Storage / schema delta (migration `0005_progress_photos.sql`)

Mirror Phase 4's bucket pattern for progress photos:

```sql
insert into storage.buckets (id, name, public)
values ('progress-photos','progress-photos', false) on conflict (id) do nothing;

create policy "progress-photos read own" on storage.objects for select to authenticated
  using (bucket_id='progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress-photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id='progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress-photos delete own" on storage.objects for delete to authenticated
  using (bucket_id='progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

`goals.daily_calorie_target` / `daily_protein_target` and all `body_logs` columns already exist.

---

## 7. Testing

- `engine.test.ts`: BMR (male+female known values), activityFactor, tdee with/without steps,
  dailyTargets (normal + floor case where deficit would drop below max(bmr,1200)), protein,
  progressPercent (clamped both ends), movingAverage (<window and >window), expectedWeight,
  onPace (ahead/on/behind), projectedFinish (progress + no-progress null).
- api/dashboard: verify script vs local Supabase — set profile+goal, insert weigh-in,
  call recompute (or replicate), confirm `goals` targets populated and dashboard math matches
  engine; RLS isolation on body_logs + progress-photos. Device walkthrough is the user's.

---

## 8. Out of scope

Real Apple HealthKit auto step read (deferred sub-phase, needs custom dev build),
charts library, AI coach narration (Phase 6), photo-based body-fat estimation,
adaptive deficit algorithms. Keep Phase 5 to engine + tracking + numeric dashboard.
