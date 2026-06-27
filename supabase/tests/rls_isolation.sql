-- RLS isolation test (run as a script, not a migration):
--   docker exec -i supabase_db_personal-fitness psql -U postgres < supabase/tests/rls_isolation.sql
-- Seeds two auth users + profiles + a body_log each, impersonates user A,
-- asserts A sees only their own row.
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
  raise notice 'RLS PASS: user A sees exactly 1 body_log';
end $$;
rollback;
