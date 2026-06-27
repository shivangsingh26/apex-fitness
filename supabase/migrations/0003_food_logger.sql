alter table public.food_logs drop column if exists qty;
alter table public.food_logs add column grams numeric;
alter table public.foods add column per_100g boolean not null default true;
