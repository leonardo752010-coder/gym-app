// Logica pura dell'app (nessun DOM, nessuna rete): si prova con i test in tests/unit.
// Le "righe" sono quelle del database (sessions, session_exercises, sets) con i nomi delle colonne di Supabase.

export const LB = 0.45359237;

/** Data locale del telefono come 'AAAA-MM-GG'. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

/** Indici per trovare in fretta sedute, esercizi della seduta e serie. Le righe cancellate restano fuori. */
export function indexRows(rows) {
  const sessions = new Map(), sesEx = new Map(), setsBySe = new Map(), seBySession = new Map();
  for (const r of rows) {
    const d = r.data || r;
    const table = r.table;
    if (d.deleted_at) continue;
    if (table === 'sessions') sessions.set(d.id, d);
    else if (table === 'session_exercises') sesEx.set(d.id, d);
  }
  for (const r of rows) {
    const d = r.data || r;
    if (r.table !== 'sets' || d.deleted_at) continue;
    if (!setsBySe.has(d.session_exercise_id)) setsBySe.set(d.session_exercise_id, []);
    setsBySe.get(d.session_exercise_id).push(d);
  }
  for (const list of setsBySe.values()) list.sort((a, b) => a.set_number - b.set_number);
  for (const se of sesEx.values()) {
    if (!sessions.has(se.session_id)) continue;
    if (!seBySession.has(se.session_id)) seBySession.set(se.session_id, []);
    seBySession.get(se.session_id).push(se);
  }
  return { sessions, sesEx, setsBySe, seBySession };
}

/** La seduta di oggi per un giorno del piano (se esiste già). */
export function findSession(idx, { date, day }) {
  let best = null;
  for (const s of idx.sessions.values()) {
    if (s.session_date !== date) continue;
    const same = s.plan_day_id ? s.plan_day_id === day.id : (s.day_name && s.day_name === day.name);
    if (!same) continue;
    if (!best || String(s.created_at || s.started_at || '') < String(best.created_at || best.started_at || '')) best = s;
  }
  return best;
}

const machineOf = (pe) => (pe.machine ? pe.machine.id : null);

/** L'esercizio della seduta che corrisponde a un esercizio del piano. */
export function findSessionExercise(idx, sessionId, pe) {
  const list = idx.seBySession.get(sessionId) || [];
  return list.find((se) => se.plan_exercise_id === pe.id) ||
    list.find((se) => !se.plan_exercise_id && se.exercise_id === pe.exercise_id && (se.machine_id || null) === machineOf(pe)) || null;
}

export function setsOf(idx, seId) {
  return seId ? (idx.setsBySe.get(seId) || []) : [];
}

const isWorking = (s) => s.set_type !== 'warmup';

/**
 * "Volta scorsa": l'ultima seduta (diversa da quella di oggi) in cui l'esercizio è stato fatto,
 * sulla stessa macchina se il piano ne indica una. Solo serie non cancellate e non di riscaldamento.
 */
export function lastPerformance(idx, pe, { excludeSessionId = null, onOrBefore = null } = {}) {
  const mac = machineOf(pe);
  let best = null;
  for (const se of idx.sesEx.values()) {
    if (se.exercise_id !== pe.exercise_id) continue;
    if (mac && se.machine_id !== mac) continue;
    const s = idx.sessions.get(se.session_id);
    if (!s || s.id === excludeSessionId) continue;
    if (onOrBefore && s.session_date > onOrBefore) continue;
    const sets = setsOf(idx, se.id).filter(isWorking);
    if (!sets.length) continue;
    const when = s.session_date + '|' + (sets[sets.length - 1].performed_at || '');
    if (!best || when > best.when) best = { when, date: s.session_date, sessionId: s.id, sets };
  }
  if (!best) return null;
  return {
    date: best.date, sessionId: best.sessionId,
    sets: best.sets.map((s, i) => ({ n: i + 1, kg: num(s.weight_kg), reps: s.reps, rir: s.rir == null ? null : num(s.rir), input_weight: num(s.input_weight), input_unit: s.input_unit })),
  };
}

function num(v) { return v == null || v === '' ? null : Number(v); }

/** Arrotonda per evitare 82.49999. */
export const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Salto di peso: il peso successivo (dir = +1) o precedente (dir = -1), nell'unità mostrata.
 * Usa la lista dei pesi della macchina o il suo passo, se sono nella stessa unità; altrimenti 2,5 kg / 5 lb.
 */
export function stepWeight(value, machine, unit, dir) {
  const v = Number(value) || 0;
  const mu = machine && machine.weight_unit ? machine.weight_unit : 'kg';
  if (machine && mu === unit && Array.isArray(machine.weight_list) && machine.weight_list.length) {
    const list = [...machine.weight_list].map(Number).sort((a, b) => a - b);
    if (dir > 0) { const n = list.find((w) => w > v + 1e-9); return n == null ? list[list.length - 1] : n; }
    const p = [...list].reverse().find((w) => w < v - 1e-9); return p == null ? list[0] : p;
  }
  let step = unit === 'lb' ? 5 : 2.5;
  let min = 0, max = Infinity;
  if (machine && mu === unit) {
    if (machine.weight_step) step = Number(machine.weight_step);
    if (machine.weight_min != null) min = Number(machine.weight_min);
    if (machine.weight_max != null) max = Number(machine.weight_max);
  }
  const next = round2(v + dir * step);
  return Math.min(max, Math.max(min, next));
}

/** Converte un peso in kg nell'unità mostrata (lb arrotondate a 0,5). */
export function kgToUnit(kg, unit) {
  if (kg == null || kg === '') return null;
  return unit === 'lb' ? Math.round((Number(kg) / LB) * 2) / 2 : round2(Number(kg));
}
export function unitToKg(v, unit) {
  return unit === 'lb' ? Math.round(Number(v) * LB * 1000) / 1000 : Number(v);
}
/** Peso di una serie nell'unità mostrata: se era stato scritto in quella unità, il numero esatto. */
export function setWeightIn(s, unit) {
  if (s.input_unit === unit && s.input_weight != null) return Number(s.input_weight);
  return kgToUnit(s.weight_kg ?? s.kg, unit);
}

/**
 * Doppia progressione di base.
 * - Se nella volta scorsa tutte le serie hanno raggiunto il massimo del range: più peso (un salto), reps al minimo.
 * - Altrimenti: stesso peso, una ripetizione in più (fino al massimo del range).
 * Restituisce un suggerimento per ogni serie del piano (nell'unità mostrata).
 */
export function suggest(pe, last, unit) {
  if (!last || !last.sets.length) return null;
  const max = pe.reps_max ?? null, min = pe.reps_min ?? max;
  const sets = last.sets;
  const topped = max != null && sets.every((s) => s.reps >= max);
  const count = Math.max(pe.sets || 0, 1);
  const out = [];
  for (let n = 1; n <= count; n++) {
    const ls = sets[n - 1] || sets[sets.length - 1];
    const w = setWeightIn(ls, unit);
    if (topped) {
      const up = stepWeight(w, pe.machine, unit, +1);
      out.push({ n, weight: up, reps: min ?? ls.reps, why: up > w ? 'up' : 'hold' });
    } else if (max != null && ls.reps >= max) {
      out.push({ n, weight: w, reps: ls.reps, why: 'hold' });
    } else {
      const target = min != null && ls.reps < min ? min : ls.reps + 1;
      out.push({ n, weight: w, reps: max != null ? Math.min(target, max) : target, why: 'reps' });
    }
  }
  return { topped, sets: out };
}

/** Recupero: quello della superserie, poi quello del piano, altrimenti in base alle ripetizioni. */
export function restFor(pe) {
  if (pe.superset_rest != null) return pe.superset_rest;
  if (pe.rest_seconds != null) return pe.rest_seconds;
  const mx = Number(pe.reps_max) || 12;
  return mx <= 10 ? 150 : mx <= 15 ? 120 : 90;
}

export function nextSetNumber(sets) {
  return sets.reduce((m, s) => Math.max(m, s.set_number), 0) + 1;
}

/**
 * Giorno da proporre: quello con una seduta già iniziata oggi; altrimenti il giorno dopo
 * l'ultimo fatto (rotazione per allenamenti fatti); altrimenti il primo.
 */
export function defaultDay(plan, idx, today) {
  const days = plan.days;
  if (!days.length) return null;
  const dayOf = (s) => days.find((d) => (s.plan_day_id ? s.plan_day_id === d.id : s.day_name === d.name));
  let last = null;
  for (const s of idx.sessions.values()) {
    const d = dayOf(s);
    if (!d) continue;
    if (!(idx.seBySession.get(s.id) || []).some((se) => setsOf(idx, se.id).length)) continue;
    if (s.session_date === today) return d;
    if (s.session_date > today) continue;
    const key = s.session_date + '|' + (s.created_at || s.started_at || '');
    if (!last || key > last.key) last = { key, d };
  }
  if (!last) return days[0];
  const i = days.indexOf(last.d);
  return days[(i + 1) % days.length];
}

/** Peso che sembra sbagliato (errore di unità o di battitura) rispetto alla volta scorsa. */
export function looksWrong(kg, last) {
  if (!(kg > 0)) return false;
  const prev = last && last.sets.length ? Math.max(...last.sets.map((s) => s.kg || 0)) : 0;
  if (prev > 0) return kg > Math.max(prev * 1.8, prev + 40);
  return kg > 300;
}

/** Macchina come riga sotto il titolo: "Marca · Modello · Codice". */
export function machineLabel(m) {
  if (!m) return '';
  return [m.brand, m.model, m.brand_code].filter(Boolean).join(' · ');
}
