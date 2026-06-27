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
