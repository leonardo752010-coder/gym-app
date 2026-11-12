// Logica pura dell'app (nessun DOM, nessuna rete): si prova con i test in tests/unit.
// Le "righe" sono quelle del database (sessions, session_exercises, sets) con i nomi delle colonne di Supabase.

export const LB = 0.45359237;

/**
 * Suggerimento, serie dopo la top: se la volta scorsa la prima serie a RIR 1-2 ha fatto almeno
 * questo numero di rep sopra il minimo del range, oggi sale anche lei al peso nuovo (vedi suggest()).
 */
export const REP_SOPRA_MINIMO_PER_SALIRE = 2;

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

/** Ore dopo l'ultima serie in cui una seduta del giorno prima resta "in corso" (allenamento a cavallo della mezzanotte). */
export const OPEN_HOURS = 3;

const ms = (t) => (t ? Date.parse(t) || 0 : 0);
const sameDay = (s, day) => (s.plan_day_id ? s.plan_day_id === day.id : !!s.day_name && s.day_name === day.name);
const startKey = (s) => ms(s.started_at || s.created_at);

/** Momento (in ms) dell'ultima attività di una seduta: l'ultima serie salvata, altrimenti l'inizio. 0 se non si sa. */
export function lastActivity(idx, s) {
  let t = ms(s.started_at);
  for (const se of idx.seBySession.get(s.id) || []) for (const x of setsOf(idx, se.id)) t = Math.max(t, ms(x.performed_at));
  return t;
}

/**
 * Sedute "in corso" per un giorno del piano, dalla più vecchia. Regola:
 * - una seduta è in corso se è di OGGI (data del calendario) e non è chiusa (ended_at vuoto: il tasto "Fine seduta" lo scrive);
 * - unica eccezione: una seduta del giorno prima, non chiusa, con l'ultima serie da meno di OPEN_HOURS ore
 *   (allenamento iniziato prima di mezzanotte e finito dopo).
 * Tutte le altre sono passate: le loro serie restano nel database e diventano la "volta scorsa".
 * Di solito ce n'è al massimo una; due solo se due telefoni (o due schede) l'hanno iniziata senza rete.
 * Aprire l'app non crea niente: la seduta nasce con la prima serie salvata (session.js).
 */
export function openSessions(idx, { date, day, now = new Date() }) {
  return currentSessions(idx, { date, day, now }).filter((s) => !s.ended_at);
}

/** Sedute "di adesso" per un giorno del piano (di oggi, o di ieri entro OPEN_HOURS), chiuse o no, dalla più vecchia. */
function currentSessions(idx, { date, day, now = new Date() }) {
  const out = [];
  const nowMs = now.getTime(), yesterday = addDays(date, -1);
  for (const s of idx.sessions.values()) {
    if (!sameDay(s, day)) continue;
    if (s.session_date === date) out.push(s);
    else if (s.session_date === yesterday) {
      const t = lastActivity(idx, s);
      if (t && nowMs - t < OPEN_HOURS * 3600e3) out.push(s);
    }
  }
  return out.sort((a, b) => startKey(a) - startKey(b) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Seduta chiusa con il tasto "Fine seduta" che si può ancora riaprire (rimedio al tocco per sbaglio):
 * l'ultima chiusa tra quelle "di adesso", solo se nel frattempo non è iniziata una seduta nuova. Altrimenti null.
 */
export function reopenable(idx, opts) {
  const cur = currentSessions(idx, opts);
  if (cur.some((s) => !s.ended_at)) return null;
  let best = null;
  for (const s of cur) if (!best || ms(s.ended_at) > ms(best.ended_at)) best = s;
  return best;
}

/** La seduta in corso per un giorno del piano (quella dove vanno le serie nuove), o null. */
export function findSession(idx, opts) {
  return openSessions(idx, opts)[0] || null;
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

/** Serie di un esercizio del piano nelle sedute in corso (di solito una sola seduta), in ordine. */
export function setsInSessions(idx, sessions, pe) {
  const out = [];
  for (const s of sessions) { const se = findSessionExercise(idx, s.id, pe); if (se) out.push(...setsOf(idx, se.id)); }
  if (sessions.length > 1) out.sort((a, b) => ms(a.performed_at) - ms(b.performed_at) || a.set_number - b.set_number);
  return out;
}

const isWorking = (s) => s.set_type !== 'warmup';

/**
 * "Volta scorsa": l'ultima seduta (diversa da quelle in corso) in cui l'esercizio è stato fatto,
 * sulla stessa macchina se il piano ne indica una. Solo serie non cancellate e non di riscaldamento.
 * excludeSessionId: un id o una lista di id (le sedute in corso).
 */
export function lastPerformance(idx, pe, opts = {}) {
  return lastPerformances(idx, pe, opts, 1)[0] || null;
}

/**
 * Le ultime `count` volte (dalla più recente) con le stesse regole di lastPerformance: stessa macchina se il
 * piano ne indica una, sedute escluse fuori, solo serie non cancellate e non di riscaldamento.
 * Un esercizio fatto due volte nella stessa seduta conta una volta sola (la più recente), come prima.
 * Serve al tasto "History" dell'esercizio. Solo lettura.
 */
export function lastPerformances(idx, pe, { excludeSessionId = null, onOrBefore = null } = {}, count = 3) {
  const mac = machineOf(pe);
  const excl = new Set([].concat(excludeSessionId ?? []));
  const bySession = new Map();
  for (const se of idx.sesEx.values()) {
    if (se.exercise_id !== pe.exercise_id) continue;
    if (mac && se.machine_id !== mac) continue;
    const s = idx.sessions.get(se.session_id);
    if (!s || excl.has(s.id)) continue;
    if (onOrBefore && s.session_date > onOrBefore) continue;
    const sets = setsOf(idx, se.id).filter(isWorking);
    if (!sets.length) continue;
    const when = s.session_date + '|' + (sets[sets.length - 1].performed_at || '');
    const cur = bySession.get(s.id);
    if (!cur || when > cur.when) bySession.set(s.id, { when, date: s.session_date, sessionId: s.id, machineId: se.machine_id || null, sets });
  }
  return [...bySession.values()].sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0)).slice(0, Math.max(0, count)).map((best) => ({
    date: best.date, sessionId: best.sessionId, machineId: best.machineId,
    sets: best.sets.map((s, i) => ({ n: i + 1, kg: num(s.weight_kg), reps: s.reps, rir: s.rir == null ? null : num(s.rir), input_weight: num(s.input_weight), input_unit: s.input_unit })),
  }));
}

/**
 * e1RM (massimale stimato) di una serie: kg × (1 + (reps + RIR) / 30). RIR mancante = 0.
 * null se mancano kg o reps (o non sono numeri validi). Nessun arrotondamento: lo fa chi mostra il numero.
 */
export function e1rm(kg, reps, rir) {
  if (kg == null || kg === '' || reps == null || reps === '') return null;
  const w = Number(kg), r = Number(reps), x = rir == null || rir === '' ? 0 : Number(rir);
  if (!Number.isFinite(w) || !Number.isFinite(r) || !Number.isFinite(x) || w < 0 || r < 0) return null;
  return w * (1 + (r + x) / 30);
}

/**
 * Punti del grafico per un esercizio su UNA macchina (machineId null = senza macchina; macchine diverse non si mischiano).
 * Un punto per seduta: l'e1RM della serie migliore (riscaldamento escluso, serie senza kg o reps saltate).
 * Dalla più vecchia. Ogni punto ha anche le serie di quel giorno (per il tocco sul punto). Solo lettura.
 */
export function e1rmPoints(idx, exerciseId, machineId) {
  const bySession = new Map();
  for (const se of idx.sesEx.values()) {
    if (se.exercise_id !== exerciseId || (se.machine_id || null) !== (machineId || null)) continue;
    const s = idx.sessions.get(se.session_id);
    if (!s) continue;
    const sets = setsOf(idx, se.id).filter(isWorking);
    if (!sets.length) continue;
    const p = bySession.get(s.id) || { sessionId: s.id, date: s.session_date, start: s.started_at || s.created_at || '', best: null, bestSet: null, sets: [] };
    for (const x of sets) {
      p.sets.push(x);
      const v = e1rm(x.weight_kg, x.reps, x.rir);
      if (v != null && (p.best == null || v > p.best)) { p.best = v; p.bestSet = x; }
    }
    bySession.set(s.id, p);
  }
  return [...bySession.values()].filter((p) => p.best != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.start).localeCompare(String(b.start))));
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
 * Doppia progressione con serie top (il riscaldamento è già fuori: lastPerformance lo esclude).
 * - Serie top = la prima serie a RIR 0 della volta scorsa; oggi resta allo stesso numero di serie.
 *   Se aveva fatto il massimo del range: un salto di peso (della macchina) e rep al minimo.
 *   Altrimenti: stesso peso, una rep in più.
 * - Serie dopo: guardano la prima serie a RIR 1-2 della volta scorsa (fatta col peso vecchio).
 *   Se la top sale e quella serie aveva almeno REP_SOPRA_MINIMO_PER_SALIRE rep sopra il minimo:
 *   un salto di peso anche per loro, rep al minimo. Altrimenti: peso vecchio, una rep in più.
 *   Senza una serie a RIR 1-2: ognuna resta col suo peso vecchio, una rep in più.
 * - Nessuna serie a RIR 0 (o RIR mancante, dati vecchi): stesso peso e una rep in più, niente salita.
 * "Una rep in più" va al minimo se si era sotto, e mai oltre il massimo (al massimo: 'hold').
 * Restituisce un suggerimento per ogni serie del piano (nell'unità mostrata).
 */
export function suggest(pe, last, unit) {
  if (!last || !last.sets.length) return null;
  const max = pe.reps_max ?? null, min = pe.reps_min ?? max;
  const sets = last.sets;
  const count = Math.max(pe.sets || 0, 1);
  const rirIn = (s, lo, hi) => s.rir != null && s.rir !== '' && Number(s.rir) >= lo && Number(s.rir) <= hi;
  const oneMore = (n, w, reps) => {
    if (max != null && reps >= max) return { n, weight: w, reps, why: 'hold' };
    const target = min != null && reps < min ? min : reps + 1;
    return { n, weight: w, reps: max != null ? Math.min(target, max) : target, why: 'reps' };
  };
  const goUp = (n, w, reps) => {
    const up = stepWeight(w, pe.machine, unit, +1);
    return up > w ? { n, weight: up, reps: min, why: 'up' } : { n, weight: w, reps, why: 'hold' };
  };
  const lastOf = (n) => sets[n - 1] || sets[sets.length - 1];

  const ti = sets.findIndex((s) => rirIn(s, 0, 0));
  const out = [];
  if (ti < 0) {
    for (let n = 1; n <= count; n++) { const ls = lastOf(n); out.push(oneMore(n, setWeightIn(ls, unit), ls.reps)); }
    return { topped: false, sets: out };
  }
  const top = sets[ti], topN = Math.min(ti + 1, count), topW = setWeightIn(top, unit);
  const topped = max != null && top.reps >= max;
  const ref = sets.find((s) => rirIn(s, 1, 2));
  for (let n = 1; n <= count; n++) {
    if (n === topN) out.push(topped ? goUp(n, topW, top.reps) : oneMore(n, topW, top.reps));
    else if (ref) {
      const refW = setWeightIn(ref, unit);
      out.push(topped && ref.reps >= min + REP_SOPRA_MINIMO_PER_SALIRE ? goUp(n, refW, ref.reps) : oneMore(n, refW, ref.reps));
    } else { const ls = lastOf(n); out.push(oneMore(n, setWeightIn(ls, unit), ls.reps)); }
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
 * Giorno da proporre: quello con una seduta in corso (vedi openSessions; se più d'una, la più recente);
 * altrimenti il giorno dopo l'ultimo fatto (rotazione per allenamenti fatti, anche se lasciati a metà);
 * altrimenti il primo.
 */
export function defaultDay(plan, idx, today, now = new Date()) {
  const days = plan.days;
  if (!days.length) return null;
  const hasSets = (s) => (idx.seBySession.get(s.id) || []).some((se) => setsOf(idx, se.id).length);
  let cur = null;
  for (const d of days) {
    for (const s of openSessions(idx, { date: today, day: d, now })) {
      if (!hasSets(s)) continue;
      const t = lastActivity(idx, s);
      if (!cur || t > cur.t) cur = { t, d };
    }
  }
  if (cur) return cur.d;
  const dayOf = (s) => days.find((d) => sameDay(s, d));
  let last = null;
  for (const s of idx.sessions.values()) {
    const d = dayOf(s);
    if (!d || !hasSets(s) || s.session_date > today) continue;
    const key = s.session_date + '|' + String(startKey(s)).padStart(15, '0');
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
