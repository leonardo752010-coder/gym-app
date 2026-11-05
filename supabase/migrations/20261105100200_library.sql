-- =====================================================================
-- 03 · Libreria condivisa: muscoli, esercizi, tipi di serie, catene,
--      club, macchine, club frequentati.
--
-- Regola comune per esercizi, macchine, club, catene e tipi di serie:
--   * "public"  = visibile a tutti; oggi la crea/modifica solo l'importazione
--                 o la manutenzione (service_role), mai un utente dall'app.
--   * "private" = visibile solo a chi l'ha creata (e al suo coach).
--   * verified  = controllata da noi. Un utente non può segnarla da solo.
-- Così la decisione ancora aperta ("macchine degli utenti pubbliche subito o
-- dopo conferma") si potrà prendere dopo senza cambiare le tabelle.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Muscoli (elenco fisso, serve per il volume per muscolo)
-- ---------------------------------------------------------------------
create table public.muscles (
  code        text primary key check (private.is_code(code)),
  name        jsonb not null check (private.is_i18n(name)),
  body_region text not null check (body_region in ('upper', 'lower', 'core')),
  position    smallint not null default 100
);
comment on table public.muscles is 'Elenco fisso dei muscoli (dati di riferimento, non modificabili dall''app).';

insert into public.muscles (code, name, body_region, position) values
  ('chest',       '{"it": "Petto",               "en": "Chest"}',          'upper', 10),
  ('lats',        '{"it": "Dorsali",             "en": "Lats"}',           'upper', 20),
  ('upper-back',  '{"it": "Dorso alto",          "en": "Upper back"}',     'upper', 30),
  ('traps',       '{"it": "Trapezi",             "en": "Traps"}',          'upper', 40),
  ('front-delts', '{"it": "Deltoidi anteriori",  "en": "Front delts"}',    'upper', 50),
  ('side-delts',  '{"it": "Deltoidi laterali",   "en": "Side delts"}',     'upper', 60),
  ('rear-delts',  '{"it": "Deltoidi posteriori", "en": "Rear delts"}',     'upper', 70),
  ('biceps',      '{"it": "Bicipiti",            "en": "Biceps"}',         'upper', 80),
  ('triceps',     '{"it": "Tricipiti",           "en": "Triceps"}',        'upper', 90),
  ('forearms',    '{"it": "Avambracci",          "en": "Forearms"}',       'upper', 100),
  ('abs',         '{"it": "Addominali",          "en": "Abs"}',            'core',  110),
  ('obliques',    '{"it": "Obliqui",             "en": "Obliques"}',       'core',  120),
  ('lower-back',  '{"it": "Lombari",             "en": "Lower back"}',     'core',  130),
  ('glutes',      '{"it": "Glutei",              "en": "Glutes"}',         'lower', 140),
  ('quads',       '{"it": "Quadricipiti",        "en": "Quads"}',          'lower', 150),
  ('hamstrings',  '{"it": "Femorali",            "en": "Hamstrings"}',     'lower', 160),
  ('adductors',   '{"it": "Adduttori",           "en": "Adductors"}',      'lower', 170),
  ('abductors',   '{"it": "Abduttori",           "en": "Abductors"}',      'lower', 180),
  ('calves',      '{"it": "Polpacci",            "en": "Calves"}',         'lower', 190);

-- ---------------------------------------------------------------------
-- Esercizi: il movimento. Codice fisso: il nome si può cambiare, lo storico resta.
-- ---------------------------------------------------------------------
create table public.exercises (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (private.is_code(code)),
  name          jsonb not null check (private.is_i18n(name)),
  equipment     text not null default 'other'
                check (equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight', 'kettlebell', 'band', 'other')),
  is_unilateral boolean not null default false,
  visibility    text not null default 'private' check (visibility in ('private', 'public')),
  verified      boolean not null default false,
  created_by    uuid references public.profiles (id) on delete cascade,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint exercises_private_has_owner check (visibility = 'public' or created_by is not null)
);
comment on table public.exercises is 'Esercizi (movimento). code non cambia mai; name è traducibile.';
create index exercises_created_by_idx on public.exercises (created_by);

-- Muscoli coinvolti, con il peso per il calcolo del volume (di base 1 principale, 0,5 secondario).
create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_code text not null references public.muscles (code),
  role        text not null default 'primary' check (role in ('primary', 'secondary')),
  weight      numeric(3, 2) not null check (weight > 0 and weight <= 1),
  primary key (exercise_id, muscle_code)
);
comment on table public.exercise_muscles is 'Quanto conta una serie di questo esercizio per ogni muscolo (1 = intera, 0,5 = mezza).';
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_code);

-- ---------------------------------------------------------------------
-- Tipi di serie. Quelli di sistema hanno created_by vuoto; l'utente può crearne di suoi.
-- La superserie NON è un tipo di serie: è un gruppo di esercizi (vedi piano e log).
-- ---------------------------------------------------------------------
create table public.set_types (
  code              text primary key check (private.is_code(code)),
  name              jsonb not null check (private.is_i18n(name)),
  counts_as_working boolean not null default true,
  allows_parts      boolean not null default false,
  position          smallint not null default 100,
  created_by        uuid references public.profiles (id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.set_types is 'Tipi di serie. counts_as_working = conta nel volume; allows_parts = può avere più parti (drop, rest-pause, myo-reps).';
create index set_types_created_by_idx on public.set_types (created_by);

insert into public.set_types (code, name, counts_as_working, allows_parts, position) values
  ('normal',     '{"it": "Normale",        "en": "Normal"}',     true,  false, 10),
  ('warmup',     '{"it": "Riscaldamento",  "en": "Warm-up"}',    false, false, 20),
  ('drop',       '{"it": "Drop set",       "en": "Drop set"}',   true,  true,  30),
  ('rest-pause', '{"it": "Rest-pause",     "en": "Rest-pause"}', true,  true,  40),
  ('myo-reps',   '{"it": "Myo-reps",       "en": "Myo-reps"}',   true,  true,  50);

-- ---------------------------------------------------------------------
-- Catene di palestre e club
-- ---------------------------------------------------------------------
create table public.club_chains (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  visibility  text not null default 'private' check (visibility in ('private', 'public')),
  verified    boolean not null default false,
  created_by  uuid references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint club_chains_private_has_owner check (visibility = 'public' or created_by is not null)
);
comment on table public.club_chains is 'Catene di palestre (più club possono appartenere alla stessa catena).';
create index club_chains_created_by_idx on public.club_chains (created_by);

create table public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  chain_id    uuid references public.club_chains (id) on delete set null,
  city        text check (char_length(city) <= 120),
  country     text check (country ~ '^[A-Z]{2}$'),
  address     text check (char_length(address) <= 255),
  visibility  text not null default 'private' check (visibility in ('private', 'public')),
  verified    boolean not null default false,
  created_by  uuid references public.profiles (id) on delete cascade,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clubs_private_has_owner check (visibility = 'public' or created_by is not null)
);
comment on table public.clubs is 'Palestre. Condivise come le macchine (pubbliche o private, verificate o no).';
create index clubs_chain_idx on public.clubs (chain_id);
create index clubs_created_by_idx on public.clubs (created_by);

-- ---------------------------------------------------------------------
-- Macchine: marca, modello, codice del produttore, salti di peso.
-- ---------------------------------------------------------------------
create table public.machines (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (private.is_code(code)),
  brand        text check (char_length(brand) <= 80),
  model        text check (char_length(model) <= 120),
  brand_code   text check (char_length(brand_code) <= 80),
  name         jsonb check (name is null or private.is_i18n(name)),
  machine_type text not null default 'other'
               check (machine_type in ('selectorized', 'plate-loaded', 'cable', 'smith', 'free-weight', 'bodyweight', 'other')),
  weight_unit  text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  weight_min   numeric(7, 2) check (weight_min >= 0),
  weight_max   numeric(7, 2),
  weight_step  numeric(6, 2) check (weight_step > 0),
  weight_list  numeric(7, 2)[],
  notes        text,
  visibility   text not null default 'private' check (visibility in ('private', 'public')),
  verified     boolean not null default false,
  created_by   uuid references public.profiles (id) on delete cascade,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint machines_private_has_owner check (visibility = 'public' or created_by is not null),
  constraint machines_weight_range check (weight_max is null or weight_min is null or weight_max >= weight_min),
  constraint machines_has_identity check (brand is not null or model is not null or name is not null)
);
comment on table public.machines is 'Macchine. Si cercano per code (nostro), brand_code (del produttore) o marca/modello. weight_list = pacco con salti irregolari.';
create index machines_created_by_idx on public.machines (created_by);
create index machines_brand_model_idx on public.machines (lower(brand), lower(model));
create index machines_brand_code_idx on public.machines (lower(brand_code));

-- Quali esercizi si fanno su una macchina.
create table public.machine_exercises (
  machine_id  uuid not null references public.machines (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  primary key (machine_id, exercise_id)
);
create index machine_exercises_exercise_idx on public.machine_exercises (exercise_id);

-- Macchine presenti in un club.
create table public.club_machines (
  club_id    uuid not null references public.clubs (id) on delete cascade,
  machine_id uuid not null references public.machines (id) on delete cascade,
  quantity   smallint not null default 1 check (quantity between 1 and 99),
  notes      text check (char_length(notes) <= 255),
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (club_id, machine_id)
);
create index club_machines_machine_idx on public.club_machines (machine_id);
create index club_machines_added_by_idx on public.club_machines (added_by);

-- Club frequentati da ogni utente (is_home = club principale, al massimo uno).
create table public.user_clubs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  club_id    uuid not null references public.clubs (id) on delete cascade,
  is_home    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);
create unique index user_clubs_one_home on public.user_clubs (user_id) where is_home;
create index user_clubs_club_idx on public.user_clubs (club_id);

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
create trigger exercises_updated_at   before update on public.exercises   for each row execute function private.set_updated_at();
create trigger set_types_updated_at   before update on public.set_types   for each row execute function private.set_updated_at();
create trigger club_chains_updated_at before update on public.club_chains for each row execute function private.set_updated_at();
create trigger clubs_updated_at       before update on public.clubs       for each row execute function private.set_updated_at();
create trigger machines_updated_at    before update on public.machines    for each row execute function private.set_updated_at();

-- Il codice fisso non si cambia mai dall'app.
create or replace function private.keep_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code <> old.code and private.is_end_user() then
    raise exception 'The code of % cannot change', tg_table_name;
  end if;
  return new;
end
$$;

create trigger exercises_keep_code before update on public.exercises for each row execute function private.keep_code();
create trigger machines_keep_code  before update on public.machines  for each row execute function private.keep_code();
create trigger set_types_keep_code before update on public.set_types for each row execute function private.keep_code();

-- ---------------------------------------------------------------------
-- Funzioni "utilizzabile da": un elemento della libreria si può usare nei dati
-- di un utente se è pubblico oppure è suo. Usate dalle regole di piano e log.
-- ---------------------------------------------------------------------
create or replace function private.exercise_usable(item uuid, owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exercises e
                 where e.id = item and (e.visibility = 'public' or e.created_by = owner))
$$;

create or replace function private.machine_usable(item uuid, owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select item is null or exists (select 1 from public.machines m
                                 where m.id = item and (m.visibility = 'public' or m.created_by = owner))
$$;

create or replace function private.club_usable(item uuid, owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select item is null or exists (select 1 from public.clubs c
                                 where c.id = item and (c.visibility = 'public' or c.created_by = owner))
$$;

create or replace function private.set_type_usable(item text, owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.set_types t
                 where t.code = item and (t.created_by is null or t.created_by = owner))
$$;

-- ---------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------
alter table public.muscles enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.set_types enable row level security;
alter table public.club_chains enable row level security;
alter table public.clubs enable row level security;
alter table public.machines enable row level security;
alter table public.machine_exercises enable row level security;
alter table public.club_machines enable row level security;
alter table public.user_clubs enable row level security;

-- Muscoli: solo lettura.
create policy muscles_select on public.muscles for select to authenticated using (true);

-- Esercizi, macchine, club, catene: pubblici per tutti, privati per chi li ha creati (e il suo coach).
-- Un utente crea e modifica solo elementi privati e non verificati.
create policy exercises_select on public.exercises for select to authenticated
  using (visibility = 'public' or private.can_read_user(created_by));
create policy exercises_insert on public.exercises for insert to authenticated
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified);
create policy exercises_update on public.exercises for update to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private')
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified);
create policy exercises_delete on public.exercises for delete to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private');

create policy machines_select on public.machines for select to authenticated
  using (visibility = 'public' or private.can_read_user(created_by));
create policy machines_insert on public.machines for insert to authenticated
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified);
create policy machines_update on public.machines for update to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private')
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified);
create policy machines_delete on public.machines for delete to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private');

create policy club_chains_select on public.club_chains for select to authenticated
  using (visibility = 'public' or private.can_read_user(created_by));
create policy club_chains_insert on public.club_chains for insert to authenticated
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified);
create policy club_chains_update on public.club_chains for update to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private')
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified);
create policy club_chains_delete on public.club_chains for delete to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private');

create policy clubs_select on public.clubs for select to authenticated
  using (visibility = 'public' or private.can_read_user(created_by));
create policy clubs_insert on public.clubs for insert to authenticated
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified
              and (chain_id is null or exists (select 1 from public.club_chains ch where ch.id = chain_id)));
create policy clubs_update on public.clubs for update to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private')
  with check (created_by = (select auth.uid()) and visibility = 'private' and not verified
              and (chain_id is null or exists (select 1 from public.club_chains ch where ch.id = chain_id)));
create policy clubs_delete on public.clubs for delete to authenticated
  using (created_by = (select auth.uid()) and visibility = 'private');

-- Muscoli di un esercizio: si leggono se si vede l'esercizio; si scrivono solo sui propri esercizi privati.
create policy exercise_muscles_select on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id));
create or replace function private.owns_private_exercise(item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exercises e
                 where e.id = item and e.created_by = (select auth.uid()) and e.visibility = 'private')
$$;
create policy exercise_muscles_insert on public.exercise_muscles for insert to authenticated
  with check (private.owns_private_exercise(exercise_id));
create policy exercise_muscles_update on public.exercise_muscles for update to authenticated
  using (private.owns_private_exercise(exercise_id)) with check (private.owns_private_exercise(exercise_id));
create policy exercise_muscles_delete on public.exercise_muscles for delete to authenticated
  using (private.owns_private_exercise(exercise_id));

-- Tipi di serie: quelli di sistema per tutti, quelli personali per chi li ha creati (e il suo coach).
create policy set_types_select on public.set_types for select to authenticated
  using (created_by is null or private.can_read_user(created_by));
create policy set_types_insert on public.set_types for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy set_types_update on public.set_types for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy set_types_delete on public.set_types for delete to authenticated
  using (created_by = (select auth.uid()));

-- Esercizi di una macchina: come sopra, scrivibili solo sulle proprie macchine private.
create policy machine_exercises_select on public.machine_exercises for select to authenticated
  using (exists (select 1 from public.machines m where m.id = machine_id));
create or replace function private.owns_private_machine(item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.machines m
                 where m.id = item and m.created_by = (select auth.uid()) and m.visibility = 'private')
$$;
create policy machine_exercises_insert on public.machine_exercises for insert to authenticated
  with check (private.owns_private_machine(machine_id) and private.exercise_usable(exercise_id, (select auth.uid())));
create policy machine_exercises_delete on public.machine_exercises for delete to authenticated
  using (private.owns_private_machine(machine_id));

-- Macchine di un club: si vedono se si vede il club.
-- Si aggiungono: nel proprio club privato (macchine proprie o pubbliche),
-- oppure in un club pubblico che si frequenta (solo macchine pubbliche).
create policy club_machines_select on public.club_machines for select to authenticated
  using (exists (select 1 from public.clubs c where c.id = club_id));
create policy club_machines_insert on public.club_machines for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and (
      exists (select 1 from public.clubs c
              where c.id = club_id and c.visibility = 'private' and c.created_by = (select auth.uid()))
        and private.machine_usable(machine_id, (select auth.uid()))
      or
      exists (select 1 from public.clubs c join public.user_clubs uc on uc.club_id = c.id
              where c.id = club_id and c.visibility = 'public' and uc.user_id = (select auth.uid()))
        and exists (select 1 from public.machines m where m.id = machine_id and m.visibility = 'public')
    ));
create policy club_machines_update on public.club_machines for update to authenticated
  using (added_by = (select auth.uid())) with check (added_by = (select auth.uid()));
create policy club_machines_delete on public.club_machines for delete to authenticated
  using (added_by = (select auth.uid())
         or exists (select 1 from public.clubs c where c.id = club_id and c.created_by = (select auth.uid()) and c.visibility = 'private'));

-- Club frequentati: ognuno gestisce i suoi; il coach li vede.
create policy user_clubs_select on public.user_clubs for select to authenticated
  using (private.can_read_user(user_id));
create policy user_clubs_insert on public.user_clubs for insert to authenticated
  with check (user_id = (select auth.uid()) and private.club_usable(club_id, (select auth.uid())));
create policy user_clubs_update on public.user_clubs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.club_usable(club_id, (select auth.uid())));
create policy user_clubs_delete on public.user_clubs for delete to authenticated
  using (user_id = (select auth.uid()));
