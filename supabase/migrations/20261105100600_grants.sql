-- =====================================================================
-- 07 · Permessi dei ruoli
-- anon (chi non ha fatto l'accesso) non tocca nessuna tabella.
-- authenticated passa sempre dalle regole di accesso (RLS) scritte sopra.
-- Le funzioni di supporto in "private" non sono chiamabili dall'API.
-- =====================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- Tabelle di sola lettura per l'app.
revoke insert, update, delete on public.muscles from authenticated;

-- Le tabelle create in futuro non saranno aperte ad anon per sbaglio.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Funzioni private: eseguibili solo da utenti autenticati (servono alle regole) e dal servizio.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- Il servizio di accesso di Supabase crea il profilo all'iscrizione (trigger su auth.users).
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;
