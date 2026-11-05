-- =====================================================================
-- 08 · Permessi della funzione public.rls_auto_enable()
--
-- La funzione la crea Supabase quando nel pannello si accende
-- "automatic RLS" (event trigger ensure_rls): attiva RLS su ogni tabella
-- nuova. È SECURITY DEFINER e, come ogni funzione, nasce eseguibile da
-- tutti (PUBLIC), quindi il controllo di sicurezza la segnala come
-- chiamabile da anon e authenticated tramite l'API.
--
-- Nessuno deve chiamarla a mano: la fa partire da sola il database quando
-- nasce una tabella. Si toglie il permesso di esecuzione a PUBLIC, anon e
-- authenticated; resta al proprietario (postgres).
--
-- In locale la funzione non esiste ("automatic RLS" è solo online):
-- la migrazione allora non fa nulla.
-- =====================================================================

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
