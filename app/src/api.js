// Tutto quello che passa da Supabase (accesso, lettura del piano e dello storico, invio della coda).
import { createClient } from '@supabase/supabase-js';

export const AUTH_KEY = 'gym-auth';
export const HISTORY_DAYS = 120;

export const TIMEOUT_MS = 15000;

/** fetch con tempo massimo: con poco segnale una richiesta appesa non deve bloccare la coda per sempre. */
export function timedFetch(base = (...a) => fetch(...a), ms = TIMEOUT_MS) {
  return (input, init = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    if (init.signal) init.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    return base(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };
}

export function makeApi({ url, key, fetch: fetchImpl, storage } = {}) {
  const sb = createClient(url, key, {
    auth: {
      storageKey: AUTH_KEY,
      storage: storage || (typeof localStorage !== 'undefined' ? localStorage : undefined),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: { fetch: timedFetch(fetchImpl) },
  });

  const wrap = async (p) => {
    try {
      const { data, error, status } = await p;
      if (error) return { error: { code: error.code || '', message: error.message || String(error), status, offline: status === 0 && !error.code } };
      return { data };
    } catch (e) {
      return { error: { code: '', message: String(e && e.message || e), offline: true } };
    }
  };

  return {
    sb,

    async signIn(email, password) {
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return { error: { code: error.code || error.name || '', message: error.message, status: error.status } };
        return { user: data.user };
      } catch (e) {
        return { error: { code: 'network', message: String(e && e.message || e), offline: true } };
      }
    },

    async signOut() {
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* offline: si esce lo stesso in locale */ }
    },

    upsert(table, rows) {
      return wrap(sb.from(table).upsert(rows, { onConflict: 'id', defaultToNull: true }));
    },

    async setNumbers(sessionExerciseId) {
      const r = await wrap(sb.from('sets').select('set_number').eq('session_exercise_id', sessionExerciseId).is('deleted_at', null));
      return r.error ? null : r.data.map((x) => x.set_number);
    },

    /** Profilo, palestra principale e piano attivo (con esercizi e macchine). */
    async snapshot(userId) {
      const [prof, clubs, plans] = await Promise.all([
        wrap(sb.from('profiles').select('locale, weight_unit, time_zone').eq('id', userId).maybeSingle()),
        wrap(sb.from('user_clubs').select('club_id, is_home').eq('user_id', userId)),
        wrap(sb.from('plans').select(`id, name,
          plan_days(id, position, code, name, archived_at,
            plan_supersets(id, label, rest_seconds),
            plan_exercises(id, position, exercise_id, superset_id, sets, sets_max, reps_min, reps_max, rir_min, rir_max, rest_seconds,
              set_type, progression_method, notes, archived_at,
              exercise:exercises(id, code, name, equipment, is_unilateral, exercise_muscles(muscle_code, role, muscle:muscles(code, name))),
              plan_exercise_machines(club_id,
                machine:machines!plan_exercise_machines_machine_id_fkey(id, code, brand, model, brand_code, name, weight_unit, weight_min, weight_max, weight_step, weight_list),
                alt:machines!plan_exercise_machines_alt_machine_id_fkey(id, code, brand, model, brand_code, name, weight_unit, weight_min, weight_max, weight_step, weight_list))))`)
          .eq('user_id', userId).eq('is_active', true).is('archived_at', null).limit(1)),
      ]);
      const err = prof.error || clubs.error || plans.error;
      if (err) return { error: err };
      const homeClub = (clubs.data.find((c) => c.is_home) || clubs.data[0] || {}).club_id || null;
      return { data: { profile: prof.data, homeClubId: homeClub, plan: shapePlan(plans.data[0] || null, homeClub) } };
    },

    /**
     * Starter del profilo (CHOOSE YOUR STARTER). Richiesta separata da snapshot: se fallisce
     * (per esempio la colonna non c'è ancora online) il piano e la seduta funzionano lo stesso.
     * data: 'gorilla' | 'lion' | 'tiger' | null.
     */
    async getStarter(userId) {
      const r = await wrap(sb.from('profiles').select('starter').eq('id', userId).maybeSingle());
      if (r.error) return r;
      if (!r.data) return { error: { code: 'no-profile', message: 'profile not found' } };
      return { data: r.data.starter ?? null };
    },

    /**
     * Scrive lo starter solo se sul server è ancora vuoto: un secondo invio (risposta persa,
     * altro telefono) non cambia niente. data: righe scritte ([] = c'era già uno starter).
     */
    setStarter(userId, value) {
      return wrap(sb.from('profiles').update({ starter: value }).eq('id', userId).is('starter', null).select('starter'));
    },

    /** Sedute degli ultimi HISTORY_DAYS giorni con esercizi e serie (anche quelle cancellate, per allineare il telefono). */
    async history(userId, fromDate) {
      const r = await wrap(sb.from('sessions').select(`id, user_id, session_date, started_at, ended_at, club_id, plan_id, plan_day_id, day_name, notes, deleted_at, created_at,
          session_exercises(id, session_id, user_id, position, exercise_id, machine_id, plan_exercise_id, skipped, target_sets, target_reps_min,
            target_reps_max, target_rir_min, target_rir_max, rest_seconds, notes, deleted_at, created_at,
            sets(id, session_exercise_id, user_id, set_number, set_type, weight_kg, reps, rir, input_weight, input_unit, performed_at, notes, deleted_at, created_at))`)
        .eq('user_id', userId).gte('session_date', fromDate).order('session_date', { ascending: false }).limit(1000));
      if (r.error) return r;
      const rows = [];
      for (const s of r.data) {
        const { session_exercises: ses, ...sd } = s;
        rows.push({ table: 'sessions', data: sd });
        for (const se of ses || []) {
          const { sets, ...sed } = se;
          rows.push({ table: 'session_exercises', data: sed });
          for (const st of sets || []) rows.push({ table: 'sets', data: st });
        }
      }
      return { data: rows };
    },
  };
}

/** Utente salvato sul telefono dall'ultimo accesso (si legge senza rete). */
export function storedUser(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage && storage.getItem(AUTH_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const u = s.user || (s.currentSession && s.currentSession.user);
    return u && u.id ? { id: u.id, email: u.email } : null;
  } catch (e) { return null; }
}

const n = (v) => (v == null ? null : Number(v));

/** Piano nella forma usata dall'app: giorni in ordine, esercizi in ordine, macchina della palestra principale. */
export function shapePlan(p, homeClub) {
  if (!p) return null;
  const mach = (m) => m && ({
    id: m.id, code: m.code, brand: m.brand, model: m.model, brand_code: m.brand_code, name: m.name,
    weight_unit: m.weight_unit, weight_min: n(m.weight_min), weight_max: n(m.weight_max), weight_step: n(m.weight_step),
    weight_list: Array.isArray(m.weight_list) ? m.weight_list.map(Number) : null,
  });
  const days = (p.plan_days || []).filter((d) => !d.archived_at).sort((a, b) => a.position - b.position).map((d) => {
    const ss = new Map((d.plan_supersets || []).map((s) => [s.id, s]));
    return {
      id: d.id, position: d.position, code: d.code, name: d.name,
      exercises: (d.plan_exercises || []).filter((e) => !e.archived_at).sort((a, b) => a.position - b.position).map((e) => {
        const pms = e.plan_exercise_machines || [];
        const pm = pms.find((x) => x.club_id === homeClub) || pms[0] || null;
        const muscles = (e.exercise && e.exercise.exercise_muscles) || [];
        const prim = muscles.find((m) => m.role === 'primary') || muscles[0];
        return {
          id: e.id, position: e.position, exercise_id: e.exercise_id, superset_id: e.superset_id,
          superset_rest: e.superset_id && ss.get(e.superset_id) ? ss.get(e.superset_id).rest_seconds : null,
          superset_label: e.superset_id && ss.get(e.superset_id) ? ss.get(e.superset_id).label : null,
          sets: e.sets, sets_max: e.sets_max, reps_min: e.reps_min, reps_max: e.reps_max,
          rir_min: n(e.rir_min), rir_max: n(e.rir_max), rest_seconds: e.rest_seconds, set_type: e.set_type,
          notes: e.notes,
          exercise: e.exercise ? { id: e.exercise.id, code: e.exercise.code, name: e.exercise.name } : null,
          muscle: prim && prim.muscle ? prim.muscle.name : null,
          club_id: pm ? pm.club_id : null,
          machine: pm ? mach(pm.machine) : null,
          alt_machine: pm ? mach(pm.alt) : null,
        };
      }),
    };
  });
  return { id: p.id, name: p.name, days };
}
