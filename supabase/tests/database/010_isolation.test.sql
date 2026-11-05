-- Prova 010 · Ognuno vede e modifica solo i suoi dati.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Aiuto per le prove: "entra" come un utente.
create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

-- A e B
insert into auth.users (id, email, aud, role) values
  ('11111111-0000-4000-8000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('11111111-0000-4000-8000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');
insert into public.exercises (id, code, name, visibility, verified)
values ('11111111-e000-4000-8000-000000000001', 'test-iso-ex', '{"en": "Test exercise"}', 'public', true);

-- A registra una seduta completa e i dati del corpo.
select tests.login('11111111-0000-4000-8000-00000000000a');
insert into public.sessions (id, user_id, session_date) values
  ('11111111-5000-4000-8000-000000000001', '11111111-0000-4000-8000-00000000000a', current_date);
insert into public.session_exercises (id, session_id, user_id, exercise_id) values
  ('11111111-5100-4000-8000-000000000001', '11111111-5000-4000-8000-000000000001', '11111111-0000-4000-8000-00000000000a',
   '11111111-e000-4000-8000-000000000001');
insert into public.sets (id, session_exercise_id, user_id, set_number, weight_kg, reps, rir) values
  ('11111111-5200-4000-8000-000000000001', '11111111-5100-4000-8000-000000000001', '11111111-0000-4000-8000-00000000000a', 1, 80, 8, 2);
insert into public.body_metrics (user_id, metric_date, weight_kg) values
  ('11111111-0000-4000-8000-00000000000a', current_date, 80.5);
insert into public.plans (id, user_id, name, created_by) values
  ('11111111-9000-4000-8000-000000000001', '11111111-0000-4000-8000-00000000000a', 'Piano A', '11111111-0000-4000-8000-00000000000a');

select is((select count(*)::int from public.sets), 1, 'A vede la sua serie');

-- B non vede nulla di A.
reset role;
select tests.login('11111111-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.sessions), 0, 'B non vede le sedute di A');
select is((select count(*)::int from public.session_exercises), 0, 'B non vede gli esercizi della seduta di A');
select is((select count(*)::int from public.sets), 0, 'B non vede le serie di A');
select is((select count(*)::int from public.body_metrics), 0, 'B non vede il peso di A');
select is((select count(*)::int from public.plans), 0, 'B non vede i piani di A');
select is((select count(*)::int from public.profiles), 1, 'B vede solo il proprio profilo');

-- B non può scrivere al posto di A.
select throws_ok(
  $$ insert into public.sessions (user_id, session_date) values ('11111111-0000-4000-8000-00000000000a', current_date) $$,
  '42501', null, 'B non può creare una seduta a nome di A');
select throws_ok(
  $$ insert into public.body_metrics (user_id, metric_date, weight_kg) values ('11111111-0000-4000-8000-00000000000a', current_date - 1, 70) $$,
  '42501', null, 'B non può scrivere il peso di A');

with u as (update public.sets set reps = 99 returning 1)
select is(count(*)::int, 0, 'B non può modificare le serie di A') from u;

-- B non può attaccare una sua serie alla seduta di A (il database controlla il proprietario).
insert into public.sessions (id, user_id, session_date) values
  ('11111111-5000-4000-8000-000000000002', '11111111-0000-4000-8000-00000000000b', current_date);
select throws_ok(
  $$ insert into public.session_exercises (session_id, user_id, exercise_id)
     values ('11111111-5000-4000-8000-000000000001', '11111111-0000-4000-8000-00000000000b', '11111111-e000-4000-8000-000000000001') $$,
  '23503', null, 'B non può aggiungere esercizi alla seduta di A');

-- Il profilo di A non si tocca.
with u as (update public.profiles set display_name = 'hack' where id = '11111111-0000-4000-8000-00000000000a' returning 1)
select is(count(*)::int, 0, 'B non può modificare il profilo di A') from u;

-- A può cambiare il proprio profilo.
reset role;
select tests.login('11111111-0000-4000-8000-00000000000a');
update public.profiles set locale = 'it', weight_unit = 'lb' where id = '11111111-0000-4000-8000-00000000000a';
select is((select locale || weight_unit from public.profiles where id = '11111111-0000-4000-8000-00000000000a'),
          'itlb', 'A può cambiare lingua e unità');
select throws_ok(
  $$ update public.profiles set locale = 'fr' where id = '11111111-0000-4000-8000-00000000000a' $$,
  '23514', null, 'Lingua non prevista: rifiutata');

-- Chi non ha fatto l'accesso non legge nulla.
reset role;
select set_config('role', 'anon', true);
select throws_ok($$ select count(*) from public.sets $$, '42501', null, 'anon: niente accesso alle serie');
select throws_ok($$ select count(*) from public.exercises $$, '42501', null, 'anon: niente accesso alla libreria');
reset role;

select * from finish();
rollback;
