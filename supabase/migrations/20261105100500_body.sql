-- =====================================================================
-- 06 · Dati del corpo: una riga al giorno (peso, passi, kcal, macro) e
--      misure corporee. Arrivano a mano o da file (MacroFactor, CSV...).
-- =====================================================================

create table public.body_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  metric_date  date not null,
  weight_kg    numeric(5, 2) check (weight_kg between 20 and 400),
  steps        integer check (steps between 0 and 200000),
  kcal         integer check (kcal between 0 and 20000),
  protein_g    numeric(6, 1) check (protein_g between 0 and 2000),
  carbs_g      numeric(6, 1) check (carbs_g between 0 and 3000),
  fat_g        numeric(6, 1) check (fat_g between 0 and 1000),
  body_fat_pct numeric(4, 1) check (body_fat_pct between 1 and 75),
  notes        text,
  source       text not null default 'manual' check (source in ('manual', 'macrofactor', 'import', 'health')),
  import_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint body_metrics_day_uq unique (user_id, metric_date),
  constraint body_metrics_import_fk foreign key (import_id, user_id)
    references public.import_batches (id, user_id)
);
comment on table public.body_metrics is 'Una riga per giorno: peso, passi, kcal, macro, % grasso (oggi STORICO_METRICS).';
create index body_metrics_import_idx on public.body_metrics (import_id, user_id);

create table public.body_measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  measured_on date not null,
  kind        text not null check (private.is_code(kind)),
  value       numeric(6, 2) not null check (value > 0),
  unit        text not null default 'cm' check (unit in ('cm', 'in', 'mm', 'pct')),
  source      text not null default 'manual' check (source in ('manual', 'macrofactor', 'import', 'health')),
  import_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint body_measurements_uq unique (user_id, measured_on, kind),
  constraint body_measurements_import_fk foreign key (import_id, user_id)
    references public.import_batches (id, user_id)
);
comment on table public.body_measurements is 'Misure corporee (vita, fianchi...) una per tipo e per data (oggi il foglio MISURE). kind = codice, es. "waist".';
create index body_measurements_import_idx on public.body_measurements (import_id, user_id);

create trigger body_metrics_updated_at      before update on public.body_metrics      for each row execute function private.set_updated_at();
create trigger body_measurements_updated_at before update on public.body_measurements for each row execute function private.set_updated_at();

alter table public.body_metrics enable row level security;
alter table public.body_measurements enable row level security;

create policy body_metrics_select on public.body_metrics for select to authenticated
  using (private.can_read_user(user_id));
create policy body_metrics_insert on public.body_metrics for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy body_metrics_update on public.body_metrics for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_metrics_delete on public.body_metrics for delete to authenticated
  using (user_id = (select auth.uid()));

create policy body_measurements_select on public.body_measurements for select to authenticated
  using (private.can_read_user(user_id));
create policy body_measurements_insert on public.body_measurements for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy body_measurements_update on public.body_measurements for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy body_measurements_delete on public.body_measurements for delete to authenticated
  using (user_id = (select auth.uid()));
