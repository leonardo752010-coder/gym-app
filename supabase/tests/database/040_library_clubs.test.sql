-- Prova 040 · Libreria condivisa: esercizi, pesi per muscolo, tipi di serie,
-- catene, club, macchine dei club, club frequentati.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('44444444-0000-4000-8000-00000000000a', 'lib-a@example.test', 'authenticated', 'authenticated'),
  ('44444444-0000-4000-8000-00000000000b', 'lib-b@example.test', 'authenticated', 'authenticated');

-- Libreria pubblica (la crea il servizio): un esercizio, una catena con due club, una macchina.
insert into public.exercises (id, code, name, visibility, verified) values
  ('44444444-e000-4000-8000-000000000001', 'test-lib-public', '{"it": "Pubblico", "en": "Public"}', 'public', true);
insert into public.club_chains (id, name, visibility, verified) values
  ('44444444-c000-4000-8000-000000000001', 'Catena Test', 'public', true);
insert into public.clubs (id, name, chain_id, visibility, verified) values
  ('44444444-c100-4000-8000-000000000001', 'Club Test 1', '44444444-c000-4000-8000-000000000001', 'public', true),
  ('44444444-c100-4000-8000-000000000002', 'Club Test 2', '44444444-c000-4000-8000-000000000001', 'public', true);
insert into public.machines (id, code, brand, model, visibility, verified) values
  ('44444444-d000-4000-8000-000000000001', 'test-lib-machine', 'Marca', 'Modello', 'public', true);

select is((select count(*)::int from public.clubs where chain_id = '44444444-c000-4000-8000-000000000001'), 2,
          'Più club possono appartenere alla stessa catena');

-- ---------- Esercizi ----------
select tests.login('44444444-0000-4000-8000-00000000000a');
select lives_ok(
  $$ insert into public.exercises (id, code, name, created_by)
     values ('44444444-e000-4000-8000-00000000000a', 'test-lib-mio', '{"it": "Il mio esercizio"}', '44444444-0000-4000-8000-00000000000a') $$,
  'Un utente crea un suo esercizio privato');
select throws_ok(
  $$ insert into public.exercises (code, name, created_by, visibility)
     values ('test-lib-pub-abusivo', '{"it": "x"}', '44444444-0000-4000-8000-00000000000a', 'public') $$,
  '42501', null, 'Un utente non può pubblicare da solo un esercizio');
select throws_ok(
  $$ insert into public.exercises (code, name, created_by, verified)
     values ('test-lib-verif-abusivo', '{"it": "x"}', '44444444-0000-4000-8000-00000000000a', true) $$,
  '42501', null, 'Un utente non può segnare da solo "verificato"');
select throws_ok(
  $$ insert into public.exercises (code, name, created_by)
     values ('Codice Sbagliato', '{"it": "x"}', '44444444-0000-4000-8000-00000000000a') $$,
  '23514', null, 'Il codice deve essere minuscolo con trattini');
select throws_ok(
  $$ insert into public.exercises (code, name, created_by)
     values ('test-lib-noname', '{"fr": "x"}', '44444444-0000-4000-8000-00000000000a') $$,
  '23514', null, 'Il nome deve avere italiano o inglese');
select throws_ok(
  $$ update public.exercises set code = 'test-lib-rinominato' where id = '44444444-e000-4000-8000-00000000000a' $$,
  'P0001', null, 'Il codice fisso non si cambia');
select lives_ok(
  $$ update public.exercises set name = '{"it": "Nome nuovo", "en": "New name"}' where id = '44444444-e000-4000-8000-00000000000a' $$,
  'Il nome invece si cambia');
with u as (update public.exercises set name = '{"it": "hack"}' where id = '44444444-e000-4000-8000-000000000001' returning 1)
select is(count(*)::int, 0, 'Un utente non modifica gli esercizi pubblici') from u;

-- Pesi per muscolo: 1 principale, 0,5 secondario, salvati per esercizio-muscolo.
select lives_ok(
  $$ insert into public.exercise_muscles (exercise_id, muscle_code, role, weight) values
       ('44444444-e000-4000-8000-00000000000a', 'chest', 'primary', 1),
       ('44444444-e000-4000-8000-00000000000a', 'triceps', 'secondary', 0.5) $$,
  'Pesi per muscolo sul proprio esercizio');
select throws_ok(
  $$ insert into public.exercise_muscles (exercise_id, muscle_code, role, weight)
     values ('44444444-e000-4000-8000-000000000001', 'biceps', 'secondary', 0.5) $$,
  '42501', null, 'Non si cambiano i muscoli di un esercizio pubblico');
select throws_ok(
  $$ insert into public.exercise_muscles (exercise_id, muscle_code, role, weight)
     values ('44444444-e000-4000-8000-00000000000a', 'front-delts', 'secondary', 1.5) $$,
  '23514', null, 'Il peso va da 0 a 1');

-- Tipo di serie personale.
select lives_ok(
  $$ insert into public.set_types (code, name, created_by) values ('u-cluster-a', '{"it": "Cluster"}', '44444444-0000-4000-8000-00000000000a') $$,
  'Un utente crea un suo tipo di serie');

-- ---------- B non vede né usa le cose private di A ----------
reset role;
select tests.login('44444444-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.exercises where code like 'test-lib-%'), 1, 'B vede l''esercizio pubblico ma non quello privato di A');
select is((select count(*)::int from public.set_types where code = 'u-cluster-a'), 0, 'B non vede il tipo di serie di A');
insert into public.sessions (id, user_id, session_date) values
  ('44444444-5000-4000-8000-00000000000b', '44444444-0000-4000-8000-00000000000b', current_date);
select throws_ok(
  $$ insert into public.session_exercises (session_id, user_id, exercise_id)
     values ('44444444-5000-4000-8000-00000000000b', '44444444-0000-4000-8000-00000000000b', '44444444-e000-4000-8000-00000000000a') $$,
  '42501', null, 'B non può usare l''esercizio privato di A');

-- ---------- Club ----------
reset role;
select tests.login('44444444-0000-4000-8000-00000000000a');
select lives_ok(
  $$ insert into public.user_clubs (user_id, club_id, is_home) values
       ('44444444-0000-4000-8000-00000000000a', '44444444-c100-4000-8000-000000000001', true) $$,
  'A si collega a un club pubblico che frequenta');
select throws_ok(
  $$ insert into public.user_clubs (user_id, club_id, is_home) values
       ('44444444-0000-4000-8000-00000000000a', '44444444-c100-4000-8000-000000000002', true) $$,
  '23505', null, 'Un solo club principale per persona');
insert into public.clubs (id, name, created_by) values
  ('44444444-c100-4000-8000-00000000000a', 'Garage di A', '44444444-0000-4000-8000-00000000000a');
select lives_ok(
  $$ insert into public.club_machines (club_id, machine_id, added_by) values
       ('44444444-c100-4000-8000-000000000001', '44444444-d000-4000-8000-000000000001', '44444444-0000-4000-8000-00000000000a') $$,
  'Chi frequenta un club pubblico può segnalare una macchina pubblica presente');
insert into public.machines (id, code, brand, created_by) values
  ('44444444-d000-4000-8000-00000000000a', 'test-lib-macchina-a', 'Fatta in casa', '44444444-0000-4000-8000-00000000000a');
select throws_ok(
  $$ insert into public.club_machines (club_id, machine_id, added_by) values
       ('44444444-c100-4000-8000-000000000002', '44444444-d000-4000-8000-00000000000a', '44444444-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Una macchina privata non si mette in un club pubblico');
select lives_ok(
  $$ insert into public.club_machines (club_id, machine_id, added_by) values
       ('44444444-c100-4000-8000-00000000000a', '44444444-d000-4000-8000-00000000000a', '44444444-0000-4000-8000-00000000000a') $$,
  'Nel proprio club privato si mette la propria macchina');

reset role;
select tests.login('44444444-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.clubs where id = '44444444-c100-4000-8000-00000000000a'), 0, 'B non vede il club privato di A');
select throws_ok(
  $$ insert into public.user_clubs (user_id, club_id) values
       ('44444444-0000-4000-8000-00000000000b', '44444444-c100-4000-8000-00000000000a') $$,
  '42501', null, 'B non può collegarsi al club privato di A');
select throws_ok(
  $$ insert into public.club_machines (club_id, machine_id, added_by) values
       ('44444444-c100-4000-8000-000000000002', '44444444-d000-4000-8000-000000000001', '44444444-0000-4000-8000-00000000000b') $$,
  '42501', null, 'Chi non frequenta il club non ne modifica le macchine');

reset role;
select * from finish();
rollback;
