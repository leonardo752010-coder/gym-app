-- Prova 060 · Piano e log: superserie come gruppo di esercizi, piano attivo
-- unico, cambiare il piano non tocca lo storico, serie in più parti.
begin;
-- Online la CLI entra come cli_login_postgres (membro di postgres, senza i suoi permessi): si lavora come postgres, solo dentro questa prova.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- pgTAP sta nello schema extensions.
set local search_path = public, extensions;
select plan(12);

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('66666666-0000-4000-8000-00000000000a', 'plan-a@example.test', 'authenticated', 'authenticated');
insert into public.exercises (id, code, name, visibility, verified) values
  ('66666666-e000-4000-8000-000000000001', 'test-plan-ex1', '{"en": "Ex 1"}', 'public', true),
  ('66666666-e000-4000-8000-000000000002', 'test-plan-ex2', '{"en": "Ex 2"}', 'public', true);

select tests.login('66666666-0000-4000-8000-00000000000a');

insert into public.plans (id, user_id, name, is_active, created_by) values
  ('66666666-9000-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 'Bulk', true, '66666666-0000-4000-8000-00000000000a');
select throws_ok(
  $$ insert into public.plans (user_id, name, is_active, created_by)
     values ('66666666-0000-4000-8000-00000000000a', 'Cut', true, '66666666-0000-4000-8000-00000000000a') $$,
  '23505', null, 'Un solo piano attivo alla volta');

insert into public.plan_days (id, plan_id, user_id, position, name) values
  ('66666666-9100-4000-8000-000000000001', '66666666-9000-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 1, 'Upper A'),
  ('66666666-9100-4000-8000-000000000002', '66666666-9000-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 2, 'Lower A');

-- Superserie = gruppo di esercizi del giorno, con un solo recupero a fine giro.
insert into public.plan_supersets (id, plan_day_id, user_id, label, rest_seconds) values
  ('66666666-9200-4000-8000-000000000001', '66666666-9100-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 'A', 120);
select lives_ok(
  $$ insert into public.plan_exercises (id, plan_day_id, user_id, position, exercise_id, superset_id, sets, reps_min, reps_max) values
       ('66666666-9300-4000-8000-000000000001', '66666666-9100-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 1,
        '66666666-e000-4000-8000-000000000001', '66666666-9200-4000-8000-000000000001', 3, 8, 12),
       ('66666666-9300-4000-8000-000000000002', '66666666-9100-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 2,
        '66666666-e000-4000-8000-000000000002', '66666666-9200-4000-8000-000000000001', 3, 10, 15) $$,
  'Due esercizi nella stessa superserie');
select throws_ok(
  $$ insert into public.plan_exercises (plan_day_id, user_id, position, exercise_id, superset_id)
     values ('66666666-9100-4000-8000-000000000002', '66666666-0000-4000-8000-00000000000a', 1,
             '66666666-e000-4000-8000-000000000001', '66666666-9200-4000-8000-000000000001') $$,
  '23503', null, 'Una superserie non può mescolare esercizi di giorni diversi');
select throws_ok(
  $$ insert into public.plan_exercises (plan_day_id, user_id, position, exercise_id, reps_min, reps_max)
     values ('66666666-9100-4000-8000-000000000002', '66666666-0000-4000-8000-00000000000a', 2,
             '66666666-e000-4000-8000-000000000001', 12, 8) $$,
  '23514', null, 'Reps massime non possono essere sotto le minime');

-- Seduta che segue il piano, con la copia dell'obiettivo.
insert into public.sessions (id, user_id, session_date, plan_id, plan_day_id, day_name) values
  ('66666666-5000-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', current_date,
   '66666666-9000-4000-8000-000000000001', '66666666-9100-4000-8000-000000000001', 'Upper A'),
  ('66666666-5000-4000-8000-000000000002', '66666666-0000-4000-8000-00000000000a', current_date - 1, null, null, 'Altro');
insert into public.session_supersets (id, session_id, user_id, plan_superset_id, label, rest_seconds) values
  ('66666666-5100-4000-8000-000000000001', '66666666-5000-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a',
   '66666666-9200-4000-8000-000000000001', 'A', 120);
insert into public.session_exercises (id, session_id, user_id, position, exercise_id, plan_exercise_id, superset_id,
                                      target_sets, target_reps_min, target_reps_max) values
  ('66666666-5200-4000-8000-000000000001', '66666666-5000-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 1,
   '66666666-e000-4000-8000-000000000001', '66666666-9300-4000-8000-000000000001', '66666666-5100-4000-8000-000000000001', 3, 8, 12);
select throws_ok(
  $$ insert into public.session_exercises (session_id, user_id, exercise_id, superset_id)
     values ('66666666-5000-4000-8000-000000000002', '66666666-0000-4000-8000-00000000000a',
             '66666666-e000-4000-8000-000000000002', '66666666-5100-4000-8000-000000000001') $$,
  '23503', null, 'La superserie di una seduta non si usa in un''altra seduta');

-- Drop set: la serie e le sue parti.
insert into public.sets (id, session_exercise_id, user_id, set_number, set_type, weight_kg, reps) values
  ('66666666-5300-4000-8000-000000000001', '66666666-5200-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 1, 'drop', 50, 10);
select lives_ok(
  $$ insert into public.set_parts (set_id, user_id, part_number, weight_kg, reps) values
       ('66666666-5300-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 2, 35, 8),
       ('66666666-5300-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 3, 20, 10) $$,
  'Una drop set ha più parti');
select throws_ok(
  $$ insert into public.set_parts (set_id, user_id, part_number, weight_kg, reps)
     values ('66666666-5300-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 2, 30, 8) $$,
  '23505', null, 'Ogni parte compare una volta sola');
select throws_ok(
  $$ insert into public.sets (session_exercise_id, user_id, set_number, set_type, weight_kg, reps)
     values ('66666666-5200-4000-8000-000000000001', '66666666-0000-4000-8000-00000000000a', 2, 'superset', 50, 10) $$,
  '42501', null, '"superset" non esiste come tipo di serie: rifiutato');

-- Cambiare il piano non tocca lo storico.
update public.plan_exercises set reps_min = 6, reps_max = 8 where id = '66666666-9300-4000-8000-000000000001';
select is((select target_reps_min || '-' || target_reps_max from public.session_exercises where id = '66666666-5200-4000-8000-000000000001'),
          '8-12', 'Cambiando le reps nel piano, l''obiettivo salvato nella seduta resta quello di allora');

delete from public.plan_supersets where id = '66666666-9200-4000-8000-000000000001';
select is((select count(*)::int from public.plan_exercises where plan_day_id = '66666666-9100-4000-8000-000000000001' and superset_id is null), 2,
          'Sciogliendo la superserie gli esercizi restano nel giorno');

delete from public.plans where id = '66666666-9000-4000-8000-000000000001';
select is((select count(*)::int from public.sets where id = '66666666-5300-4000-8000-000000000001'), 1,
          'Cancellando tutto il piano le serie fatte restano');
select is((select coalesce(plan_id::text, 'vuoto') || ' ' || day_name from public.sessions where id = '66666666-5000-4000-8000-000000000001'),
          'vuoto Upper A', 'La seduta perde il legame col piano ma conserva il nome del giorno');

set local role postgres;
select * from finish();
rollback;
