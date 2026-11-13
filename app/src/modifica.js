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
