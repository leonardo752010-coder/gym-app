-- =====================================================================
-- 10 · Profilo: lo "starter" scelto dall'atleta (CHOOSE YOUR STARTER)
--
-- Vuoto (null) = non ancora scelto: l'app mostra la schermata una volta.
-- Il blocco "una sola volta" è solo nell'app: qui nessun trigger e nessuna
-- regola. Per far rivedere la schermata a qualcuno basta rimettere null
-- (pannello Supabase → SQL Editor):
--   update public.profiles set starter = null where id = '<id utente>';
-- Permessi: invariati (l'atleta può già modificare solo il proprio profilo).
-- =====================================================================

alter table public.profiles
  add column starter text
  constraint profiles_starter_check check (starter in ('gorilla', 'lion', 'tiger'));

comment on column public.profiles.starter is
  'Starter scelto nella schermata CHOOSE YOUR STARTER: gorilla, lion o tiger. Null = non ancora scelto (l''app mostra la schermata).';
