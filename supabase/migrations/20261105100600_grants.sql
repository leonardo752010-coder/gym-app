-- =====================================================================
-- 07 · Permessi dei ruoli, scritti tabella per tabella.
--
-- Il progetto ha "Automatically expose new tables" spento: nessuna tabella
-- è raggiungibile dall'API senza un GRANT esplicito. Qui:
--   * anon (chi non ha fatto l'accesso): niente, su nessuna tabella.
--   * authenticated (utente dell'app): solo le operazioni che servono,
--     e comunque filtrate dalle regole di accesso (RLS).
--     Niente DELETE su sedute, esercizi della seduta e serie
--     (cancellazione morbida con deleted_at).
--   * service_role (importazioni e manutenzione, mai nell'app): tutto.
-- Una tabella nuova in futuro deve avere qui (o nella sua migrazione)
-- i suoi GRANT: la prova 000_schema controlla che ci siano.
-- =====================================================================

-- Si parte da zero, poi si concede solo il necessario.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke execute on all functions in schema public from anon, authenticated;

grant usage on schema public to authenticated, service_role;

-- ---------- Persone ----------
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update         on public.coach_links       to authenticated;
grant select, insert, update         on public.import_batches    to authenticated;

-- ---------- Libreria ----------
grant select                         on public.muscles           to authenticated;
grant select, insert, update, delete on public.exercises         to authenticated;
grant select, insert, update, delete on public.exercise_muscles  to authenticated;
grant select, insert, update, delete on public.set_types         to authenticated;
grant select, insert, update, delete on public.club_chains       to authenticated;
grant select, insert, update, delete on public.clubs             to authenticated;
grant select, insert, update, delete on public.machines          to authenticated;
grant select, insert,         delete on public.machine_exercises to authenticated;
grant select, insert, update, delete on public.club_machines     to authenticated;
grant select, insert, update, delete on public.user_clubs        to authenticated;

-- ---------- Piano ----------
grant select, insert, update, delete on public.plans                  to authenticated;
grant select, insert, update, delete on public.plan_weeks             to authenticated;
grant select, insert, update, delete on public.plan_days              to authenticated;
grant select, insert, update, delete on public.plan_supersets         to authenticated;
grant select, insert, update, delete on public.plan_exercises         to authenticated;
grant select, insert, update, delete on public.plan_exercise_machines to authenticated;

-- ---------- Log (niente delete: cancellazione morbida) ----------
grant select, insert, update         on public.sessions          to authenticated;
grant select, insert, update         on public.session_supersets to authenticated;
grant select, insert, update         on public.session_exercises to authenticated;
grant select, insert, update         on public.sets              to authenticated;
grant select, insert, update, delete on public.set_parts         to authenticated;

-- ---------- Corpo ----------
grant select, insert, update, delete on public.body_metrics      to authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;

-- ---------- Servizio (importazioni, manutenzione) ----------
grant select, insert, update, delete on
  public.profiles, public.coach_links, public.import_batches,
  public.muscles, public.exercises, public.exercise_muscles, public.set_types, public.club_chains, public.clubs,
  public.machines, public.machine_exercises, public.club_machines, public.user_clubs,
  public.plans, public.plan_weeks, public.plan_days, public.plan_supersets, public.plan_exercises, public.plan_exercise_machines,
  public.sessions, public.session_supersets, public.session_exercises, public.sets, public.set_parts,
  public.body_metrics, public.body_measurements
to service_role;

-- Tabelle create in futuro: anon non riceve mai nulla in automatico.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------- Funzioni private ----------
-- Eseguibili solo da utenti autenticati (servono alle regole) e dal servizio.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- Il servizio di accesso di Supabase crea il profilo all'iscrizione (trigger su auth.users).
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;
