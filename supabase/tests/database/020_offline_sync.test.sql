-- Prova 020 · Coda offline, niente doppioni, cancellazione morbida.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('22222222-0000-4000-8000-00000000000a', 'sync@example.test', 'authenticated', 'authenticated');
insert into public.exercises (id, code, name, visibility, verified)
values ('22222222-e000-4000-8000-000000000001', 'test-sync-ex', '{"en": "Test exercise"}', 'public', true);

select tests.login('22222222-0000-4000-8000-00000000000a');

-- Il telefono crea seduta, esercizio e serie con i suoi codici (id) e li reinvia due volte.
insert into public.sessions (id, user_id, session_date) values
  ('22222222-5000-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a', current_date)
  on conflict (id) do nothing;
insert into public.sessions (id, user_id, session_date) values
  ('22222222-5000-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a', current_date)
  on conflict (id) do nothing;
insert into public.session_exercises (id, session_id, user_id, exercise_id) values
  ('22222222-5100-4000-8000-000000000001', '22222222-5000-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a',
   '22222222-e000-4000-8000-000000000001')
  on conflict (id) do nothing;

select lives_ok(
  $$ insert into public.sets (id, session_exercise_id, user_id, set_number, weight_kg, reps, rir, input_weight, input_unit)
     values ('22222222-5200-4000-8000-000000000001', '22222222-5100-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a',
             1, 45.359, 8, 2, 100, 'lb')
     on conflict (id) do nothing $$,
  'Prima consegna della serie 1');
select lives_ok(
  $$ insert into public.sets (id, session_exercise_id, user_id, set_number, weight_kg, reps, rir, input_weight, input_unit)
     values ('22222222-5200-4000-8000-000000000001', '22222222-5100-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a',
             1, 45.359, 8, 2, 100, 'lb')
     on conflict (id) do nothing $$,
  'Seconda consegna della stessa serie (rete tornata): nessun errore');

select is((select count(*)::int from public.sessions), 1, 'Una sola seduta anche se inviata due volte');
select is((select count(*)::int from public.sets), 1, 'Una sola serie anche se inviata due volte');

-- Un'altra serie 1 per lo stesso esercizio della seduta (codice diverso) = doppione: rifiutata.
select throws_ok(
  $$ insert into public.sets (session_exercise_id, user_id, set_number, weight_kg, reps)
     values ('22222222-5100-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a', 1, 50, 8) $$,
  '23505', null, 'Doppione della serie 1: rifiutato');

-- Peso scritto in lb: il valore inserito resta, il peso in kg è quello usato per i calcoli.
select is((select input_weight || ' ' || input_unit from public.sets), '100.00 lb', 'Si conserva il peso come scritto (100 lb)');

-- Dall'app non si cancella davvero.
select throws_ok($$ delete from public.sets $$, '42501', null, 'Cancellazione vera non permessa all''app');
select is((select count(*)::int from public.sets), 1, 'La serie è ancora lì');

-- Cancellazione morbida, poi si può rifare la serie 1.
update public.sets set deleted_at = now() where id = '22222222-5200-4000-8000-000000000001';
select lives_ok(
  $$ insert into public.sets (session_exercise_id, user_id, set_number, weight_kg, reps)
     values ('22222222-5100-4000-8000-000000000001', '22222222-0000-4000-8000-00000000000a', 1, 47.5, 8) $$,
  'Dopo la cancellazione morbida si può registrare di nuovo la serie 1');
select is((select count(*)::int from public.sets where deleted_at is null), 1, 'Una sola serie 1 attiva');

reset role;
select * from finish();
rollback;
