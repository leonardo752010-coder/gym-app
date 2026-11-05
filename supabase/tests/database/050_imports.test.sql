-- Prova 050 · Importazioni: ogni dato importato è legato a un utente che
-- esiste in auth, e l'importazione e i dati appartengono alla stessa persona.
begin;
-- Online la CLI entra come cli_login_postgres (membro di postgres, senza i suoi permessi): si lavora come postgres, solo dentro questa prova.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- pgTAP sta nello schema extensions.
set local search_path = public, extensions;
select plan(13);
-- Il collegamento al proprio import si controlla a fine transazione (migrazione 09): qui lo si controlla subito.
set constraints all immediate;

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function tests.login(uuid) to anon, authenticated;

insert into auth.users (id, email, aud, role) values
  ('55555555-0000-4000-8000-00000000000a', 'imp-a@example.test', 'authenticated', 'authenticated'),
  ('55555555-0000-4000-8000-00000000000b', 'imp-b@example.test', 'authenticated', 'authenticated');

-- Come farà lo script del passo 3 (servizio): un'importazione per A.
select throws_ok(
  $$ insert into public.import_batches (user_id, source, kind)
     values ('55555555-0000-4000-8000-0000000000ff', 'sheet-gym', 'training') $$,
  '23503', null, 'Non si importa per un utente che non esiste in auth');

insert into public.import_batches (id, user_id, source, kind, file_name) values
  ('55555555-1000-4000-8000-00000000000a', '55555555-0000-4000-8000-00000000000a', 'sheet-gym', 'training', 'GYM STORICO');

select lives_ok(
  $$ insert into public.sessions (id, user_id, session_date, import_id) values
       ('55555555-5000-4000-8000-00000000000a', '55555555-0000-4000-8000-00000000000a', '2026-07-01', '55555555-1000-4000-8000-00000000000a') $$,
  'Una seduta importata si lega all''importazione dello stesso utente');
select throws_ok(
  $$ insert into public.sessions (user_id, session_date, import_id) values
       ('55555555-0000-4000-8000-00000000000b', '2026-07-01', '55555555-1000-4000-8000-00000000000a') $$,
  '23503', null, 'I dati di B non possono finire nell''importazione di A');
select throws_ok(
  $$ insert into public.body_metrics (user_id, metric_date, weight_kg, import_id) values
       ('55555555-0000-4000-8000-00000000000b', '2026-07-01', 70, '55555555-1000-4000-8000-00000000000a') $$,
  '23503', null, 'Vale anche per i dati del corpo');

-- B non vede l'importazione di A; A sì.
select tests.login('55555555-0000-4000-8000-00000000000b');
select is((select count(*)::int from public.import_batches), 0, 'B non vede le importazioni di A');
select throws_ok(
  $$ insert into public.import_batches (user_id, source, kind, created_by)
     values ('55555555-0000-4000-8000-00000000000a', 'csv', 'body', '55555555-0000-4000-8000-00000000000b') $$,
  '42501', null, 'B non può creare importazioni a nome di A');
set local role postgres;
select tests.login('55555555-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.import_batches), 1, 'A vede la sua importazione');
select lives_ok(
  $$ insert into public.import_batches (user_id, source, kind, created_by)
     values ('55555555-0000-4000-8000-00000000000a', 'csv', 'body', '55555555-0000-4000-8000-00000000000a') $$,
  'A può importare un suo file dall''app');

-- Annullare un'importazione (servizio): via le righe, registro segnato.
set local role postgres;
delete from public.sessions where import_id = '55555555-1000-4000-8000-00000000000a';
update public.import_batches set status = 'rolled-back', finished_at = now() where id = '55555555-1000-4000-8000-00000000000a';
select is((select count(*)::int from public.sessions where user_id = '55555555-0000-4000-8000-00000000000a'), 0,
          'Un''importazione si annulla tutta insieme');

-- Un import con ancora dati non si cancella (controllo forzato subito: di base avviene a fine transazione).
insert into public.import_batches (id, user_id, source, kind) values
  ('55555555-1000-4000-8000-00000000000c', '55555555-0000-4000-8000-00000000000a', 'sheet-gym', 'training');
insert into public.sessions (id, user_id, session_date, import_id) values
  ('55555555-5000-4000-8000-00000000000c', '55555555-0000-4000-8000-00000000000a', '2026-07-02', '55555555-1000-4000-8000-00000000000c');
select throws_ok(
  $$ delete from public.import_batches where id = '55555555-1000-4000-8000-00000000000c' $$,
  '23503', null, 'Un import che ha ancora sedute non si può cancellare');

-- Un account con dati importati si può cancellare: sparisce tutto, import compreso.
-- (controllo a fine transazione, come di base; "set constraints all immediate" lo fa subito)
set constraints all deferred;
select lives_ok($$ delete from auth.users where id = '55555555-0000-4000-8000-00000000000a' $$,
  'Si può cancellare un account che ha dati importati');
select lives_ok($$ set constraints all immediate $$, 'Dopo la cancellazione nessun collegamento rotto');
select is((select count(*)::int from public.import_batches where user_id = '55555555-0000-4000-8000-00000000000a')
        + (select count(*)::int from public.sessions where user_id = '55555555-0000-4000-8000-00000000000a'), 0,
          'Cancellato l''account non restano né import né sedute');

select * from finish();
rollback;
