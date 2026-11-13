// Export dello storico in CSV per Excel in italiano. Logica pura (nessun DOM, nessuna rete):
// le serie arrivano da Supabase (api.exportSets, a pagine), diventano le righe di sempre (sessions, session_exercises,
// sets), passano da historyList (pages.js) come lo Storico in Progressi, e alla fine si ha il testo del file.
// Si prova con tests/unit/esporta.test.js.
import { historyList, historyFilterOptions } from './pages.js';
import { tr } from './i18n.js';
import { machineLabel, indexRows, addDays } from './logic.js';

export const CSV_HEADER = ['Data', 'Workout', 'Giorno piano', 'Esercizio', 'Macchina', 'Serie', 'Peso (kg)', 'Ripetizioni', 'RIR', 'Note'];
export const CSV_BOM = '﻿';
export const CSV_SEP = ';';
export const CSV_EOL = '\r\n';

/** Periodi che si possono scegliere prima dell'export (giorni, oppure tutto). Di base: tutto. */
export const EXPORT_PERIODS = ['14', '30', '90', 'all'];
export const DEFAULT_PERIOD = 'all';

/** Righe per richiesta a Supabase: il server ne dà al massimo 1000, quindi si va a pagine. */
export const EXPORT_PAGE = 1000;

/**
 * Primo giorno del periodo ('AAAA-MM-GG'), contato sulla data della seduta, con oggi incluso:
 * 14 giorni = oggi e i 13 giorni prima (una seduta di esattamente 14 giorni fa resta fuori). Tutto = null.
 */
export function periodFrom(today, period) {
  if (!period || period === 'all') return null;
  const n = Number(period);
  return Number.isInteger(n) && n > 0 ? addDays(today, -(n - 1)) : null;
}

/** Sedute del periodo (dalla data della seduta in poi; nessun limite = tutte). Non cambia la lista di partenza. */
export const inPeriod = (list, from) => (from ? list.filter((s) => s.date >= from) : list);

/** Nome del file: storico-allenamenti-tutto-AAAA-MM-GG.csv oppure storico-allenamenti-30gg-AAAA-MM-GG.csv. */
export const exportFileName = (dateKey, period = DEFAULT_PERIOD) =>
  'storico-allenamenti-' + (!period || period === 'all' ? 'tutto' : period + 'gg') + '-' + dateKey + '.csv';

/**
 * Scarica TUTTE le pagine: chiede `pageSize` righe alla volta (fetchPage(da, a) → { data } | { error })
 * e va avanti finché una pagina arriva vuota. Si conta quello che arriva davvero, così funziona anche se il
 * server dà meno righe di quelle chieste. maxPages: freno di sicurezza (errore, mai un export a metà).
 */
export async function fetchAllPages(fetchPage, pageSize = EXPORT_PAGE, maxPages = 1000) {
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const from = all.length;
    const r = await fetchPage(from, from + pageSize - 1);
    if (!r || r.error) return { error: (r && r.error) || { code: '', message: 'no response' } };
    const got = r.data || [];
    if (!got.length) return { data: all };
    for (const x of got) all.push(x);
  }
  return { error: { code: 'too-many-pages', message: 'too many pages' } };
}

/**
 * Serie scaricate per l'export (ognuna con la sua session_exercises e la sua sessions dentro) → righe come quelle
 * sul telefono, più i nomi degli esercizi e le macchine dalla libreria (come history() in api.js).
 */
export function exportRowsFromSets(sets) {
  const sessions = new Map(), ses = new Map(), rows = [], exerciseNames = {}, machineInfo = {};
  for (const st of sets || []) {
    const { session_exercises: se, ...sd } = st;
    if (!se) continue;
    const { sessions: s, exercise, machine, ...sed } = se;
    if (!s) continue;
    if (!sessions.has(s.id)) sessions.set(s.id, s);
    if (!ses.has(sed.id)) ses.set(sed.id, sed);
    if (exercise && exercise.id && exercise.name) exerciseNames[exercise.id] = exercise.name;
    if (machine && machine.id) {
      const { id, code, brand, model, brand_code, name } = machine;
      machineInfo[id] = { id, code, brand, model, brand_code, name };
    }
    rows.push({ table: 'sets', data: sd });
  }
  for (const s of sessions.values()) rows.push({ table: 'sessions', data: s });
  for (const se of ses.values()) rows.push({ table: 'session_exercises', data: se });
  return { rows, exerciseNames, machineInfo };
}

/**
 * Dalle serie scaricate alle righe del CSV, per il periodo scelto. Stessa strada dello Storico (indexRows,
 * historyList: sedute e serie cancellate fuori, nomi e macchine dalla libreria), poi il periodo, poi historyCsvRows.
 */
export function exportFromSets(sets, plan, { today, period = DEFAULT_PERIOD, lang = 'it', timeZone } = {}) {
  const { rows, exerciseNames, machineInfo } = exportRowsFromSets(sets);
  const list = inPeriod(historyList(indexRows(rows), plan, exerciseNames, machineInfo), periodFrom(today, period));
  return historyCsvRows(list, plan, { lang, timeZone });
}

/**
 * Data gg/mm/aaaa nel fuso orario del telefono (mai UTC).
 * 'AAAA-MM-GG' (session_date) è già il giorno del telefono quando la seduta è iniziata: si gira il testo, senza Date
 * (new Date('2026-11-13') sarebbe la mezzanotte UTC, cioè il giorno prima nei fusi dietro UTC).
 * Un orario completo (ISO con fuso) si converte nel fuso indicato; timeZone vuoto = quello del telefono.
 */
export function csvDate(value, timeZone) {
  if (!value) return '';
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: timeZone || undefined, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d)) p[x.type] = x.value;
  return p.day + '/' + p.month + '/' + p.year;
}

/** Numero con la virgola (82,5), al massimo 2 decimali, niente separatore delle migliaia. Vuoto se manca. */
export function csvNumber(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r).replace('.', ',');
}

/** Testo libero: se inizia con = + - @ un apostrofo davanti, così Excel non lo prende per una formula. */
export function csvSafeText(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** Un campo del file: tra virgolette (con le " interne raddoppiate) se contiene ; " o un a capo. */
export function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const byStart = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || String(a.start).localeCompare(String(b.start)) || String(a.id).localeCompare(String(b.id));

/**
 * Righe del CSV (senza intestazione): una per ogni serie registrata, dalla seduta più vecchia alla più nuova,
 * poi nell'ordine degli esercizi della seduta, poi per numero di serie. Tutto lo storico, nessun filtro.
 * Workout = il nome del tipo di workout come nel filtro dello Storico. Giorno piano = il giorno del piano della seduta
 * (vuoto se la seduta non ne ha uno, come le sedute vecchie importate). Peso sempre in kg (come salvato).
 */
export function historyCsvRows(list, plan, { lang = 'it', timeZone } = {}) {
  const workout = new Map(historyFilterOptions(list, plan).days.map((d) => [d.key, d.name]));
  const planDays = new Map(((plan && plan.days) || []).map((d) => [d.id, d.name]));
  const rows = [];
  for (const s of [...list].sort(byStart)) {
    const date = csvDate(s.date, timeZone) || csvDate(s.start, timeZone);
    const planDay = s.planDayId ? planDays.get(s.planDayId) || s.dayName || '' : '';
    for (const e of s.exercises) {
      const m = e.machine;
      const machine = m ? machineLabel(m) || tr(m.name, lang) || m.code || '' : '';
      for (const x of [...e.sets].sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))) {
        rows.push([
          date,
          csvSafeText(workout.get(s.dayKey) || ''),
          csvSafeText(planDay),
          csvSafeText(tr(e.name, lang)),
          csvSafeText(machine),
          x.set_number == null ? '' : String(x.set_number),
          csvNumber(x.weight_kg),
          csvNumber(x.reps),
          csvNumber(x.rir),
          csvSafeText(x.notes),
        ]);
      }
    }
  }
  return rows;
}

/** Testo del file: BOM UTF-8, intestazione, righe separate da CRLF (anche dopo l'ultima). */
export function toCsv(rows) {
  return CSV_BOM + [CSV_HEADER, ...rows].map((r) => r.map(csvField).join(CSV_SEP)).join(CSV_EOL) + CSV_EOL;
}
