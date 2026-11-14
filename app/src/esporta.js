// Export dello storico in un file Excel (.xlsx). Logica senza DOM e senza rete:
// le serie arrivano da Supabase (api.exportSets, a pagine), diventano le righe di sempre (sessions, session_exercises,
// sets), passano da historyList (pages.js) come lo Storico in Progressi, poi diventano righe con tipi veri (data,
// numeri, testo) e alla fine il file .xlsx. La libreria che scrive il file (write-excel-file) si carica solo al
// momento dell'export (import dinamico in buildXlsx), così non pesa sull'apertura dell'app.
// Si prova con tests/unit/esporta.test.js.
import { historyList, historyFilterOptions } from './pages.js';
import { tr } from './i18n.js';
import { machineLabel, indexRows, addDays } from './logic.js';

export const XLSX_HEADER = ['Data', 'Workout', 'Giorno piano', 'Esercizio', 'Macchina', 'Serie', 'Peso (kg)', 'Ripetizioni', 'RIR', 'Note'];
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSX_SHEET = 'Storico';
/** Formato della colonna Data: giorno/mese/anno, uguale con Excel in qualsiasi lingua. */
export const XLSX_DATE_FORMAT = 'dd/mm/yyyy';
/** Chiavi delle righe, nello stesso ordine delle colonne. */
export const ROW_KEYS = ['date', 'workout', 'planDay', 'exercise', 'machine', 'set', 'weight', 'reps', 'rir', 'notes'];
const NUM_KEYS = new Set(['set', 'weight', 'reps', 'rir']);

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

/** Nome del file: storico-allenamenti-tutto-AAAA-MM-GG.xlsx oppure storico-allenamenti-30gg-AAAA-MM-GG.xlsx. */
export const exportFileName = (dateKey, period = DEFAULT_PERIOD) =>
  'storico-allenamenti-' + (!period || period === 'all' ? 'tutto' : period + 'gg') + '-' + dateKey + '.xlsx';

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
 * Dalle serie scaricate alle righe del file, per il periodo scelto. Stessa strada dello Storico (indexRows,
 * historyList: sedute e serie cancellate fuori, nomi e macchine dalla libreria), poi il periodo, poi historyRows.
 */
export function exportFromSets(sets, plan, { today, period = DEFAULT_PERIOD, lang = 'it', timeZone } = {}) {
  const { rows, exerciseNames, machineInfo } = exportRowsFromSets(sets);
  const list = inPeriod(historyList(indexRows(rows), plan, exerciseNames, machineInfo), periodFrom(today, period));
  return historyRows(list, plan, { lang, timeZone });
}

/**
 * Giorno 'AAAA-MM-GG' nel fuso orario del telefono (mai UTC).
 * 'AAAA-MM-GG' (session_date) è già il giorno del telefono quando la seduta è iniziata: resta com'è, senza Date
 * (new Date('2026-11-13') sarebbe la mezzanotte UTC, cioè il giorno prima nei fusi dietro UTC).
 * Un orario completo (ISO con fuso) si converte nel fuso indicato; timeZone vuoto = quello del telefono.
 */
export function dayKeyIn(value, timeZone) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: timeZone || undefined, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d)) p[x.type] = x.value;
  return p.year + '-' + p.month + '-' + p.day;
}

/**
 * Giorno 'AAAA-MM-GG' → data per Excel: la mezzanotte UTC di quel giorno. La libreria la scrive come numero di
 * giorni di Excel contato in UTC, quindi nel file c'è esattamente quel giorno, in qualsiasi fuso.
 */
export function excelDate(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/** Numero vero, al massimo 2 decimali; null se manca (cella vuota). */
export function cellNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

const text = (v) => (v == null ? '' : String(v));
const byStart = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || String(a.start).localeCompare(String(b.start)) || String(a.id).localeCompare(String(b.id));

/**
 * Righe del file (senza intestazione): una per ogni serie registrata, dalla seduta più vecchia alla più nuova,
 * poi nell'ordine degli esercizi della seduta, poi per numero di serie. Tutto lo storico del periodo, nessun filtro.
 * Ogni riga: { date: Date|null, workout, planDay, exercise, machine, set, weight, reps, rir, notes }.
 * Workout = il nome del tipo di workout come nel filtro dello Storico. Giorno piano = il giorno del piano della seduta
 * (vuoto se la seduta non ne ha uno, come le sedute vecchie importate). Peso sempre in kg (come salvato).
 * Testi così come sono (nessun apostrofo: in un .xlsx un testo resta testo, non diventa una formula).
 */
export function historyRows(list, plan, { lang = 'it', timeZone } = {}) {
  const workout = new Map(historyFilterOptions(list, plan).days.map((d) => [d.key, d.name]));
  const planDays = new Map(((plan && plan.days) || []).map((d) => [d.id, d.name]));
  const rows = [];
  for (const s of [...list].sort(byStart)) {
    const date = excelDate(dayKeyIn(s.date, timeZone) || dayKeyIn(s.start, timeZone));
    const planDay = s.planDayId ? planDays.get(s.planDayId) || s.dayName || '' : '';
    for (const e of s.exercises) {
      const m = e.machine;
      const machine = m ? machineLabel(m) || tr(m.name, lang) || m.code || '' : '';
      for (const x of [...e.sets].sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))) {
        rows.push({
          date,
          workout: text(workout.get(s.dayKey)),
          planDay: text(planDay),
          exercise: text(tr(e.name, lang)),
          machine: text(machine),
          set: cellNumber(x.set_number),
          weight: cellNumber(x.weight_kg),
          reps: cellNumber(x.reps),
          rir: cellNumber(x.rir),
          notes: text(x.notes),
        });
      }
    }
  }
  return rows;
}

/** Testo come appare nella colonna (per la larghezza): la riga più lunga di un testo su più righe. */
const shownLength = (key, v) => {
  if (v == null || v === '') return 0;
  if (key === 'date') return XLSX_DATE_FORMAT.length;
  return Math.max(...String(v).split(/\r?\n/).map((l) => [...l].length));
};

/** Larghezza delle colonne (in caratteri): il testo più lungo (intestazione compresa) + 2, tra 8 e 60. */
export function columnWidths(rows) {
  return ROW_KEYS.map((k, i) => {
    let w = [...XLSX_HEADER[i]].length;
    for (const r of rows) w = Math.max(w, shownLength(k, r[k]));
    return Math.min(60, Math.max(8, w + 2));
  });
}

/**
 * Dati del foglio per write-excel-file: intestazione in grassetto, poi una riga per serie.
 * Data = data vera di Excel (formato gg/mm/aaaa); Serie, Peso, Ripetizioni, RIR = numeri veri (vuoti se mancano);
 * tutto il resto = testo. Un testo su più righe resta in una cella, con "a capo" attivo.
 */
export function xlsxSheetData(rows) {
  const head = XLSX_HEADER.map((h) => ({ value: h, type: String, fontWeight: 'bold' }));
  const cell = (k, v) => {
    if (k === 'date') return v ? { value: v, type: Date, format: XLSX_DATE_FORMAT } : null;
    if (NUM_KEYS.has(k)) return v == null ? null : { value: v, type: Number };
    if (v === '' || v == null) return null;
    return /[\r\n]/.test(v) ? { value: v, type: String, wrap: true } : { value: v, type: String };
  };
  return [head, ...rows.map((r) => ROW_KEYS.map((k) => cell(k, r[k])))];
}

/** Carica la libreria che scrive il file solo quando serve (Vite la mette in un file a parte). */
export const loadXlsxWriter = () => import('write-excel-file/universal').then((m) => m.default);

/**
 * File .xlsx (Blob). Mai un file vuoto: senza righe si ferma con un errore (la pagina mostra il messaggio prima).
 * Prima riga bloccata, colonne larghe quanto serve.
 */
export async function buildXlsx(rows, load = loadXlsxWriter) {
  if (!rows || !rows.length) throw new Error('empty export');
  const writeExcelFile = await load();
  const columns = columnWidths(rows).map((width) => ({ width }));
  const blob = await writeExcelFile(xlsxSheetData(rows), { sheet: XLSX_SHEET, columns, stickyRowsCount: 1 }).toBlob();
  return blob.type === XLSX_TYPE ? blob : new Blob([blob], { type: XLSX_TYPE });
}
