-- =====================================================================
-- 11 · Cambiare l'esercizio di una riga del piano (Programma → Modifica → "Cambia esercizio")
--
-- Una sola funzione, public.change_plan_exercise, che in UNA operazione
-- (tutto o niente) fa:
--   1. (facoltativo) crea un esercizio nuovo, privato dell'atleta, dal solo nome;
--   2. cambia exercise_id della riga di plan_exercises (stesso id della riga:
--      giorno, posizione, serie, rep, RIR, recupero e note restano com'erano);
--   3. rifà le macchine di quella riga per ogni palestra (plan_exercise_machines):
--      macchina e alternativa scelte, oppure "nessuna macchina" (machine_id vuoto).
--      Le righe delle palestre non mandate restano, ma senza macchina.
--      Niente righe cancellate.
-- Se un passo non va, si annulla tutto.
--
-- Regole di accesso: SECURITY INVOKER, cioè la funzione lavora con i permessi
-- di chi la chiama, quindi valgono le regole (RLS) di sempre: il piano
-- dell'atleta sì (o del coach con il permesso), quello di un altro no.
-- (La prova 000_schema vieta funzioni pubbliche SECURITY DEFINER.)
--
-- Blocco: se su quella riga del piano ci sono serie registrate OGGI (data del
-- telefono, p_today; altrimenti la data del database), il cambio è rifiutato.
-- Le sedute vecchie non si toccano mai: restano legate al vecchio esercizio,
-- alla vecchia macchina e ai loro obiettivi (target_*).
--
-- Errori (codice → l'app mostra un messaggio in italiano / inglese):
--   GE001 riga del piano non trovata o non modificabile da questo account
--   GE002 ci sono serie registrate oggi su questa riga
--   GE003 macchine non valide (palestra non del piano, macchina non di quella
--         palestra, alternativa senza macchina o uguale alla macchina, palestra doppia)
--   GE004 esercizio non trovato o non utilizzabile
--   GE005 nome del nuovo esercizio non valido (vuoto o più di 80 caratteri)
--
-- Applicata SOLO al database locale (2026-11-13). Online solo con l'ok di Leonardo.
-- =====================================================================

create or replace function public.change_plan_exercise(
  p_plan_exercise_id  uuid,
  p_exercise_id       uuid default null,
  p_machines          jsonb default '[]'::jsonb,
  p_new_exercise_name text default null,
  p_today             date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r        record;
  v_plan   uuid;
  v_ex     uuid;
  v_name   text;
  v_slug   text;
  v_today  date := coalesce(p_today, current_date);
  m        jsonb;
  v_club   uuid;
  v_mac    uuid;
  v_alt    uuid;
  v_clubs  uuid[] := '{}';
begin
  -- 1. la riga del piano: deve essere visibile e modificabile da chi chiama
  select pe.id, pe.user_id, pe.exercise_id, pe.plan_day_id into r
    from public.plan_exercises pe where pe.id = p_plan_exercise_id
    for update;
  if not found or not private.can_edit_plan_of(r.user_id) then
    raise exception 'plan exercise not found or not editable' using errcode = 'GE001';
  end if;
  select d.plan_id into v_plan from public.plan_days d where d.id = r.plan_day_id;

  -- 2. niente cambio se oggi ci sono già serie su questa riga
  if exists (
    select 1
      from public.sets s
      join public.session_exercises se on se.id = s.session_exercise_id
      join public.sessions ss on ss.id = se.session_id
     where se.plan_exercise_id = r.id
       and ss.session_date = v_today
       and s.deleted_at is null and se.deleted_at is null and ss.deleted_at is null
  ) then
    raise exception 'sets already logged today on this plan exercise' using errcode = 'GE002';
  end if;

  -- 3. esercizio: nuovo (dal nome) oppure uno della libreria utilizzabile dall'atleta
  if p_new_exercise_name is not null then
    v_name := btrim(p_new_exercise_name);
    if v_name = '' or char_length(v_name) > 80 then
      raise exception 'new exercise name not valid' using errcode = 'GE005';
    end if;
    v_slug := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
    v_slug := btrim(left(v_slug, 50), '-');
    if v_slug = '' then v_slug := 'esercizio'; end if;
    insert into public.exercises (code, name, equipment, visibility, verified, created_by)
    values ('u-' || v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 8),
            jsonb_build_object('it', v_name, 'en', v_name), 'other', 'private', false, (select auth.uid()))
    returning id into v_ex;
  else
    v_ex := p_exercise_id;
  end if;
  if v_ex is null or not private.exercise_usable(v_ex, r.user_id) then
    raise exception 'exercise not found or not usable' using errcode = 'GE004';
  end if;

  update public.plan_exercises set exercise_id = v_ex where id = r.id;

  -- 4. macchine per palestra: [{ "club_id": ..., "machine_id": ... | null, "alt_machine_id": ... | null }]
  if p_machines is null or jsonb_typeof(p_machines) <> 'array' then
    raise exception 'machines must be a list' using errcode = 'GE003';
  end if;
  for m in select * from jsonb_array_elements(p_machines) loop
    v_club := nullif(m->>'club_id', '')::uuid;
    v_mac  := nullif(m->>'machine_id', '')::uuid;
    v_alt  := nullif(m->>'alt_machine_id', '')::uuid;
    if v_club is null or v_club = any(v_clubs) then
      raise exception 'club missing or repeated' using errcode = 'GE003';
    end if;
    v_clubs := v_clubs || v_club;
    -- palestra dell'atleta, o già usata nel suo piano
    if not (exists (select 1 from public.user_clubs uc where uc.user_id = r.user_id and uc.club_id = v_club)
         or exists (select 1 from public.plan_exercise_machines pem
                      join public.plan_exercises pe2 on pe2.id = pem.plan_exercise_id
                      join public.plan_days d2 on d2.id = pe2.plan_day_id
                     where d2.plan_id = v_plan and pem.club_id = v_club)) then
      raise exception 'club not in this plan' using errcode = 'GE003';
    end if;
    -- macchina e alternativa: tra quelle già in quella palestra; alternativa solo con una macchina, e diversa
    if v_alt is not null and (v_mac is null or v_alt = v_mac) then
      raise exception 'alternative machine not valid' using errcode = 'GE003';
    end if;
    if (v_mac is not null and not exists (select 1 from public.club_machines cm where cm.club_id = v_club and cm.machine_id = v_mac))
       or (v_alt is not null and not exists (select 1 from public.club_machines cm where cm.club_id = v_club and cm.machine_id = v_alt)) then
      raise exception 'machine not in this club' using errcode = 'GE003';
    end if;
    insert into public.plan_exercise_machines (plan_exercise_id, user_id, club_id, machine_id, alt_machine_id)
    values (r.id, r.user_id, v_club, v_mac, v_alt)
    on conflict (plan_exercise_id, club_id)
    do update set machine_id = excluded.machine_id, alt_machine_id = excluded.alt_machine_id;
  end loop;
  -- palestre non mandate: restano, ma senza macchina (nessuna riga cancellata)
  update public.plan_exercise_machines
     set machine_id = null, alt_machine_id = null
   where plan_exercise_id = r.id and not (club_id = any(v_clubs))
     and (machine_id is not null or alt_machine_id is not null);

  return jsonb_build_object('plan_exercise_id', r.id, 'exercise_id', v_ex, 'old_exercise_id', r.exercise_id, 'created', p_new_exercise_name is not null);
end;
$$;

comment on function public.change_plan_exercise(uuid, uuid, jsonb, text, date) is
  'Cambia l''esercizio di una riga del piano e le sue macchine per palestra, tutto o niente (SECURITY INVOKER: valgono le RLS). Rifiuta se oggi ci sono serie su quella riga.';

revoke execute on function public.change_plan_exercise(uuid, uuid, jsonb, text, date) from public, anon;
grant execute on function public.change_plan_exercise(uuid, uuid, jsonb, text, date) to authenticated, service_role;
