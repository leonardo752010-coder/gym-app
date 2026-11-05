-- =====================================================================
-- 01 · Base
-- Schema "private" per le funzioni di supporto (non esposto dall'API),
-- funzioni comuni usate da tutte le tabelle.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Aggiorna updated_at a ogni modifica.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Vero quando chi esegue è un utente dell'app (ruoli authenticated/anon).
-- Falso per migrazioni, importazioni e pannello (postgres, service_role).
create or replace function private.is_end_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon')
$$;

-- Testo traducibile: {"it": "...", "en": "..."}; almeno una delle due lingue,
-- solo stringhe non vuote.
create or replace function private.is_i18n(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
     and jsonb_typeof(value) = 'object'
     and (value ? 'it' or value ? 'en')
     and not exists (
       select 1
       from jsonb_each(value) as e
       where jsonb_typeof(e.value) <> 'string'
          or btrim(e.value #>> '{}') = ''
     )
$$;

-- Codice fisso leggibile: minuscole, cifre e trattini (es. "panca-piana-bilanciere").
create or replace function private.is_code(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(value) <= 80
$$;
