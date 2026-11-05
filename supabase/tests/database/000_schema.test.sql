-- Prova 000 · Struttura: tutte le tabelle protette, anon senza accesso,
-- dati di riferimento presenti, profilo creato all'iscrizione.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select tables_are('public', array[
  'profiles', 'coach_links', 'import_batches',
  'muscles', 'exercises', 'exercise_muscles', 'set_types', 'club_chains', 'clubs',
  'machines', 'machine_exercises', 'club_machines', 'user_clubs',
  'plans', 'plan_weeks', 'plan_days', 'plan_supersets', 'plan_exercises', 'plan_exercise_machines',
  'sessions', 'session_supersets', 'session_exercises', 'sets', 'set_parts',
  'body_metrics', 'body_measurements'
], 'Le tabelle previste ci sono tutte (e nessun''altra)');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'Ogni tabella ha le regole di accesso (RLS) attive');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  0, 'Ogni tabella ha almeno una regola (altrimenti nessuno la potrebbe leggere)');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
  0, 'Chi non ha fatto l''accesso (anon) non ha permessi sulle tabelle');

select ok(
  not has_function_privilege('anon', 'private.can_read_user(uuid)', 'execute'),
  'anon non può usare le funzioni private');

select ok(
  not has_table_privilege('authenticated', 'public.muscles', 'insert'),
  'L''elenco dei muscoli è di sola lettura per l''app');

select results_eq(
  $$ select code from public.set_types where created_by is null order by position $$,
  $$ values ('normal'), ('warmup'), ('drop'), ('rest-pause'), ('myo-reps') $$,
  'Tipi di serie di sistema: normale, riscaldamento, drop, rest-pause, myo-reps');

select is(
  (select count(*)::int from public.set_types where code like '%superset%' or code like '%superserie%'),
  0, 'La superserie non è un tipo di serie');

select is((select count(*)::int from public.muscles), 19, 'Elenco muscoli caricato (19)');

-- Iscrizione: nasce il profilo, con la lingua presa dai dati dell'account.
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('10000000-0000-4000-8000-000000000001', 'nuovo@example.test', 'authenticated', 'authenticated',
        '{"full_name": "Nuovo Utente", "locale": "it-NZ"}');

select is(
  (select locale from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'it', 'All''iscrizione nasce il profilo, con la lingua giusta');

select is(
  (select weight_unit || ' ' || time_zone from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'kg Pacific/Auckland', 'Valori iniziali del profilo: kg e fuso Pacific/Auckland');

-- Cancellare l'account cancella tutti i suoi dati (privacy).
delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  0, 'Cancellando l''account sparisce anche il profilo');

select * from finish();
rollback;
