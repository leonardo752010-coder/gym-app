-- =====================================================================
-- 04 · Piano (cosa fare): piani, settimane del mesociclo, giorni,
--      superserie (gruppi di esercizi), esercizi del giorno, macchine per club.
--
-- Ogni tabella porta user_id (il proprietario del piano = l'atleta) e una
-- chiave esterna doppia (id del genitore + user_id): il database garantisce
-- che un pezzo di piano non possa finire nel piano di un'altra persona.
-- Leggono: il proprietario e il suo coach. Scrivono: il proprietario, e il
-- coach solo se l'atleta gliel'ha permesso.
-- =====================================================================

create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  phase            text check (phase in ('bulk', 'cut', 'maintenance', 'other')),
  progression_mode text not null default 'by-sessions' check (progression_mode in ('by-sessions', 'by-date')),
  start_date       date,
  is_active        boolean not null default false,
  notes            text,
  created_by       uuid references public.profiles (id) on delete set null,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint plans_id_user_uq unique (id, user_id),
  constraint plans_active_not_archived check (not (is_active and archived_at is not null))
);
comment on table public.plans is 'Piani di allenamento. Uno solo attivo per utente. progression_mode: si avanza per allenamenti fatti o per data.';
create unique index plans_one_active on public.plans (user_id) where is_active;
create index plans_created_by_idx on public.plans (created_by);

-- Settimane del mesociclo (facoltative): RIR e volume per settimana, deload.
create table public.plan_weeks (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null,
  user_id       uuid not null,
  week_number   smallint not null check (week_number between 1 and 52),
  label         text check (char_length(label) <= 80),
  rir_min       numeric(3, 1) check (rir_min between 0 and 10),
  rir_max       numeric(3, 1) check (rir_max between 0 and 10),
  volume_factor numeric(3, 2) not null default 1 check (volume_factor > 0 and volume_factor <= 3),
  is_deload     boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint plan_weeks_plan_fk foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade,
  constraint plan_weeks_number_uq unique (plan_id, week_number),
  constraint plan_weeks_rir_range check (rir_max is null or rir_min is null or rir_max >= rir_min)
);
comment on table public.plan_weeks is 'Settimane del mesociclo: RIR obiettivo, moltiplicatore di volume, deload.';
create index plan_weeks_user_idx on public.plan_weeks (user_id);

-- Giorni del piano, in rotazione (position = ordine nella rotazione).
create table public.plan_days (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null,
  user_id     uuid not null,
  position    smallint not null check (position between 1 and 50),
  code        text check (char_length(code) <= 20),
  name        text not null check (char_length(name) between 1 and 80),
  weekday     smallint check (weekday between 1 and 7),
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint plan_days_plan_fk foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade,
  constraint plan_days_id_user_uq unique (id, user_id),
  constraint plan_days_position_uq unique (plan_id, position) deferrable initially deferred
);
comment on table public.plan_days is 'Giorni del piano (Upper A, Lower B...). weekday (1 = lunedì) serve solo se il piano avanza per data.';
create index plan_days_user_idx on public.plan_days (user_id);

-- Superserie: un gruppo di esercizi dello stesso giorno, fatti a giro,
-- con un solo recupero a fine giro.
create table public.plan_supersets (
  id           uuid primary key default gen_random_uuid(),
  plan_day_id  uuid not null,
  user_id      uuid not null,
  label        text check (char_length(label) <= 20),
  rest_seconds integer check (rest_seconds between 0 and 3600),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint plan_supersets_day_fk foreign key (plan_day_id, user_id) references public.plan_days (id, user_id) on delete cascade,
  constraint plan_supersets_id_day_uq unique (id, plan_day_id)
);
comment on table public.plan_supersets is 'Superserie del piano: gruppo di esercizi con un solo recupero (rest_seconds) a fine giro.';
create index plan_supersets_day_idx on public.plan_supersets (plan_day_id, user_id);
create index plan_supersets_user_idx on public.plan_supersets (user_id);

-- Esercizi del giorno.
create table public.plan_exercises (
  id                   uuid primary key default gen_random_uuid(),
  plan_day_id          uuid not null,
  user_id              uuid not null,
  position             smallint not null check (position between 1 and 100),
  exercise_id          uuid not null references public.exercises (id),
  superset_id          uuid,
  sets                 smallint not null default 3 check (sets between 0 and 20),
  sets_max             smallint check (sets_max between 1 and 20),
  reps_min             smallint check (reps_min between 1 and 200),
  reps_max             smallint check (reps_max between 1 and 200),
  rir_min              numeric(3, 1) check (rir_min between 0 and 10),
  rir_max              numeric(3, 1) check (rir_max between 0 and 10),
  rest_seconds         integer check (rest_seconds between 0 and 3600),
  set_type             text not null default 'normal' references public.set_types (code),
  progression_method   text not null default 'double-progression'
                       check (progression_method in ('double-progression', 'linear', 'rir', 'none', 'custom')),
  progression_settings jsonb not null default '{}' check (jsonb_typeof(progression_settings) = 'object'),
  notes                text,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint plan_exercises_day_fk foreign key (plan_day_id, user_id) references public.plan_days (id, user_id) on delete cascade,
  constraint plan_exercises_superset_fk foreign key (superset_id, plan_day_id)
    references public.plan_supersets (id, plan_day_id) on delete set null (superset_id),
  constraint plan_exercises_id_user_uq unique (id, user_id),
  constraint plan_exercises_position_uq unique (plan_day_id, position) deferrable initially deferred,
  constraint plan_exercises_sets_range check (sets_max is null or sets_max >= sets),
  constraint plan_exercises_reps_range check (reps_max is null or reps_min is null or reps_max >= reps_min),
  constraint plan_exercises_rir_range check (rir_max is null or rir_min is null or rir_max >= rir_min)
);
comment on table public.plan_exercises is 'Esercizi di un giorno: serie (sets, fino a sets_max), reps min/max, RIR, recupero tra le serie, metodo di progressione. In una superserie conta il recupero della superserie.';
comment on column public.plan_exercises.sets is '0 = esercizio tenuto nel piano ma fuori dal volume.';
comment on column public.plan_exercises.superset_id is 'Superserie a cui appartiene. Gli esercizi di una superserie stanno in posizioni consecutive; l''ordine nel giro è position.';
create index plan_exercises_user_idx on public.plan_exercises (user_id);
create index plan_exercises_exercise_idx on public.plan_exercises (exercise_id);
create index plan_exercises_superset_idx on public.plan_exercises (superset_id, plan_day_id);
create index plan_exercises_set_type_idx on public.plan_exercises (set_type);

-- Macchina per club (e macchina alternativa) per ogni esercizio del piano.
create table public.plan_exercise_machines (
  plan_exercise_id uuid not null,
  user_id          uuid not null,
  club_id          uuid not null references public.clubs (id) on delete cascade,
  machine_id       uuid references public.machines (id) on delete set null,
  alt_machine_id   uuid references public.machines (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (plan_exercise_id, club_id),
  constraint plan_exercise_machines_ex_fk foreign key (plan_exercise_id, user_id)
    references public.plan_exercises (id, user_id) on delete cascade,
  constraint plan_exercise_machines_alt_differs check (alt_machine_id is null or alt_machine_id <> machine_id)
);
comment on table public.plan_exercise_machines is 'Per ogni esercizio del piano: la macchina da usare in ogni club e una alternativa.';
create index plan_exercise_machines_user_idx on public.plan_exercise_machines (plan_exercise_id, user_id);
create index plan_exercise_machines_owner_idx on public.plan_exercise_machines (user_id);
create index plan_exercise_machines_club_idx on public.plan_exercise_machines (club_id);
create index plan_exercise_machines_machine_idx on public.plan_exercise_machines (machine_id);
create index plan_exercise_machines_alt_idx on public.plan_exercise_machines (alt_machine_id);

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
create trigger plans_updated_at                  before update on public.plans                  for each row execute function private.set_updated_at();
create trigger plan_weeks_updated_at             before update on public.plan_weeks             for each row execute function private.set_updated_at();
create trigger plan_days_updated_at              before update on public.plan_days              for each row execute function private.set_updated_at();
create trigger plan_supersets_updated_at         before update on public.plan_supersets         for each row execute function private.set_updated_at();
create trigger plan_exercises_updated_at         before update on public.plan_exercises         for each row execute function private.set_updated_at();
create trigger plan_exercise_machines_updated_at before update on public.plan_exercise_machines for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.plan_weeks enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_supersets enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.plan_exercise_machines enable row level security;

-- plans
create policy plans_select on public.plans for select to authenticated
  using (private.can_read_user(user_id));
create policy plans_insert on public.plans for insert to authenticated
  with check (private.can_edit_plan_of(user_id) and created_by = (select auth.uid()));
create policy plans_update on public.plans for update to authenticated
  using (private.can_edit_plan_of(user_id)) with check (private.can_edit_plan_of(user_id));
create policy plans_delete on public.plans for delete to authenticated
  using (private.can_edit_plan_of(user_id));

-- plan_weeks, plan_days, plan_supersets: stessa regola
create policy plan_weeks_select on public.plan_weeks for select to authenticated
  using (private.can_read_user(user_id));
create policy plan_weeks_insert on public.plan_weeks for insert to authenticated
  with check (private.can_edit_plan_of(user_id));
create policy plan_weeks_update on public.plan_weeks for update to authenticated
  using (private.can_edit_plan_of(user_id)) with check (private.can_edit_plan_of(user_id));
create policy plan_weeks_delete on public.plan_weeks for delete to authenticated
  using (private.can_edit_plan_of(user_id));

create policy plan_days_select on public.plan_days for select to authenticated
  using (private.can_read_user(user_id));
create policy plan_days_insert on public.plan_days for insert to authenticated
  with check (private.can_edit_plan_of(user_id));
create policy plan_days_update on public.plan_days for update to authenticated
  using (private.can_edit_plan_of(user_id)) with check (private.can_edit_plan_of(user_id));
create policy plan_days_delete on public.plan_days for delete to authenticated
  using (private.can_edit_plan_of(user_id));

create policy plan_supersets_select on public.plan_supersets for select to authenticated
  using (private.can_read_user(user_id));
create policy plan_supersets_insert on public.plan_supersets for insert to authenticated
  with check (private.can_edit_plan_of(user_id));
create policy plan_supersets_update on public.plan_supersets for update to authenticated
  using (private.can_edit_plan_of(user_id)) with check (private.can_edit_plan_of(user_id));
create policy plan_supersets_delete on public.plan_supersets for delete to authenticated
  using (private.can_edit_plan_of(user_id));

-- plan_exercises: in più, esercizio e tipo di serie devono essere utilizzabili dall'atleta
create policy plan_exercises_select on public.plan_exercises for select to authenticated
  using (private.can_read_user(user_id));
create policy plan_exercises_insert on public.plan_exercises for insert to authenticated
  with check (private.can_edit_plan_of(user_id)
              and private.exercise_usable(exercise_id, user_id)
              and private.set_type_usable(set_type, user_id));
create policy plan_exercises_update on public.plan_exercises for update to authenticated
  using (private.can_edit_plan_of(user_id))
  with check (private.can_edit_plan_of(user_id)
              and private.exercise_usable(exercise_id, user_id)
              and private.set_type_usable(set_type, user_id));
create policy plan_exercises_delete on public.plan_exercises for delete to authenticated
  using (private.can_edit_plan_of(user_id));

-- plan_exercise_machines: club e macchine utilizzabili dall'atleta
create policy plan_exercise_machines_select on public.plan_exercise_machines for select to authenticated
  using (private.can_read_user(user_id));
create policy plan_exercise_machines_insert on public.plan_exercise_machines for insert to authenticated
  with check (private.can_edit_plan_of(user_id)
              and private.club_usable(club_id, user_id)
              and private.machine_usable(machine_id, user_id)
              and private.machine_usable(alt_machine_id, user_id));
create policy plan_exercise_machines_update on public.plan_exercise_machines for update to authenticated
  using (private.can_edit_plan_of(user_id))
  with check (private.can_edit_plan_of(user_id)
              and private.club_usable(club_id, user_id)
              and private.machine_usable(machine_id, user_id)
              and private.machine_usable(alt_machine_id, user_id));
create policy plan_exercise_machines_delete on public.plan_exercise_machines for delete to authenticated
  using (private.can_edit_plan_of(user_id));
