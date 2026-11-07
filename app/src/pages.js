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

/** Esercizi del piano per id e per esercizio (per dare un nome alle righe dello storico). */
function planIndex(plan) {
  const byPe = new Map(), byEx = new Map(), machines = new Map(), days = new Map();
  for (const d of (plan && plan.days) || []) {
    days.set(d.id, d);
    for (const pe of d.exercises) {
      byPe.set(pe.id, pe);
      if (pe.exercise_id && !byEx.has(pe.exercise_id)) byEx.set(pe.exercise_id, pe);
      for (const m of [pe.machine, pe.alt_machine]) if (m && m.id && !machines.has(m.id)) machines.set(m.id, m);
    }
  }
  return { byPe, byEx, machines, days };
}

/**
 * Storico per la pagina Progress: sedute con almeno una serie, dalla più recente.
 * Comprende anche la seduta di oggi (una serie appena salvata compare subito).
 * Righe cancellate fuori (indexRows le toglie già). Nomi e macchine dal piano sul telefono;
 * un esercizio che non è più nel piano resta con nome vuoto (la pagina mostra "—").
 */
export function historyList(idx, plan) {
  const P = planIndex(plan);
  const out = [];
  for (const s of idx.sessions.values()) {
    const exercises = [];
    const ses = [...(idx.seBySession.get(s.id) || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const se of ses) {
      const sets = setsOf(idx, se.id);
      if (!sets.length) continue;
      const pe = (se.plan_exercise_id && P.byPe.get(se.plan_exercise_id)) || P.byEx.get(se.exercise_id) || null;
      exercises.push({
        id: se.id,
        name: pe && pe.exercise ? pe.exercise.name : null,
        machine: (se.machine_id && P.machines.get(se.machine_id)) || null,
        sets,
      });
    }
    if (!exercises.length) continue;
    const day = s.plan_day_id && P.days.get(s.plan_day_id);
    out.push({
      id: s.id, date: s.session_date, dayName: day ? day.name : s.day_name || '', ended: !!s.ended_at,
      start: s.started_at || s.created_at || '', exercises,
      setCount: exercises.reduce((a, e) => a + e.sets.length, 0),
    });
  }
  return out.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0) || String(b.start).localeCompare(String(a.start)));
}
