// Pagine della barra in basso: Program (piano) e Progress (storico). Solo lettura.
// Logica pura (nessun DOM, nessuna rete, nessuna scrittura): usa i dati già sul telefono
// (piano scaricato in "snap", sedute e serie in IndexedDB). Si prova con tests/unit/pagine.test.js.
import { setsOf } from './logic.js';

export const PAGES = ['program', 'track', 'progress'];
export const START_PAGE = 'track';   // pagina di partenza: dopo l'accesso e a ogni riavvio dell'app

/**
 * Tasto indietro del telefono: Track è la base; Program e Progress sono UN passo sopra.
 * Da Track a un'altra pagina si aggiunge un passo ('push'); tra Program e Progress si sostituisce ('replace');
 * tornando a Track si toglie il passo aggiunto ('back'). Così "indietro" da Program/Progress porta a Track,
 * e "indietro" da Track fa quello che faceva prima (esce dall'app).
 */
export function navStep(from, to, hasStep) {
  if (from === to || !PAGES.includes(to)) return null;
  if (to === START_PAGE) return hasStep ? 'back' : null;
  return hasStep ? 'replace' : 'push';
}

/** Pagina da mostrare dopo il tasto indietro/avanti del browser (stato della cronologia). */
export function pageFromState(state) {
  const p = state && state.gymPage;
  return PAGES.includes(p) ? p : START_PAGE;
}

/** Esercizi del piano per esercizio, macchine e giorni (per dare nome e macchina alle righe dello storico). */
function planIndex(plan) {
  const byEx = new Map(), machines = new Map(), days = new Map();
  for (const d of (plan && plan.days) || []) {
    days.set(d.id, d);
    for (const pe of d.exercises) {
      if (pe.exercise_id && !byEx.has(pe.exercise_id)) byEx.set(pe.exercise_id, pe);
      for (const m of [pe.machine, pe.alt_machine]) if (m && m.id && !machines.has(m.id)) machines.set(m.id, m);
    }
  }
  return { byEx, machines, days };
}

/**
 * Storico per la pagina Progress: sedute con almeno una serie, dalla più recente.
 * Comprende anche la seduta di oggi (una serie appena salvata compare subito).
 * Righe cancellate fuori (indexRows le toglie già).
 * Nome dell'esercizio: dalla libreria esercizi tramite exercise_id (`names`, scaricati con lo storico), così resta
 * giusto anche se l'esercizio è uscito dal piano, è archiviato o la riga del piano oggi punta a un altro esercizio.
 * Se il nome non c'è (per esempio prima del primo scaricamento), quello dello stesso exercise_id nel piano
 * (anche lui viene dalla libreria). Nessuno dei due: nome vuoto (la pagina mostra "—"). Macchine dal piano, come prima.
 */
export function historyList(idx, plan, names = null) {
  const P = planIndex(plan);
  const libName = (id) => (names && id && names[id]) || null;
  const out = [];
  for (const s of idx.sessions.values()) {
    const exercises = [];
    const ses = [...(idx.seBySession.get(s.id) || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const se of ses) {
      const sets = setsOf(idx, se.id);
      if (!sets.length) continue;
      const pe = P.byEx.get(se.exercise_id) || null;
      exercises.push({
        id: se.id,
        exerciseId: se.exercise_id,
        machineId: se.machine_id || null,
        name: libName(se.exercise_id) || (pe && pe.exercise ? pe.exercise.name : null),
        machine: (se.machine_id && P.machines.get(se.machine_id)) || null,
        sets,
      });
    }
    if (!exercises.length) continue;
    const day = s.plan_day_id && P.days.get(s.plan_day_id);
    const dayName = day ? day.name : s.day_name || '';
    out.push({
      id: s.id, date: s.session_date, dayName, dayKey: dayKeyOf(s.plan_day_id, dayName), ended: !!s.ended_at,
      start: s.started_at || s.created_at || '', exercises,
      setCount: exercises.reduce((a, e) => a + e.sets.length, 0),
    });
  }
  return out.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0) || String(b.start).localeCompare(String(a.start)));
}

/** Chiave del workout di una seduta: il giorno del piano, altrimenti il nome salvato (sedute vecchie). */
const dayKeyOf = (dayId, name) => (dayId ? 'd:' + dayId : name ? 'n:' + name : '');

/**
 * Scelte dei due filtri della History, prese dallo storico (solo quello che c'è davvero):
 * workout nell'ordine del piano (poi quelli fuori piano), esercizi una volta sola (per esercizio, qualsiasi macchina).
 */
export function historyFilterOptions(list, plan) {
  const order = new Map(((plan && plan.days) || []).map((d, i) => [dayKeyOf(d.id, d.name), i]));
  const days = new Map(), exercises = new Map();
  for (const s of list) {
    if (s.dayKey && !days.has(s.dayKey)) days.set(s.dayKey, { key: s.dayKey, name: s.dayName });
    for (const e of s.exercises) if (e.exerciseId && (!exercises.has(e.exerciseId) || !exercises.get(e.exerciseId).name)) exercises.set(e.exerciseId, { id: e.exerciseId, name: e.name });
  }
  const pos = (d) => (order.has(d.key) ? order.get(d.key) : 1e6);
  return {
    days: [...days.values()].sort((a, b) => pos(a) - pos(b) || String(a.name).localeCompare(String(b.name))),
    exercises: [...exercises.values()],
  };
}

/**
 * History filtrata: per workout (dayKey) e/o per esercizio (exerciseId). Con l'esercizio restano solo le sue righe
 * (cronologia di quell'esercizio, dalla più recente). Filtro vuoto = tutto. Non cambia la lista di partenza.
 */
export function filterHistory(list, { day = '', exercise = '' } = {}) {
  const out = [];
  for (const s of list) {
    if (day && s.dayKey !== day) continue;
    if (!exercise) { out.push(s); continue; }
    const exercises = s.exercises.filter((e) => e.exerciseId === exercise);
    if (!exercises.length) continue;
    out.push({ ...s, exercises, setCount: exercises.reduce((a, e) => a + e.sets.length, 0) });
  }
  return out;
}

/**
 * Scelte del grafico: una per esercizio + macchina (macchine diverse non si mischiano), con il numero di sedute.
 * `multi` = quell'esercizio è stato fatto su più di una macchina (allora la macchina si mostra nel nome).
 * Ordine: l'esercizio fatto più di recente per primo.
 */
export function chartChoices(list) {
  const map = new Map();
  for (const s of list) {
    for (const e of s.exercises) {
      if (!e.exerciseId) continue;
      const key = e.exerciseId + '|' + (e.machineId || '');
      const c = map.get(key) || { key, exerciseId: e.exerciseId, machineId: e.machineId, name: e.name, machine: e.machine, sessions: new Set(), last: '' };
      c.sessions.add(s.id);
      if (!c.name) c.name = e.name;
      if (s.date > c.last) c.last = s.date;
      map.set(key, c);
    }
  }
  const perEx = new Map();
  for (const c of map.values()) perEx.set(c.exerciseId, (perEx.get(c.exerciseId) || 0) + 1);
  return [...map.values()]
    .map(({ sessions, ...c }) => ({ ...c, count: sessions.size, multi: perEx.get(c.exerciseId) > 1 }))
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || a.key.localeCompare(b.key));
}
