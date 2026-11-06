// Dati FINTI per provare l'app sul database LOCALE. Mai online (il chiamante passa solo l'indirizzo locale).
// Crea: un atleta finto con password, libreria "prova-app-..." (esercizi e macchine finti), palestra privata,
// piano di 4 giorni e alcune sedute passate (alcune come quelle importate dal foglio, altre come quelle dell'app).
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const uid = () => crypto.randomUUID();
const D = (today, n) => { const [y, m, d] = today.split('-').map(Number); const x = new Date(y, m - 1, d + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

export function adminClient({ url, service }) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error('Rifiuto: solo database locale');
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

const must = async (p, what) => { const { data, error } = await p; if (error) throw new Error(what + ': ' + error.message); return data; };

/** Libreria finta condivisa (si crea una volta; codici fissi "prova-app-..."). */
export async function ensureLibrary(admin) {
  const ex = [
    ['prova-app-panca', 'Panca inclinata', 'Incline press', 'machine', 'chest'],
    ['prova-app-lat', 'Lat machine', 'Lat pulldown', 'machine', 'lats'],
    ['prova-app-alzate', 'Alzate laterali', 'Lateral raise', 'machine', 'side-delts'],
    ['prova-app-hack', 'Hack squat', 'Hack squat', 'machine', 'quads'],
    ['prova-app-legext', 'Leg extension', 'Leg extension', 'machine', 'quads'],
    ['prova-app-curl', 'Leg curl seduto', 'Seated leg curl', 'machine', 'hamstrings'],
    ['prova-app-polpacci', 'Polpacci in piedi', 'Standing calf raise', 'other', 'calves'],
  ];
  await must(admin.from('exercises').upsert(ex.map(([code, it, en, equipment]) => ({ code, name: { it, en }, equipment, visibility: 'public', verified: false })), { onConflict: 'code', ignoreDuplicates: true }), 'esercizi');
  const exRows = await must(admin.from('exercises').select('id, code').like('code', 'prova-app-%'), 'esercizi');
  const E = Object.fromEntries(exRows.map((r) => [r.code.replace('prova-app-', ''), r.id]));
  await must(admin.from('exercise_muscles').upsert(ex.map(([code, , , , mus]) => ({ exercise_id: E[code.replace('prova-app-', '')], muscle_code: mus, role: 'primary', weight: 1 })), { onConflict: 'exercise_id,muscle_code', ignoreDuplicates: true }), 'muscoli');
  const mac = [
    ['prova-app-m-panca', 'Marca Finta', 'Incline Press', 'MF-10', 'plate-loaded', { weight_step: 2.5 }],
    ['prova-app-m-lat', 'Marca Finta', 'Lat Pulldown', 'MF-20', 'selectorized', { weight_step: 5, weight_min: 5, weight_max: 100 }],
    ['prova-app-m-alzate', 'Altra Marca', 'Lateral Raise', 'AM-3', 'selectorized', { weight_list: [5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5] }],
    ['prova-app-m-hack', 'Marca Finta', 'Hack Squat', 'MF-40', 'plate-loaded', {}],
    ['prova-app-m-legext-a', 'Marca Finta', 'Leg Extension', 'MF-50', 'selectorized', { weight_step: 5 }],
    ['prova-app-m-legext-b', 'Altra Marca', 'Leg Extension plate', 'AM-6', 'plate-loaded', {}],
    ['prova-app-m-curl', 'Marca Finta', 'Seated Leg Curl', 'MF-70', 'selectorized', { weight_step: 5 }],
  ];
  await must(admin.from('machines').upsert(mac.map(([code, brand, model, brand_code, machine_type, w]) => ({ code, brand, model, brand_code, machine_type, weight_unit: 'kg', visibility: 'public', verified: false, ...w })), { onConflict: 'code', ignoreDuplicates: true }), 'macchine');
  const macRows = await must(admin.from('machines').select('id, code').like('code', 'prova-app-m-%'), 'macchine');
  const M = Object.fromEntries(macRows.map((r) => [r.code.replace('prova-app-m-', ''), r.id]));
  return { E, M };
}

/**
 * Atleta finto con piano e storico. today = 'AAAA-MM-GG' (data locale). Ritorna id, email e i riferimenti utili alle prove.
 */
export async function createFakeAthlete(admin, { email, password, today, history = true }) {
  const { E, M } = await ensureLibrary(admin);
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Atleta App Prova', locale: 'it' } });
  if (error) throw new Error('utente: ' + error.message);
  const U = created.user.id;

  const club = uid();
  await must(admin.from('clubs').insert({ id: club, name: 'Palestra finta', visibility: 'private', verified: false, created_by: U }), 'palestra');
  await must(admin.from('user_clubs').insert({ user_id: U, club_id: club, is_home: true }), 'palestra principale');
  await must(admin.from('club_machines').insert(Object.values(M).map((m) => ({ club_id: club, machine_id: m, added_by: U }))), 'macchine della palestra');

  const plan = uid();
  await must(admin.from('plans').insert({ id: plan, user_id: U, name: 'Piano finto', is_active: true, created_by: U }), 'piano');
  const days = [['UA', 'Upper A'], ['LA', 'Lower A'], ['UB', 'Upper B'], ['LB', 'Lower B']].map(([code, name], i) => ({ id: uid(), plan_id: plan, user_id: U, position: i + 1, code, name }));
  await must(admin.from('plan_days').insert(days), 'giorni');
  const [UA, LA, UB, LB] = days.map((d) => d.id);
  const ss = uid();
  await must(admin.from('plan_supersets').insert({ id: ss, plan_day_id: UB, user_id: U, label: 'A', rest_seconds: 90 }), 'superserie');
  const pe = {};
  const add = (key, day, pos, ex, mac, sets, rmin, rmax, rirMin, rirMax, extra = {}) => {
    pe[key] = { id: uid(), plan_day_id: day, user_id: U, position: pos, exercise_id: E[ex], sets, reps_min: rmin, reps_max: rmax, rir_min: rirMin, rir_max: rirMax, ...extra, _mac: mac };
  };
  add('ua_panca', UA, 1, 'panca', 'panca', 2, 6, 10, 2, 3, { notes: 'Nota finta: schiena appoggiata, mezzo secondo fermo.' });
  add('ua_lat', UA, 2, 'lat', 'lat', 2, 8, 12, 1, 2);
  add('ua_alzate', UA, 3, 'alzate', 'alzate', 2, 12, 20, 0, 1);
  add('la_hack', LA, 1, 'hack', 'hack', 2, 6, 10, 0, 1);
  add('la_legext_a', LA, 2, 'legext', 'legext-a', 1, 10, 15, 0, 1);
  add('la_legext_b', LA, 3, 'legext', 'legext-b', 1, 10, 15, 0, 1);
  add('la_polpacci', LA, 4, 'polpacci', null, 1, 10, 15, 0, 1);
  add('ub_alzate', UB, 1, 'alzate', 'alzate', 2, 12, 20, 0, 1, { superset_id: ss });
  add('ub_lat', UB, 2, 'lat', 'lat', 2, 8, 12, 1, 2, { superset_id: ss });
  add('ub_panca', UB, 3, 'panca', 'panca', 2, 6, 10, 2, 3);
  add('lb_curl', LB, 1, 'curl', 'curl', 2, 8, 12, 0, 1);
  add('lb_hack', LB, 2, 'hack', 'hack', 1, 8, 12, 1, 2);
  await must(admin.from('plan_exercises').insert(Object.values(pe).map(({ _mac, ...r }) => r)), 'esercizi del piano');
  await must(admin.from('plan_exercise_machines').insert(Object.values(pe).filter((r) => r._mac).map((r) => ({ plan_exercise_id: r.id, user_id: U, club_id: club, machine_id: M[r._mac] }))), 'macchine del piano');

  const ref = { userId: U, email, club, plan, days: { UA, LA, UB, LB }, pe: Object.fromEntries(Object.entries(pe).map(([k, v]) => [k, v.id])), E, M, sessions: {} };
  if (!history) return ref;

  // Storico: [giorni fa, giorno, stile import (senza legame al piano)?, esercizi: [chiave piano, [[kg, reps, rir, cancellata?], ...]]]
  const hist = [
    [-9, 'Upper A', true, [['ua_panca', [[77.5, 9, 2], [77.5, 8, 2]]], ['ua_lat', [[55, 12, 1], [55, 12, 1]]], ['ua_alzate', [[12.5, 18, 0], [12.5, 16, 0]]]]],
    [-7, 'Lower A', true, [['la_hack', [[100, 8, 1], [100, 7, 0]]], ['la_legext_a', [[60, 13, 0]]], ['la_legext_b', [[40, 12, 0]]], ['la_polpacci', [[90, 12, 1]]]]],
    [-5, 'Upper B', false, [['ub_alzate', [[12.5, 20, 0], [12.5, 19, 0]]], ['ub_lat', [[60, 9, 1], [60, 8, 1]]], ['ub_panca', [[80, 9, 2], [80, 8, 2]]]]],
    [-3, 'Lower B', false, [['lb_curl', [[45, 12, 0], [45, 11, 0]]], ['lb_hack', [[90, 11, 1]]]]],
    [-2, 'Upper A', false, [['ua_panca', [[80, 10, 2], [80, 10, 2], [999, 1, 0, true]]], ['ua_lat', [[60, 9, 1], [60, 8, 1]]], ['ua_alzate', [[15, 14, 0], [15, 12, 0]]]]],
    [-1, 'Lower A', false, [['la_hack', [[100, 9, 1], [100, 8, 0]]], ['la_legext_a', [[65, 12, 0]]], ['la_polpacci', [[90, 13, 1]]]]],
  ];
  const peById = Object.fromEntries(Object.entries(pe).map(([k, v]) => [k, v]));
  const dayByName = Object.fromEntries(days.map((d) => [d.name, d.id]));
  const S = [], SE = [], ST = [];
  for (const [n, dayName, imported, exs] of hist) {
    const date = D(today, n), sid = uid();
    ref.sessions[n] = sid;
    S.push({ id: sid, user_id: U, session_date: date, started_at: date + 'T08:00:00Z', club_id: club, day_name: dayName,
      plan_id: imported ? null : plan, plan_day_id: imported ? null : dayByName[dayName] });
    exs.forEach(([key, sets], i) => {
      const p = peById[key], seid = uid();
      SE.push({ id: seid, session_id: sid, user_id: U, position: i + 1, exercise_id: p.exercise_id, machine_id: p._mac ? M[p._mac] : null,
        plan_exercise_id: imported ? null : p.id, target_sets: p.sets, target_reps_min: p.reps_min, target_reps_max: p.reps_max });
      sets.forEach(([kg, reps, rir, del], j) => ST.push({ id: uid(), session_exercise_id: seid, user_id: U, set_number: j + 1, set_type: 'normal',
        weight_kg: kg, reps, rir, input_weight: kg, input_unit: 'kg', performed_at: date + 'T08:' + String(10 + i * 5 + j).padStart(2, '0') + ':00Z',
        deleted_at: del ? date + 'T09:00:00Z' : null }));
    });
  }
  await must(admin.from('sessions').insert(S), 'sedute');
  await must(admin.from('session_exercises').insert(SE), 'esercizi delle sedute');
  await must(admin.from('sets').insert(ST), 'serie');
  return ref;
}

export async function deleteFakeAthlete(admin, userId) {
  // Le righe dell'utente si cancellano a cascata con l'account; la palestra privata pure (created_by).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error('cancellazione utente: ' + error.message);
}

export const randomPassword = () => crypto.randomBytes(18).toString('base64url');
