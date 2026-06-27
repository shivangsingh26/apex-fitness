# Apex — Fitness & Nutrition Tracker

A mobile app to log gym workouts and food (barcode, photo, or manual entry), track nutrition macros against daily targets, and drive toward a body-composition goal by a target date.

Built for a single owner today, but multi-user-ready from day one via Supabase Row-Level Security on every table.

## Features

- **Auth & onboarding** — sign in, capture profile (sex, birthdate, height, activity level, units) and goal.
- **Workout logger** — exercise library, set logging (reps × weight), rest timer, automatic PR detection, history.
- **Food logger** — log food four ways:
  - **Barcode scan** → exact match from Open Food Facts.
  - **Photo** → AI vision estimate (grams + calories + macros per item).
  - **Text search** → fallback lookup.
  - **Manual entry**.
- **Nutrition engine** — sums calories and macros (protein / carb / fat / fiber) per day vs. targets.
- **Dashboard** — daily readout of intake and progress.

## Tech stack

| Layer | Choice |
|-------|--------|
| App | React Native + Expo (SDK 56) + TypeScript, Expo Router |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions |
| Nutrition data | Open Food Facts (barcode + nutrition) |
| Photo vision | OpenAI vision (structured JSON), called from an Edge Function |
| Tests | Jest + jest-expo / ts-jest |

**Secret rule:** every third-party API key (OpenAI, etc.) lives only in Edge Functions. The phone never holds a vendor secret — the app calls our Edge Functions, and the functions call vendors.

## Project layout

```
app/                     Expo Router screens
  (auth)/                sign-in
  (onboarding)/          profile, goal
  (tabs)/                dashboard, food, workouts
  food/                  add, scan (barcode), photo, photo-review
  workout/               [id], exercise-picker
src/
  features/
    food/                nutrition, Open Food Facts, vision client + parser
    profile/             validation, profile API
    workouts/            PR engine, rest timer, workout API
  lib/                   supabase client, session provider
supabase/
  migrations/            schema + RLS policies (0001–0004)
  functions/             estimate-food (OpenAI vision Edge Function)
  tests/                 RLS isolation checks
docs/superpowers/        design specs + phase plans
```

## Setup

### Prerequisites

- Node.js + npm
- [Expo](https://docs.expo.dev/versions/v56.0.0/) tooling (`npx expo`)
- A Supabase project + the Supabase CLI

### 1. Install

```bash
npm install
```

### 2. Environment

Create `.env.local` in the repo root:

```
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

These are public client keys (anon key is RLS-protected). Vendor secrets (OpenAI) go in the Edge Function environment, **not** here:

```bash
supabase secrets set OPENAI_API_KEY=<your-openai-key>
```

### 3. Database

Apply migrations to your Supabase project:

```bash
supabase db push
```

Deploy the vision Edge Function:

```bash
supabase functions deploy estimate-food
```

### 4. Run the app

```bash
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # web
```

## Testing

```bash
npm test
```

Covers the nutrition math, Open Food Facts and vision parsers, profile validation, the PR engine, and SQL RLS isolation (`supabase/tests/rls_isolation.sql`).

## Data model

Core Postgres tables (all user-owned rows carry `user_id`, RLS-restricted to the owner):

`users`, `goals`, `body_logs`, `progress_photos`, `exercises`, `workouts`, `workout_sets`, `foods`, `food_logs`, `daily_steps`, `water_logs`, `sleep_logs`, `supplements`, `supplement_logs`.

Shared reference tables (`exercises`, `foods`) are world-readable; everything else is owner-scoped.

## Roadmap

Built in phases (specs and plans under [docs/superpowers/](docs/superpowers/)):

1. ✅ Foundation — auth, profile, onboarding, schema + RLS
2. ✅ Workout logger
3. ✅ Food logger — barcode, text, manual, nutrition engine
4. ✅ AI food vision — photo → macro estimate

Planned: goal/TDEE projection engine, progress-photo timeline, Apple HealthKit step sync, AI coach (push notifications), habit tracking (water / sleep / supplements).

## License

See [LICENSE](LICENSE).
