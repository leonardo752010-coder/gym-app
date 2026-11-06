// Operazioni della seduta: salvare, modificare e cancellare una serie.
// Scrivono solo sul telefono (Local.write); l'invio a Supabase lo fa sync.js.
import { indexRows, openSessions, findSessionExercise, setsInSessions, nextSetNumber, unitToKg, lastActivity } from './logic.js';

const uuid = () => crypto.randomUUID();

/**
 * Salva una serie nuova. Se per questo giorno del piano non c'è una seduta in corso (vedi openSessions),
 * ne crea una nuova con la data di oggi: le sedute vecchie non si toccano e restano la "volta scorsa".
 * values = { weight (nell'unità mostrata), unit, reps, rir }
 */
export async function saveSet(local, ctx, pe, values, now = new Date()) {
  const { userId, date, day, plan, clubId } = ctx;
  const idx = indexRows(local.list());
  const changes = [];
  const open = openSessions(idx, { date, day, now });
  let session = open[0] || null;
  if (!session) {
    session = { id: uuid(), user_id: userId, session_date: date, started_at: now.toISOString(), club_id: clubId || null,
      plan_id: plan ? plan.id : null, plan_day_id: day.id, day_name: day.name, deleted_at: null };
    changes.push({ table: 'sessions', data: session });
  }
  let se = findSessionExercise(idx, session.id, pe);
  if (!se) {
    const position = (idx.seBySession.get(session.id) || []).reduce((m, x) => Math.max(m, x.position || 0), 0) + 1;
    se = { id: uuid(), session_id: session.id, user_id: userId, position: Math.min(position, 100), exercise_id: pe.exercise_id,
      machine_id: pe.machine ? pe.machine.id : null, plan_exercise_id: pe.id, skipped: false,
      target_sets: pe.sets, target_reps_min: pe.reps_min, target_reps_max: pe.reps_max,
      target_rir_min: pe.rir_min, target_rir_max: pe.rir_max, rest_seconds: pe.rest_seconds ?? null, deleted_at: null };
    changes.push({ table: 'session_exercises', data: se });
  }
  const set = {
    id: uuid(), session_exercise_id: se.id, user_id: userId, set_number: nextSetNumber(setsInSessions(idx, open, pe)), set_type: 'normal',
    ...weightFields(values), reps: values.reps, rir: values.rir ?? null, performed_at: now.toISOString(), deleted_at: null,
  };
  changes.push({ table: 'sets', data: set });
  await local.write(changes);
  return set;
}

/** Modifica una serie già salvata (stesso id: online diventa un aggiornamento della stessa riga). */
export async function updateSet(local, setId, values) {
  const cur = local.rows.get(setId);
  if (!cur) throw new Error('set-not-found');
  const [r] = await local.write([{ table: 'sets', data: { id: setId, ...weightFields(values), reps: values.reps, rir: values.rir ?? null } }]);
  return r.data;
}

/** Cancellazione morbida: la serie resta nel database con deleted_at. */
export async function deleteSet(local, setId, now = new Date()) {
  const cur = local.rows.get(setId);
  if (!cur) throw new Error('set-not-found');
  const [r] = await local.write([{ table: 'sets', data: { id: setId, deleted_at: now.toISOString() } }]);
  return r.data;
}

/**
 * "Fine seduta": scrive ended_at sulle sedute in corso (di solito una). Le serie non si toccano e diventano la
 * "volta scorsa". Come ogni modifica va prima sul telefono e poi nella coda di invio (stessa riga, stesso id).
 * Ritorna le sedute chiuse; vuoto se non c'era niente da chiudere (nessuna serie salvata = nessuna seduta).
 */
export async function closeSession(local, sessions, now = new Date()) {
  const idx = indexRows(local.list());
  const changes = [];
  for (const s of sessions || []) {
    const cur = s && local.rows.get(s.id);
    if (!cur || cur.data.ended_at || cur.data.deleted_at) continue;
    // Mai prima dell'inizio o dell'ultima serie (il database lo rifiuterebbe; capita con orologi diversi tra telefoni).
    const end = Math.max(now.getTime(), lastActivity(idx, cur.data));
    changes.push({ table: 'sessions', data: { id: s.id, ended_at: new Date(end).toISOString() } });
  }
  if (!changes.length) return [];
  return (await local.write(changes)).map((r) => r.data);
}

/** "Riapri": toglie ended_at da una seduta chiusa. Ritorna la seduta, o null se non era chiusa. */
export async function reopenSession(local, sessionId) {
  const cur = local.rows.get(sessionId);
  if (!cur || !cur.data.ended_at) return null;
  const [r] = await local.write([{ table: 'sessions', data: { id: sessionId, ended_at: null } }]);
  return r.data;
}

function weightFields({ weight, unit }) {
  const w = Number(weight);
  return { weight_kg: unitToKg(w, unit), input_weight: w, input_unit: unit };
}
