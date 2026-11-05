-- =====================================================================
-- 02 · Persone: profili, coach e atleti, registro importazioni
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profili: uno per ogni account di Supabase Auth (creato da solo all'iscrizione).
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  locale       text not null default 'en' check (locale in ('it', 'en')),
  weight_unit  text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  time_zone    text not null default 'Pacific/Auckland' check (char_length(time_zone) between 1 and 64),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Un profilo per ogni utente: lingua, kg/lb, fuso orario.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Crea il profilo quando nasce un utente in auth.users.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    left(coalesce(meta ->> 'full_name', meta ->> 'name'), 80),
    case when coalesce(meta ->> 'locale', '') like 'it%' then 'it' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Coach e atleti. Il collegamento parte "in attesa" e lo conferma l'altra persona.
-- Solo l'atleta decide se il coach può modificare il piano. Lo storico delle serie
-- il coach lo vede ma non lo modifica mai.
-- ---------------------------------------------------------------------
create table public.coach_links (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles (id) on delete cascade,
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  can_edit_plan boolean not null default false,
  invited_by    uuid not null references public.profiles (id) on delete cascade,
  activated_at  timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint coach_links_not_self check (coach_id <> athlete_id),
  constraint coach_links_inviter check (invited_by in (coach_id, athlete_id))
);
comment on table public.coach_links is 'Chi segue chi. pending -> active (conferma dell''altra persona) -> ended.';

create unique index coach_links_open_uq on public.coach_links (coach_id, athlete_id) where status <> 'ended';
create index coach_links_athlete_idx on public.coach_links (athlete_id);
create index coach_links_invited_by_idx on public.coach_links (invited_by);

create trigger coach_links_updated_at before update on public.coach_links
  for each row execute function private.set_updated_at();

-- Regole sui cambi di stato (valgono per gli utenti dell'app, non per le migrazioni).
create or replace function private.coach_links_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not private.is_end_user() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'A new coach link must start as pending';
    end if;
    if new.can_edit_plan and new.invited_by <> new.athlete_id then
      raise exception 'Only the athlete can allow plan editing';
    end if;
    new.activated_at := null;
    new.ended_at := null;
    return new;
  end if;

  -- UPDATE
  if new.coach_id <> old.coach_id or new.athlete_id <> old.athlete_id or new.invited_by <> old.invited_by then
    raise exception 'Coach, athlete and inviter cannot change';
  end if;
  if old.status = 'ended' then
    raise exception 'An ended coach link cannot change';
  end if;
  if new.can_edit_plan <> old.can_edit_plan and me <> old.athlete_id then
    raise exception 'Only the athlete can allow plan editing';
  end if;
  if new.status <> old.status then
    if new.status = 'active' and old.status = 'pending' then
      if me = old.invited_by then
        raise exception 'The invitation must be accepted by the other person';
      end if;
      new.activated_at := now();
    elsif new.status = 'ended' then
      new.ended_at := now();
    else
      raise exception 'Invalid coach link status change: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end
$$;

create trigger coach_links_guard before insert or update on public.coach_links
  for each row execute function private.coach_links_guard();

-- ---------------------------------------------------------------------
-- Funzioni per le regole di accesso (security definer: leggono coach_links
-- senza passare dalle sue regole, così non si creano giri infiniti).
-- ---------------------------------------------------------------------

-- Io sono il coach attivo di questo atleta?
create or replace function private.is_coach_of(athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_links l
    where l.coach_id = (select auth.uid())
      and l.athlete_id = athlete
      and l.status = 'active'
  )
$$;

-- Posso leggere i dati di questo utente? (sono io, oppure sono il suo coach attivo)
create or replace function private.can_read_user(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(owner = (select auth.uid()), false) or private.is_coach_of(owner)
$$;

-- Posso modificare il piano di questo utente? (sono io, oppure coach attivo con permesso)
create or replace function private.can_edit_plan_of(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(owner = (select auth.uid()), false)
      or exists (
        select 1 from public.coach_links l
        where l.coach_id = (select auth.uid())
          and l.athlete_id = owner
          and l.status = 'active'
          and l.can_edit_plan
      )
$$;

-- Io e questa persona abbiamo un collegamento coach (aperto, in qualsiasi direzione)?
create or replace function private.is_linked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.coach_links l
    where l.status <> 'ended'
      and ((l.coach_id = (select auth.uid()) and l.athlete_id = other)
        or (l.athlete_id = (select auth.uid()) and l.coach_id = other))
  )
$$;

-- ---------------------------------------------------------------------
-- Registro importazioni. Ogni importazione appartiene a un utente che esiste
-- in Supabase Auth (chiave esterna su auth.users). Ogni riga importata porta
-- import_id + user_id, e il database controlla che siano dello stesso utente.
-- Per annullare un'importazione: si cancellano le righe con quell'import_id
-- e la si segna "rolled_back".
-- ---------------------------------------------------------------------
create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  source        text not null check (source in ('sheet-gym', 'sheet-comeback', 'macrofactor', 'csv', 'excel', 'health', 'other')),
  kind          text not null check (kind in ('training', 'plan', 'body', 'mixed')),
  file_name     text check (char_length(file_name) <= 255),
  status        text not null default 'running' check (status in ('running', 'done', 'failed', 'rolled-back')),
  rows_read     integer check (rows_read >= 0),
  rows_imported integer check (rows_imported >= 0),
  rows_skipped  integer check (rows_skipped >= 0),
  notes         text,
  created_by    uuid references auth.users (id) on delete set null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  constraint import_batches_id_user_uq unique (id, user_id)
);
comment on table public.import_batches is 'Registro delle importazioni (fogli Google, MacroFactor, CSV...). Ogni importazione è legata a un utente esistente in auth.users.';

create index import_batches_user_idx on public.import_batches (user_id);
create index import_batches_created_by_idx on public.import_batches (created_by);

-- ---------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.coach_links enable row level security;
alter table public.import_batches enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_linked_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy coach_links_select on public.coach_links for select to authenticated
  using ((select auth.uid()) in (coach_id, athlete_id));
create policy coach_links_insert on public.coach_links for insert to authenticated
  with check (invited_by = (select auth.uid()) and (select auth.uid()) in (coach_id, athlete_id));
create policy coach_links_update on public.coach_links for update to authenticated
  using ((select auth.uid()) in (coach_id, athlete_id))
  with check ((select auth.uid()) in (coach_id, athlete_id));

create policy import_batches_select on public.import_batches for select to authenticated
  using (private.can_read_user(user_id));
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (user_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy import_batches_update on public.import_batches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
