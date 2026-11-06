// Operazioni della seduta: salvare, modificare e cancellare una serie.
// Scrivono solo sul telefono (Local.write); l'invio a Supabase lo fa sync.js.
import { indexRows, findSession, findSessionExercise, setsOf, nextSetNumber, unitToKg } from './logic.js';

const uuid = () => crypto.randomUUID();

/**
 * Salva una serie nuova. Crea, se mancano, la seduta di oggi e l'esercizio della seduta.
 * values = { weight (nell'unità mostrata), unit, reps, rir }
 */
export async function saveSet(local, ctx, pe, values, now = new Date()) {
  const { userId, date, day, plan, clubId } = ctx;
  const idx = indexRows(local.list());
  const changes = [];
  let session = findSession(idx, { date, day });
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
    id: uuid(), session_exercise_id: se.id, user_id: userId, set_number: nextSetNumber(setsOf(idx, se.id)), set_type: 'normal',
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

function weightFields({ weight, unit }) {
  const w = Number(weight);
  return { weight_kg: unitToKg(w, unit), input_weight: w, input_unit: unit };
}
