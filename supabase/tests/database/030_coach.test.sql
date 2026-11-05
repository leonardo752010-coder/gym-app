-- Prova 030 · Coach: vede solo i suoi atleti, solo dopo la conferma,
-- modifica il piano solo col permesso dell'atleta, lo storico mai.
begin;
-- Online la CLI entra come cli_login_postgres (membro di postgres, senza i suoi permessi): si lavora come postgres, solo dentro questa prova.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- pgTAP sta nello schema extensions.
set local search_path = public, extensions;
select plan(19);

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

-- C = coach, D = atleta, E = altra persona
insert into auth.users (id, email, aud, role) values
  ('33333333-0000-4000-8000-00000000000c', 'coach@example.test', 'authenticated', 'authenticated'),
  ('33333333-0000-4000-8000-00000000000d', 'atleta@example.test', 'authenticated', 'authenticated'),
  ('33333333-0000-4000-8000-00000000000e', 'altro@example.test', 'authenticated', 'authenticated');
insert into public.exercises (id, code, name, visibility, verified)
values ('33333333-e000-4000-8000-000000000001', 'test-coach-ex', '{"en": "Test exercise"}', 'public', true);

-- D ed E hanno dati loro (scritti dal servizio per brevità).
insert into public.sessions (id, user_id, session_date) values
  ('33333333-5000-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d', current_date),
  ('33333333-5000-4000-8000-00000000000e', '33333333-0000-4000-8000-00000000000e', current_date);
insert into public.session_exercises (id, session_id, user_id, exercise_id) values
  ('33333333-5100-4000-8000-00000000000d', '33333333-5000-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d',
   '33333333-e000-4000-8000-000000000001');
insert into public.sets (id, session_exercise_id, user_id, set_number, weight_kg, reps) values
  ('33333333-5200-4000-8000-00000000000d', '33333333-5100-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d', 1, 60, 10);
insert into public.plans (id, user_id, name) values
  ('33333333-9000-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d', 'Piano D');

-- C invita D.
select tests.login('33333333-0000-4000-8000-00000000000c');
insert into public.coach_links (id, coach_id, athlete_id, invited_by) values
  ('33333333-c000-4000-8000-000000000001', '33333333-0000-4000-8000-00000000000c', '33333333-0000-4000-8000-00000000000d',
   '33333333-0000-4000-8000-00000000000c');
select throws_ok(
  $$ update public.coach_links set status = 'active' where id = '33333333-c000-4000-8000-000000000001' $$,
  'P0001', null, 'Il coach non può accettare da solo il proprio invito');
select is((select count(*)::int from public.sessions), 0, 'Invito in attesa: il coach non vede ancora nulla');

-- D accetta.
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000d');
update public.coach_links set status = 'active' where id = '33333333-c000-4000-8000-000000000001';
select isnt((select activated_at from public.coach_links where id = '33333333-c000-4000-8000-000000000001'), null,
            'L''atleta accetta: collegamento attivo');

-- Ora C vede i dati di D, ma non quelli di E.
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000c');
select is((select count(*)::int from public.sessions where user_id = '33333333-0000-4000-8000-00000000000d'), 1, 'Il coach vede le sedute dell''atleta');
select is((select count(*)::int from public.sets), 1, 'Il coach vede le serie dell''atleta');
select is((select count(*)::int from public.plans), 1, 'Il coach vede il piano dell''atleta');
select is((select count(*)::int from public.profiles), 2, 'Il coach vede il proprio profilo e quello dell''atleta');
select is((select count(*)::int from public.sessions where user_id = '33333333-0000-4000-8000-00000000000e'), 0, 'Il coach non vede chi non segue');

-- Lo storico non lo modifica mai.
select throws_ok(
  $$ insert into public.sets (session_exercise_id, user_id, set_number, weight_kg, reps)
     values ('33333333-5100-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d', 2, 60, 10) $$,
  '42501', null, 'Il coach non può aggiungere serie all''atleta');
with u as (update public.sets set reps = 12 returning 1)
select is(count(*)::int, 0, 'Il coach non può modificare le serie dell''atleta') from u;

-- Piano: senza permesso no.
select throws_ok(
  $$ insert into public.plan_days (plan_id, user_id, position, name)
     values ('33333333-9000-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d', 1, 'Full body') $$,
  '42501', null, 'Senza permesso il coach non modifica il piano');
select throws_ok(
  $$ update public.coach_links set can_edit_plan = true where id = '33333333-c000-4000-8000-000000000001' $$,
  'P0001', null, 'Il coach non può darsi il permesso da solo');

-- D dà il permesso: ora sì.
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000d');
update public.coach_links set can_edit_plan = true where id = '33333333-c000-4000-8000-000000000001';
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000c');
select lives_ok(
  $$ insert into public.plan_days (plan_id, user_id, position, name)
     values ('33333333-9000-4000-8000-00000000000d', '33333333-0000-4000-8000-00000000000d', 1, 'Full body') $$,
  'Con il permesso il coach modifica il piano');
select throws_ok(
  $$ insert into public.plans (user_id, name, created_by)
     values ('33333333-0000-4000-8000-00000000000e', 'Piano abusivo', '33333333-0000-4000-8000-00000000000c') $$,
  '42501', null, 'Il coach non crea piani per chi non segue');

-- E non vede il profilo del coach né quello di D.
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000e');
select is((select count(*)::int from public.profiles), 1, 'Chi non è collegato vede solo il proprio profilo');
select is((select count(*)::int from public.coach_links), 0, 'Chi non è coinvolto non vede il collegamento');

-- D chiude il collegamento: il coach non vede più nulla, e non si riapre.
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000d');
update public.coach_links set status = 'ended' where id = '33333333-c000-4000-8000-000000000001';
set local role postgres;
select tests.login('33333333-0000-4000-8000-00000000000c');
select is((select count(*)::int from public.sessions), 0, 'Collegamento chiuso: il coach non vede più le sedute');
select throws_ok(
  $$ update public.coach_links set status = 'active' where id = '33333333-c000-4000-8000-000000000001' $$,
  'P0001', null, 'Un collegamento chiuso non si riapre');
select throws_ok(
  $$ insert into public.coach_links (coach_id, athlete_id, invited_by, status)
     values ('33333333-0000-4000-8000-00000000000c', '33333333-0000-4000-8000-00000000000e', '33333333-0000-4000-8000-00000000000c', 'active') $$,
  'P0001', null, 'Un nuovo collegamento parte sempre "in attesa"');

set local role postgres;
select * from finish();
rollback;
