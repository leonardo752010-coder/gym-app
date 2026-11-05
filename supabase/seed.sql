-- =====================================================================
-- Dati FINTI per lo sviluppo in locale (supabase db reset).
-- Non vanno mai sul progetto vero. Nessun dato reale di Leonardo o Raina.
-- Gli utenti finti non hanno password: servono solo per le prove e per guardare i dati in Studio.
-- =====================================================================

-- Utenti finti (il profilo nasce da solo dal trigger).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'atleta.uno@example.test', '', now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Atleta Uno", "locale": "it"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'atleta.due@example.test', '', now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Atleta Due", "locale": "en"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'coach.prova@example.test', '', now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Coach Prova", "locale": "en"}', now(), now());

-- Coach Prova segue Atleta Due (attivo, può modificare il piano).
insert into public.coach_links (coach_id, athlete_id, status, can_edit_plan, invited_by, activated_at)
values ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 'active', true,
        'aaaaaaaa-0000-4000-8000-000000000002', now());

-- Libreria pubblica di prova.
insert into public.exercises (id, code, name, equipment, visibility, verified) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'panca-piana-bilanciere', '{"it": "Panca piana con bilanciere", "en": "Barbell bench press"}', 'barbell', 'public', true),
  ('eeeeeeee-0000-4000-8000-000000000002', 'lat-machine',            '{"it": "Lat machine", "en": "Lat pulldown"}',                         'machine', 'public', true),
  ('eeeeeeee-0000-4000-8000-000000000003', 'alzate-laterali-cavo',   '{"it": "Alzate laterali al cavo", "en": "Cable lateral raise"}',      'cable',   'public', true),
  ('eeeeeeee-0000-4000-8000-000000000004', 'leg-press',              '{"it": "Leg press", "en": "Leg press"}',                              'machine', 'public', true);

insert into public.exercise_muscles (exercise_id, muscle_code, role, weight) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'chest',       'primary',   1),
  ('eeeeeeee-0000-4000-8000-000000000001', 'triceps',     'secondary', 0.5),
  ('eeeeeeee-0000-4000-8000-000000000001', 'front-delts', 'secondary', 0.5),
  ('eeeeeeee-0000-4000-8000-000000000002', 'lats',        'primary',   1),
  ('eeeeeeee-0000-4000-8000-000000000002', 'biceps',      'secondary', 0.5),
  ('eeeeeeee-0000-4000-8000-000000000003', 'side-delts',  'primary',   1),
  ('eeeeeeee-0000-4000-8000-000000000004', 'quads',       'primary',   1),
  ('eeeeeeee-0000-4000-8000-000000000004', 'glutes',      'secondary', 0.5);

insert into public.club_chains (id, name, visibility, verified) values
  ('cccccccc-0000-4000-8000-000000000001', 'Catena di prova', 'public', true);

insert into public.clubs (id, name, chain_id, city, country, visibility, verified) values
  ('cccccccc-1000-4000-8000-000000000001', 'Club di prova Centro', 'cccccccc-0000-4000-8000-000000000001', 'Auckland', 'NZ', 'public', true),
  ('cccccccc-1000-4000-8000-000000000002', 'Club di prova Nord',   'cccccccc-0000-4000-8000-000000000001', 'Auckland', 'NZ', 'public', true);

insert into public.machines (id, code, brand, model, brand_code, machine_type, weight_unit, weight_min, weight_max, weight_step, visibility, verified) values
  ('dddddddd-0000-4000-8000-000000000001', 'marca-prova-lat-pulldown', 'Marca Prova', 'Lat Pulldown', 'MP-100', 'selectorized', 'kg', 5, 100, 5, 'public', true),
  ('dddddddd-0000-4000-8000-000000000002', 'marca-prova-leg-press',    'Marca Prova', 'Leg Press 45', 'MP-200', 'plate-loaded', 'kg', 0, 400, 1.25, 'public', true);

insert into public.machine_exercises (machine_id, exercise_id) values
  ('dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002'),
  ('dddddddd-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000004');

insert into public.club_machines (club_id, machine_id) values
  ('cccccccc-1000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001'),
  ('cccccccc-1000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002'),
  ('cccccccc-1000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002');

insert into public.user_clubs (user_id, club_id, is_home) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-1000-4000-8000-000000000001', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-1000-4000-8000-000000000002', false),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'cccccccc-1000-4000-8000-000000000002', true);

-- Piano di Atleta Uno: due giorni a rotazione, una superserie.
insert into public.plans (id, user_id, name, phase, is_active, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Piano di prova', 'bulk', true,
   'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.plan_weeks (plan_id, user_id, week_number, rir_min, rir_max, is_deload) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 2, 3, false),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 2, 1, 2, false),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 3, 3, 4, true);

insert into public.plan_days (id, plan_id, user_id, position, code, name) values
  ('bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 'UA', 'Upper A'),
  ('bbbbbbbb-1000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 2, 'LA', 'Lower A');

insert into public.plan_supersets (id, plan_day_id, user_id, label, rest_seconds) values
  ('bbbbbbbb-2000-4000-8000-000000000001', 'bbbbbbbb-1000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'A', 120);

insert into public.plan_exercises (id, plan_day_id, user_id, position, exercise_id, superset_id, sets, reps_min, reps_max, rir_min, rir_max, rest_seconds) values
  ('bbbbbbbb-3000-4000-8000-000000000001', 'bbbbbbbb-1000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1,
   'eeeeeeee-0000-4000-8000-000000000001', null, 3, 6, 10, 1, 2, 180),
  ('bbbbbbbb-3000-4000-8000-000000000002', 'bbbbbbbb-1000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 2,
   'eeeeeeee-0000-4000-8000-000000000002', 'bbbbbbbb-2000-4000-8000-000000000001', 3, 8, 12, 1, 2, null),
  ('bbbbbbbb-3000-4000-8000-000000000003', 'bbbbbbbb-1000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 3,
   'eeeeeeee-0000-4000-8000-000000000003', 'bbbbbbbb-2000-4000-8000-000000000001', 3, 12, 20, 0, 1, null),
  ('bbbbbbbb-3000-4000-8000-000000000004', 'bbbbbbbb-1000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 1,
   'eeeeeeee-0000-4000-8000-000000000004', null, 3, 8, 12, 1, 2, 150);

insert into public.plan_exercise_machines (plan_exercise_id, user_id, club_id, machine_id, alt_machine_id) values
  ('bbbbbbbb-3000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-1000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000001', null),
  ('bbbbbbbb-3000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-1000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000002', null);

-- Una seduta di Atleta Uno con serie normali, una drop set e la superserie.
insert into public.sessions (id, user_id, session_date, started_at, ended_at, club_id, plan_id, plan_day_id, plan_week_number, day_name) values
  ('ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', current_date - 2,
   now() - interval '2 days 1 hour', now() - interval '2 days', 'cccccccc-1000-4000-8000-000000000001',
   'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-1000-4000-8000-000000000001', 1, 'Upper A');

insert into public.session_supersets (id, session_id, user_id, plan_superset_id, label, rest_seconds) values
  ('ffffffff-1000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'bbbbbbbb-2000-4000-8000-000000000001', 'A', 120);

insert into public.session_exercises (id, session_id, user_id, position, exercise_id, machine_id, plan_exercise_id, superset_id,
                                      target_sets, target_reps_min, target_reps_max, target_rir_min, target_rir_max, rest_seconds) values
  ('ffffffff-2000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1,
   'eeeeeeee-0000-4000-8000-000000000001', null, 'bbbbbbbb-3000-4000-8000-000000000001', null, 3, 6, 10, 1, 2, 180),
  ('ffffffff-2000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 2,
   'eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-3000-4000-8000-000000000002',
   'ffffffff-1000-4000-8000-000000000001', 3, 8, 12, 1, 2, null),
  ('ffffffff-2000-4000-8000-000000000003', 'ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 3,
   'eeeeeeee-0000-4000-8000-000000000003', null, 'bbbbbbbb-3000-4000-8000-000000000003',
   'ffffffff-1000-4000-8000-000000000001', 3, 12, 20, 0, 1, null);

insert into public.sets (id, session_exercise_id, user_id, set_number, set_type, weight_kg, reps, rir, input_weight, input_unit) values
  ('ffffffff-3000-4000-8000-000000000001', 'ffffffff-2000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 'warmup', 40,  10, null, 40,  'kg'),
  ('ffffffff-3000-4000-8000-000000000002', 'ffffffff-2000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 2, 'normal', 80,  8,  2,    80,  'kg'),
  ('ffffffff-3000-4000-8000-000000000003', 'ffffffff-2000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 3, 'drop',   80,  7,  0,    80,  'kg'),
  ('ffffffff-3000-4000-8000-000000000004', 'ffffffff-2000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 'normal', 60,  10, 2,    60,  'kg'),
  ('ffffffff-3000-4000-8000-000000000005', 'ffffffff-2000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 'normal', 9.072, 15, 1, 20, 'lb');

insert into public.set_parts (set_id, user_id, part_number, weight_kg, reps, rest_seconds_before) values
  ('ffffffff-3000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 2, 60, 6, 0),
  ('ffffffff-3000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 3, 40, 8, 0);

-- Dati del corpo di prova.
insert into public.body_metrics (user_id, metric_date, weight_kg, steps, kcal, protein_g) values
  ('aaaaaaaa-0000-4000-8000-000000000001', current_date - 2, 80.4, 9500, 2900, 160),
  ('aaaaaaaa-0000-4000-8000-000000000001', current_date - 1, 80.6, 11200, 3050, 172);

insert into public.body_measurements (user_id, measured_on, kind, value) values
  ('aaaaaaaa-0000-4000-8000-000000000001', current_date - 1, 'waist', 86.5);
