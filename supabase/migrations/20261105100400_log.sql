-- =====================================================================
-- 05 · Log (cosa hai fatto): sedute, superserie della seduta, esercizi
--      della seduta, serie, parti di serie.
--
-- * Separato dal piano: ogni esercizio della seduta conserva una copia
--   dell'obiettivo di quel giorno (target_*). Cambiare il piano non tocca
--   mai lo storico.
-- * Coda offline: il telefono crea l'id (uuid) di sedute, esercizi e serie
--   e lo reinvia finché il database non risponde. Lo stesso id due volte =
--   una riga sola (si inserisce con "on conflict do nothing").
-- * Niente doppioni: una sola serie N per esercizio della seduta (tra
--   quelle non cancellate).
-- * Cancellazione morbida: dall'app non si cancella; si scrive deleted_at.
-- * Lo storico lo scrive solo il proprietario. Il coach lo legge e basta.
-- =====================================================================

create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  session_date     date not null,
  started_at       timestamptz,
  ended_at         timestamptz,
  club_id          uuid references public.clubs (id) on delete set null,
  plan_id          uuid,
  plan_day_id      uuid,
  plan_week_number smallint check (plan_week_number between 1 and 52),
  day_name         text check (char_length(day_name) <= 80),
  notes            text,
  import_id        uuid,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sessions_id_user_uq unique (id, user_id),
  constraint sessions_times check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint sessions_plan_fk foreign key (plan_id, user_id)
    references public.plans (id, user_id) on delete set null (plan_id),
  constraint sessions_plan_day_fk foreign key (plan_day_id, user_id)
    references public.plan_days (id, user_id) on delete set null (plan_day_id),
  constraint sessions_import_fk foreign key (import_id, user_id)
    references public.import_batches (id, user_id)
);
comment on table public.sessions is 'Sedute. day_name = copia del nome del giorno del piano al momento della seduta.';
create index sessions_user_date_idx on public.sessions (user_id, session_date desc);
create index sessions_club_idx on public.sessions (club_id);
create index sessions_plan_idx on public.sessions (plan_id, user_id);
create index sessions_plan_day_idx on public.sessions (plan_day_id, user_id);
create index sessions_import_idx on public.sessions (import_id, user_id);

-- Superserie fatte in una seduta (un solo recupero a fine giro).
create table public.session_supersets (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null,
  user_id          uuid not null,
  plan_superset_id uuid references public.plan_supersets (id) on delete set null,
  label            text check (char_length(label) <= 20),
  rest_seconds     integer check (rest_seconds between 0 and 3600),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint session_supersets_session_fk foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete cascade,
  constraint session_supersets_id_session_uq unique (id, session_id)
);
create index session_supersets_session_idx on public.session_supersets (session_id, user_id);
create index session_supersets_user_idx on public.session_supersets (user_id);
create index session_supersets_plan_idx on public.session_supersets (plan_superset_id);

-- Esercizi fatti (o saltati) in una seduta, con la copia dell'obiettivo.
create table public.session_exercises (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null,
  user_id          uuid not null,
  position         smallint not null default 1 check (position between 1 and 100),
  exercise_id      uuid not null references public.exercises (id),
  machine_id       uuid references public.machines (id) on delete set null,
  plan_exercise_id uuid,
  superset_id      uuid,
  skipped          boolean not null default false,
  target_sets      smallint check (target_sets between 0 and 20),
  target_reps_min  smallint check (target_reps_min between 1 and 200),
  target_reps_max  smallint check (target_reps_max between 1 and 200),
  target_rir_min   numeric(3, 1) check (target_rir_min between 0 and 10),
  target_rir_max   numeric(3, 1) check (target_rir_max between 0 and 10),
  rest_seconds     integer check (rest_seconds between 0 and 3600),
  notes            text,
  import_id        uuid,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint session_exercises_id_user_uq unique (id, user_id),
  constraint session_exercises_session_fk foreign key (session_id, user_id)
    references public.sessions (id, user_id) on delete cascade,
  constraint session_exercises_plan_fk foreign key (plan_exercise_id, user_id)
    references public.plan_exercises (id, user_id) on delete set null (plan_exercise_id),
  constraint session_exercises_superset_fk foreign key (superset_id, session_id)
    references public.session_supersets (id, session_id) on delete set null (superset_id),
  constraint session_exercises_import_fk foreign key (import_id, user_id)
    references public.import_batches (id, user_id)
);
comment on table public.session_exercises is 'Esercizi di una seduta (ordine libero, si possono saltare). target_* = obiettivo copiato dal piano in quel momento.';
create index session_exercises_session_idx on public.session_exercises (session_id, user_id);
create index session_exercises_user_exercise_idx on public.session_exercises (user_id, exercise_id);
create index session_exercises_exercise_idx on public.session_exercises (exercise_id);
create index session_exercises_machine_idx on public.session_exercises (machine_id);
create index session_exercises_plan_idx on public.session_exercises (plan_exercise_id, user_id);
create index session_exercises_superset_idx on public.session_exercises (superset_id, session_id);
create index session_exercises_import_idx on public.session_exercises (import_id, user_id);

-- Serie. Il peso è sempre in kg; input_weight/input_unit = come l'hai scritto.
create table public.sets (
  id                  uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null,
  user_id             uuid not null,
  set_number          smallint not null check (set_number between 1 and 50),
  set_type            text not null default 'normal' references public.set_types (code),
  weight_kg           numeric(7, 3) check (weight_kg between 0 and 1000),
  reps                smallint not null check (reps between 0 and 200),
  rir                 numeric(3, 1) check (rir between 0 and 10),
  input_weight        numeric(7, 2) check (input_weight >= 0),
  input_unit          text check (input_unit in ('kg', 'lb')),
  performed_at        timestamptz not null default now(),
  notes               text,
  import_id           uuid,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sets_id_user_uq unique (id, user_id),
  constraint sets_input_pair check ((input_weight is null) = (input_unit is null)),
  constraint sets_session_exercise_fk foreign key (session_exercise_id, user_id)
    references public.session_exercises (id, user_id) on delete cascade,
  constraint sets_import_fk foreign key (import_id, user_id)
    references public.import_batches (id, user_id)
);
comment on table public.sets is 'Serie. id creato dal telefono (coda offline). weight_kg sempre in kg. Cancellazione morbida con deleted_at.';
create unique index sets_one_per_number on public.sets (session_exercise_id, set_number) where deleted_at is null;
create index sets_session_exercise_idx on public.sets (session_exercise_id, user_id);
create index sets_user_performed_idx on public.sets (user_id, performed_at desc);
create index sets_set_type_idx on public.sets (set_type);
create index sets_import_idx on public.sets (import_id, user_id);

-- Parti successive di una serie (drop, rest-pause, myo-reps): la parte 1 è la serie stessa.
create table public.set_parts (
  id                  uuid primary key default gen_random_uuid(),
  set_id              uuid not null,
  user_id             uuid not null,
  part_number         smallint not null check (part_number between 2 and 20),
  weight_kg           numeric(7, 3) check (weight_kg between 0 and 1000),
  reps                smallint not null check (reps between 0 and 200),
  rest_seconds_before integer check (rest_seconds_before between 0 and 600),
  input_weight        numeric(7, 2) check (input_weight >= 0),
  input_unit          text check (input_unit in ('kg', 'lb')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint set_parts_input_pair check ((input_weight is null) = (input_unit is null)),
  constraint set_parts_set_fk foreign key (set_id, user_id)
    references public.sets (id, user_id) on delete cascade,
  constraint set_parts_number_uq unique (set_id, part_number)
);
comment on table public.set_parts is 'Parti 2, 3... di una serie in più parti (drop set, rest-pause, myo-reps).';
create index set_parts_set_idx on public.set_parts (set_id, user_id);
create index set_parts_user_idx on public.set_parts (user_id);

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
create trigger sessions_updated_at          before update on public.sessions          for each row execute function private.set_updated_at();
create trigger session_supersets_updated_at before update on public.session_supersets for each row execute function private.set_updated_at();
create trigger session_exercises_updated_at before update on public.session_exercises for each row execute function private.set_updated_at();
create trigger sets_updated_at              before update on public.sets              for each row execute function private.set_updated_at();
create trigger set_parts_updated_at         before update on public.set_parts         for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Regole di accesso: legge il proprietario e il suo coach; scrive solo il
-- proprietario; nessuna cancellazione vera dall'app (tranne le parti di serie,
-- che seguono la serie).
-- ---------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.session_supersets enable row level security;
alter table public.session_exercises enable row level security;
alter table public.sets enable row level security;
alter table public.set_parts enable row level security;

create policy sessions_select on public.sessions for select to authenticated
  using (private.can_read_user(user_id));
create policy sessions_insert on public.sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.club_usable(club_id, user_id));
create policy sessions_update on public.sessions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.club_usable(club_id, user_id));

create policy session_supersets_select on public.session_supersets for select to authenticated
  using (private.can_read_user(user_id));
create policy session_supersets_insert on public.session_supersets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy session_supersets_update on public.session_supersets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy session_exercises_select on public.session_exercises for select to authenticated
  using (private.can_read_user(user_id));
create policy session_exercises_insert on public.session_exercises for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.exercise_usable(exercise_id, user_id)
              and private.machine_usable(machine_id, user_id));
create policy session_exercises_update on public.session_exercises for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and private.exercise_usable(exercise_id, user_id)
              and private.machine_usable(machine_id, user_id));

create policy sets_select on public.sets for select to authenticated
  using (private.can_read_user(user_id));
create policy sets_insert on public.sets for insert to authenticated
  with check (user_id = (select auth.uid()) and private.set_type_usable(set_type, user_id));
create policy sets_update on public.sets for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.set_type_usable(set_type, user_id));

create policy set_parts_select on public.set_parts for select to authenticated
  using (private.can_read_user(user_id));
create policy set_parts_insert on public.set_parts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy set_parts_update on public.set_parts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy set_parts_delete on public.set_parts for delete to authenticated
  using (user_id = (select auth.uid()));
