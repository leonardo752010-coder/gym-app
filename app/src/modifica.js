// Modifica di un esercizio del piano dalla schermata Programma: serie, rep, RIR, recupero, note.
// Logica pura (nessun DOM, nessuna rete): campi della finestra, controlli prima di salvare e
// aggiornamento della copia del piano sul telefono dopo la risposta del server.
// Si salva SOLO online (niente coda offline per il piano: decisione di Leonardo del 2026-11-13).
// Si prova con tests/unit/modifica.test.js.

/** Campi della finestra, nell'ordine in cui compaiono. kind: int (numero intero), dec (un decimale), text. */
export const PLAN_EDIT_FIELDS = [
  { key: 'sets', kind: 'int' },
  { key: 'sets_max', kind: 'int' },
  { key: 'reps_min', kind: 'int' },
  { key: 'reps_max', kind: 'int' },
  { key: 'rir_min', kind: 'dec' },
  { key: 'rir_max', kind: 'dec' },
  { key: 'rest_seconds', kind: 'int' },
  { key: 'notes', kind: 'text' },
];

// Limiti uguali a quelli del database (supabase/migrations/20261105100300_plan.sql), così l'errore si vede subito.
const LIM = { sets: [0, 20], sets_max: [1, 20], reps: [1, 200], rir: [0, 10], rest: [0, 3600] };

/** Valori di partenza della finestra (testo), presi dall'esercizio del piano. Vuoto = nessun valore. */
export function planEditForm(pe) {
  const out = {};
  for (const { key, kind } of PLAN_EDIT_FIELDS) {
    const v = pe ? pe[key] : null;
    out[key] = v == null ? '' : kind === 'dec' ? String(Number(v)) : String(v);
  }
  return out;
}

/** Testo → numero. '' → null; non numero → NaN. Virgola o punto per i decimali. */
function num(s, decimals) {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const re = decimals ? /^\d+([.,]\d)?$/ : /^\d+$/;
  return re.test(t) ? Number(t.replace(',', '.')) : NaN;
}
const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Controlli prima di salvare. Ritorna { values, errors }:
 * - values: la riga da scrivere in plan_exercises (solo queste colonne), valida solo se errors è vuoto;
 * - errors: chiavi dei messaggi (testi in i18n.js, gruppo peErr), nell'ordine dei campi, senza doppioni.
 * Regole: serie intero 0-20 (0 = fuori dal volume), obbligatorio; serie max vuoto o 1-20 e non meno delle serie;
 * rep min e max obbligatori, interi 1-200, min ≤ max; RIR vuoto o 0-10 (un decimale), min ≤ max;
 * recupero vuoto o 0-3600 secondi interi; note libere (vuote = nessuna nota).
 */
export function validatePlanEdit(form) {
  const errors = [];
  const add = (k) => { if (!errors.includes(k)) errors.push(k); };
  const sets = num(form.sets, false), setsMax = num(form.sets_max, false);
  const repsMin = num(form.reps_min, false), repsMax = num(form.reps_max, false);
  const rirMin = num(form.rir_min, true), rirMax = num(form.rir_max, true);
  const rest = num(form.rest_seconds, false);

  if (sets === null || !inRange(sets, LIM.sets)) add('sets');
  if (setsMax !== null && !inRange(setsMax, LIM.sets_max)) add('setsMax');
  else if (setsMax !== null && inRange(sets, LIM.sets) && setsMax < sets) add('setsMaxLow');
  if (repsMin === null || repsMax === null || !inRange(repsMin, LIM.reps) || !inRange(repsMax, LIM.reps)) add('reps');
  else if (repsMin > repsMax) add('repsOrder');
  if ((rirMin !== null && !inRange(rirMin, LIM.rir)) || (rirMax !== null && !inRange(rirMax, LIM.rir))) add('rir');
  else if (rirMin !== null && rirMax !== null && rirMin > rirMax) add('rirOrder');
  if (rest !== null && !inRange(rest, LIM.rest)) add('rest');

  const notes = String(form.notes ?? '').trim();
  const values = {
    sets, sets_max: setsMax, reps_min: repsMin, reps_max: repsMax,
    rir_min: rirMin, rir_max: rirMax, rest_seconds: rest, notes: notes === '' ? null : notes,
  };
  return { values, errors };
}

/**
 * Copia del piano sul telefono dopo il salvataggio: stesso piano, solo l'esercizio `peId` con i valori
 * confermati dal server (`row`). Non cambia il piano di partenza. Esercizio non trovato: piano uguale.
 */
export function applyPlanEdit(plan, peId, row) {
  if (!plan || !row) return plan;
  const n = (v) => (v == null ? null : Number(v));
  const patch = {
    sets: row.sets, sets_max: row.sets_max ?? null, reps_min: row.reps_min ?? null, reps_max: row.reps_max ?? null,
    rir_min: n(row.rir_min), rir_max: n(row.rir_max), rest_seconds: row.rest_seconds ?? null, notes: row.notes ?? null,
  };
  return {
    ...plan,
    days: plan.days.map((d) => (d.exercises.some((pe) => pe.id === peId)
      ? { ...d, exercises: d.exercises.map((pe) => (pe.id === peId ? { ...pe, ...patch } : pe)) }
      : d)),
  };
}

/** Esercizio del piano con questo id (in qualsiasi giorno), o null. */
export function findPlanExercise(plan, peId) {
  for (const d of (plan && plan.days) || []) for (const pe of d.exercises) if (pe.id === peId) return pe;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Spostamento: Giorno (tendina) e Su / Giù dentro il giorno. Si salva in UNA richiesta (upsert sull'id)
// con tutte le righe che cambiano: il vincolo "stesso giorno, stessa posizione" del database è rinviabile
// (si controlla alla fine), quindi lo scambio di due posizioni non dà errore, e se qualcosa non va
// la richiesta intera non cambia niente. Lo schema del database non cambia.
// ---------------------------------------------------------------------------------------------

/** Colonne di plan_exercises riscritte uguali (tranne giorno e posizione) per le righe che si spostano. */
export const PE_COLUMNS = ['id', 'user_id', 'plan_day_id', 'position', 'exercise_id', 'superset_id', 'sets', 'sets_max', 'reps_min', 'reps_max',
  'rir_min', 'rir_max', 'rest_seconds', 'set_type', 'progression_method', 'progression_settings', 'notes', 'archived_at'];

/**
 * Su (dir = -1) o Giù (dir = +1) dentro il giorno. order = [{ id, superset_id }] nell'ordine del giorno.
 * Le superserie restano unite: un esercizio di una superserie si muove solo dentro la sua superserie;
 * un esercizio normale scavalca una superserie intera. Ritorna il nuovo ordine, o null se non si può.
 */
export function moveInDay(order, id, dir) {
  const i = order.findIndex((x) => x.id === id);
  if (i < 0 || (dir !== -1 && dir !== 1)) return null;
  const me = order[i];
  if (me.superset_id) {
    const nb = order[i + dir];
    if (!nb || nb.superset_id !== me.superset_id) return null;
    const out = [...order]; out[i] = nb; out[i + dir] = me; return out;
  }
  if (dir < 0) {
    if (i === 0) return null;
    let j = i - 1;
    const ss = order[j].superset_id;
    if (ss) while (j > 0 && order[j - 1].superset_id === ss) j--;
    return [...order.slice(0, j), me, ...order.slice(j, i), ...order.slice(i + 1)];
  }
  if (i === order.length - 1) return null;
  let j = i + 1;
  const ss = order[j].superset_id;
  if (ss) while (j < order.length - 1 && order[j + 1].superset_id === ss) j++;
  return [...order.slice(0, i), ...order.slice(i + 1, j + 1), me, ...order.slice(j + 1)];
}

/** Ordine di partenza nella finestra quando si sceglie un giorno: quello del giorno, e l'esercizio in fondo se arriva da un altro giorno. */
export function orderForDay(plan, peId, dayId) {
  const day = ((plan && plan.days) || []).find((d) => d.id === dayId);
  if (!day) return null;
  const me = findPlanExercise(plan, peId);
  const list = day.exercises.map((pe) => ({ id: pe.id, superset_id: pe.superset_id || null }));
  if (list.some((x) => x.id === peId) || !me) return list;
  return [...list, { id: peId, superset_id: me.superset_id || null }];
}

/** Giorno del piano che contiene questo esercizio (id), o null. */
export function dayOfExercise(plan, peId) {
  for (const d of (plan && plan.days) || []) if (d.exercises.some((pe) => pe.id === peId)) return d.id;
  return null;
}

/**
 * Righe da scrivere per spostare un esercizio. rows = righe del server (complete, anche archiviate) del giorno di
 * partenza e di quello di arrivo; order = id degli esercizi del giorno di arrivo nell'ordine scelto (con l'esercizio);
 * values = serie, rep, RIR… controllati (validatePlanEdit). Regole:
 * - l'esercizio cambia solo giorno e posizione (più i valori della finestra); l'id resta lo stesso, lo storico non cambia;
 * - in tutti e due i giorni posizioni 1, 2, 3… senza buchi né doppioni; gli archiviati (non si vedono, ma occupano
 *   una posizione) vanno in fondo, nel loro ordine; esercizi attivi che il telefono non conosceva restano, dopo quelli scelti;
 * - un esercizio in una superserie non cambia giorno (la superserie è del suo giorno).
 * Ritorna { rows } (solo le righe che cambiano, complete) oppure { error: 'superset' | 'missing' | 'full' }.
 */
export function planMoveRows(rows, peId, toDayId, order, values = {}) {
  const me = rows.find((r) => r.id === peId);
  if (!me) return { error: 'missing' };
  if (me.superset_id && me.plan_day_id !== toDayId) return { error: 'superset' };
  const byPos = (a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id));
  const others = (dayId) => rows.filter((r) => r.plan_day_id === dayId && r.id !== peId);
  const final = new Map();   // id → { day, position }
  const place = (dayId, list) => list.forEach((r, i) => final.set(r.id, { day: dayId, position: i + 1 }));

  const dest = others(toDayId);
  const known = new Map(dest.filter((r) => !r.archived_at).map((r) => [r.id, r]));
  const chosen = [];
  for (const id of order) {
    if (id === peId) chosen.push(me);
    else if (known.has(id)) { chosen.push(known.get(id)); known.delete(id); }
  }
  if (!chosen.includes(me)) chosen.push(me);
  const destList = [...chosen, ...[...known.values()].sort(byPos), ...dest.filter((r) => r.archived_at).sort(byPos)];
  if (destList.length > 100) return { error: 'full' };
  place(toDayId, destList);
  if (me.plan_day_id !== toDayId) {
    const src = others(me.plan_day_id);
    place(me.plan_day_id, [...src.filter((r) => !r.archived_at).sort(byPos), ...src.filter((r) => r.archived_at).sort(byPos)]);
  }

  const out = [];
  for (const r of rows) {
    const f = final.get(r.id);
    if (!f) continue;
    if (r.id !== peId && f.day === r.plan_day_id && f.position === r.position) continue;
    const full = { ...r, ...(r.id === peId ? values : {}), plan_day_id: f.day, position: f.position };
    out.push(Object.fromEntries(PE_COLUMNS.map((c) => [c, full[c] === undefined ? null : full[c]])));
  }
  return { rows: out };
}

/**
 * Copia del piano sul telefono dopo uno spostamento salvato: `saved` = righe confermate dal server
 * (id, plan_day_id, position e, per l'esercizio spostato, i valori della finestra). Ogni esercizio va nel suo giorno,
 * in ordine di posizione. Non cambia il piano di partenza.
 */
export function applyPlanMove(plan, peId, saved) {
  if (!plan || !saved || !saved.length) return plan;
  const by = new Map(saved.map((r) => [r.id, r]));
  const all = [];
  for (const d of plan.days) for (const pe of d.exercises) all.push({ dayId: d.id, pe });
  const moved = all.map(({ dayId, pe }) => {
    const r = by.get(pe.id);
    if (!r) return { dayId, pe };
    let x = { ...pe, position: r.position };
    if (pe.id === peId) x = findPlanExercise(applyPlanEdit({ days: [{ id: dayId, exercises: [x] }] }, peId, { ...pe, ...r }), peId);
    return { dayId: r.plan_day_id || dayId, pe: x };
  });
  return {
    ...plan,
    days: plan.days.map((d) => ({ ...d, exercises: moved.filter((m) => m.dayId === d.id).map((m) => m.pe).sort((a, b) => a.position - b.position) })),
  };
}
