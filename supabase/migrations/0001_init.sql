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

-- ============================================================================
-- Row-Level Security
-- ============================================================================

-- PostgREST connects as the `authenticated` (or `anon`) role; without table
-- grants those roles see nothing. Grant table privileges, then let RLS
-- policies filter rows down to the owner.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.exercises, public.foods to anon;

-- Enable RLS on every user-owned table
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

-- owner via user_id
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

-- ============================================================================
-- Auto-create a profile row when an auth user is created
-- ============================================================================
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
