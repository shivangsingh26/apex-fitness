# Apex — Fitness & Nutrition Tracker — Master Design

**Date:** 2026-06-26
**Status:** Master design (multi-phase). Each phase gets its own spec + plan + build cycle.

---

## 1. Goal

Single app to: log gym workouts, log food (incl. photo/barcode scan → calories + nutrients),
and drive the user toward a "lean, athletic physique by a target date" with numeric progress,
recommendations, and motivation.

Built for one user (the owner) now, but architected so additional users can be onboarded
later with no rewrite (Supabase Row-Level Security from day one).

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Users | One now; multi-user-ready via RLS |
| App | React Native + Expo + TypeScript (iOS + Android) |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions |
| Food scan | Hybrid: barcode → exact DB; photo → Claude vision estimate; text search → fallback; manual entry |
| Nutrition data | Open Food Facts + USDA FoodData Central |
| Vision model | Anthropic Claude with structured JSON output; cache resolved foods to cut cost |
| Goal tracking | Bodyweight + body-fat %, body measurements, progress photos, strength PRs |
| Wearables | Apple HealthKit — read steps (sharpen TDEE). iPhone only. Samsung band out (cannot reach iPhone) |
| Connectivity | Online-only (needs connection to log). Accepted risk: lost logs in no-signal gyms |
| Units | Metric (kg/cm) default, user-settable |
| Push | Expo push notifications |
| Name | **Apex** |

---

## 3. Architecture

```
[Expo App (iOS/Android)]  --HTTPS + JWT-->  [Supabase]
  - Camera (barcode + food photo)             - Auth (single user now, RLS-isolated)
  - Apple HealthKit read (steps)              - Postgres (all data, RLS on every table)
  - Charts / dashboard                        - Storage (food photos, progress photos)
  - Onboarding wizard                         - Edge Functions (hold ALL secrets)
                                                    |
                                              Edge Functions call out to:
                                                - Open Food Facts / USDA (barcode + nutrition)
                                                - Anthropic Claude vision (plate photo -> macros JSON)
```

**Hard rule:** every third-party API key (Anthropic, etc.) lives only in Edge Functions.
The phone never holds a secret. The app calls our Edge Functions; functions call vendors.

---

## 4. Modules

Each module is isolated, has a clear interface, and is testable on its own.

1. **Auth / Profile** — login; user stats (sex, birthdate, height, activity level); target date.
2. **Workout logger** — exercise library; log sets (reps, weight); rest timer; PR detection; history.
3. **Food logger** — barcode scan, photo scan, text search, manual entry; daily meal diary.
4. **Nutrition engine** — sum calories + macros (protein/carb/fat/fiber) per day vs targets.
5. **Goal engine** — deterministic math: TDEE, targets, projection, % to goal (see §6).
6. **Progress tracking** — weigh-ins, measurements, progress-photo timeline, strength trend.
7. **Dashboard** — numeric readout: % to goal, days left, on-track/behind, streaks.
8. **AI coach** — recommendations + motivation phrased in numbers; delivered via push.
9. **Health sync** — read steps from Apple HealthKit, feed into TDEE.
10. **Habits** — water intake, sleep hours/quality, supplement/creatine adherence; streaks feed the coach.

---

## 5. Data model (core tables)

All user-owned rows carry `user_id`; RLS restricts rows to their owner.

```
users(id, email, sex, birthdate, height_cm, activity_level, units, created_at)

goals(id, user_id, type, start_weight_kg, target_weight_kg, target_bf_pct,
      target_date, daily_calorie_target, daily_protein_target, created_at)

body_logs(id, user_id, date, weight_kg, bf_pct, waist_cm, chest_cm, arm_cm,
          hip_cm, thigh_cm, notes)

progress_photos(id, user_id, date, storage_path, ai_bf_estimate)

exercises(id, name, muscle_group, type, is_custom, owner_id)   -- shared library + custom

workouts(id, user_id, date, notes)

workout_sets(id, workout_id, exercise_id, set_no, reps, weight_kg, rpe, is_pr)

foods(id, source, barcode, name, brand, kcal, protein_g, carb_g, fat_g, fiber_g,
      serving_desc, serving_g)

food_logs(id, user_id, date, meal, food_id, qty, kcal, protein_g, carb_g, fat_g,
          fiber_g, scan_method, photo_path)

daily_steps(id, user_id, date, steps, source)   -- from HealthKit

water_logs(id, user_id, date, ml)                -- hydration

sleep_logs(id, user_id, date, hours, quality)    -- quality 1-5

supplements(id, user_id, name, default_dose, unit, schedule)   -- e.g. creatine 5 g daily

supplement_logs(id, user_id, supplement_id, date, dose, taken_at)  -- adherence
```

---

## 6. Goal engine (the core promise)

Deterministic math — never AI-guessed.

- **BMR** via Mifflin-St Jeor from user stats.
- **TDEE** = BMR × activity factor, adjusted by actual steps from HealthKit.
- **Required deficit:** fat to lose × ~7700 kcal/kg, spread across days to target date.
- **Outputs:** daily calorie target + daily protein target (protein kept high to preserve
  muscle while leaning — "athletic", not just "skinny").
- **Daily readout example:**
  > Day 42/120. Down 3.1 kg of 8 kg goal → **39% there**. On pace ✅ (or ⚠️ 0.4 kg behind).
  > Today: eat ≤ 2150 kcal, ≥ 165 g protein.
- **Re-projection:** weekly, using a moving average of weigh-ins (not single noisy days).

**AI coach** reads the engine's numbers and writes motivation + small tweaks
("protein under target 3 days running — add a shake"). Numbers come from the engine;
the AI only phrases and advises. The AI never invents the user's stats.

---

## 7. Build phases

Each phase = its own spec + implementation plan + build. This document is the master reference.

- **Phase 1 — Foundation:** Supabase project, auth, profile, full data model + RLS,
  Expo skeleton + navigation, onboarding wizard (collect stats + target date).
- **Phase 2 — Workout logger:** exercise library, log sets, rest timer, PR detection, history.
- **Phase 3 — Food logger (no AI):** barcode scan, text search, manual entry, daily diary,
  nutrition engine totals vs targets.
- **Phase 4 — AI food vision:** food photo → Edge Function → Claude → structured macros;
  food cache; correction/edit flow.
- **Phase 5 — Goal + progress engine:** TDEE math, weigh-ins, measurements, progress photos,
  HealthKit steps, dashboard with numeric progress.
- **Phase 6 — AI coach + notifications:** recommendations, motivation, Expo push.
- **Phase 7 — Habits:** water, sleep, supplement/creatine logging + streaks (tables exist from Phase 1).

---

## 8. Risks / notes

- **Photo calorie accuracy:** portion size is the dominant error. Hybrid (barcode first,
  photo as estimate, manual override) mitigates. Always let user correct AI estimates.
- **Online-only:** chosen for simplicity. If dead-zone gym logging becomes painful,
  revisit offline-first (local SQLite + sync) as a later phase.
- **AI cost:** cache resolved foods by name/barcode; reuse prior estimates for repeat meals.
- **HealthKit:** iOS only. Android steps would need Google Fit/Health Connect later if onboarding Android users.
