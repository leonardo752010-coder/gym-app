// Export dello storico in un file Excel (.xlsx). Solo dati finti, nessun DOM, nessuna rete vera:
// Supabase è un server finto; il file .xlsx viene scritto con la libreria vera e poi riletto (zip + XML).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { indexRows, addDays } from '../../src/logic.js';
import { historyList } from '../../src/pages.js';
import { LANGS } from '../../src/i18n.js';
import { makeApi } from '../../src/api.js';
import { XLSX_HEADER, XLSX_TYPE, XLSX_DATE_FORMAT, ROW_KEYS, historyRows, dayKeyIn, excelDate, cellNumber, columnWidths, xlsxSheetData,
  buildXlsx, exportFileName, EXPORT_PERIODS, DEFAULT_PERIOD, periodFrom, fetchAllPages, exportFromSets } from '../../src/esporta.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');
const key = (d) => (d ? d.toISOString().slice(0, 10) : '');

// ---------- righe come quelle sul telefono ----------
const S = (id, date, extra = {}) => ({ table: 'sessions', data: { id, session_date: date, deleted_at: null, ended_at: null, started_at: date + 'T09:00:00Z', ...extra } });
const SE = (id, sid, ex, mac, extra = {}) => ({ table: 'session_exercises', data: { id, session_id: sid, exercise_id: ex, machine_id: mac, plan_exercise_id: null, position: 1, deleted_at: null, ...extra } });
const ST = (id, se, n, kg, reps, rir, extra = {}) => ({ table: 'sets', data: { id, session_exercise_id: se, set_number: n, weight_kg: kg, reps, rir, set_type: 'normal', performed_at: null, notes: null, deleted_at: null, ...extra } });

const M1 = { id: 'm1', code: 'MF-10', brand: 'Marca Finta', model: 'Chest Press', brand_code: 'CP1' };
const PLAN = { id: 'p', name: 'Piano', days: [
  { id: 'dA', name: 'Upper A', exercises: [
    { id: 'pe1', exercise_id: 'bench', exercise: { name: { it: 'Panca', en: 'Bench' } }, machine: M1, alt_machine: null, sets: 3 },
    { id: 'pe2', exercise_id: 'row', exercise: { name: { it: 'Rematore', en: 'Row' } }, machine: null, alt_machine: null, sets: 3 },
  ] },
] };
const NOTE_LUNGA = 'spalla; un po\' "rigida"\nda controllare <bene> & poi';
const local = [
  // seduta nuova, Upper A (giorno del piano); esercizi in ordine 2 → 1 nei dati, serie fuori ordine
  S('s2', '2026-11-05', { plan_day_id: 'dA', day_name: 'Upper A' }),
  SE('b2', 's2', 'row', null, { position: 2 }), ST('y3', 'b2', 1, 60, 10, 2, { notes: '@menzione' }),
  SE('b1', 's2', 'bench', 'm1', { position: 1 }), ST('y2', 'b1', 2, 82.5, 8, 1.5, { notes: NOTE_LUNGA }), ST('y1', 'b1', 1, 80, 9, 2),
  // seduta vecchia importata: niente giorno del piano, stesso nome con maiuscole/spazi diversi
  S('s1', '2026-10-31', { day_name: ' upper a ' }),
  SE('a1', 's1', 'bench', 'm1'), ST('x1', 'a1', 1, 77.25, 10, null, { notes: '=SOMMA(A1:A2)' }),
  // serie cancellata: fuori
  ST('x9', 'a1', 2, 999, 1, 0, { deleted_at: '2026-10-31T10:00:00Z' }),
];
const list = historyList(indexRows(local), PLAN, { bench: { it: 'Panca', en: 'Bench' }, row: '-Rematore' }, { m1: M1 });

// ---------- lettura di un .xlsx: zip + XML del foglio, testi condivisi e stili ----------
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
async function readXlsx(blob) {
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']);
  const shared = zip['xl/sharedStrings.xml'] ? [...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))) : [];
  const styles = strFromU8(zip['xl/styles.xml']);
  const numFmts = Object.fromEntries([...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [m[1], unxml(m[2])]));
  const fonts = [...(styles.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/) || ['', ''])[1].matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m) => /<b\/>/.test(m[1]));
  const xfs = [...(styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || ['', ''])[1].matchAll(/<xf([^>]*)>([\s\S]*?)<\/xf>/g)].map((m) => ({
    numFmt: (m[1].match(/numFmtId="(\d+)"/) || [])[1] || null, font: Number((m[1].match(/fontId="(\d+)"/) || [])[1] || 0), wrap: /wrapText="1"/.test(m[2]) }));
  const cells = new Map();
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[2], inner = m[3] || '';
    const t = (attrs.match(/ t="([^"]+)"/) || [])[1] || 'n';
    const s = Number((attrs.match(/ s="(\d+)"/) || [])[1] || 0);
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const isText = (inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
    const style = xfs[s] || {};
    cells.set(m[1], {
      t, formula: /<f[ >]/.test(inner), style, bold: !!fonts[style.font || 0], format: style.numFmt ? numFmts[style.numFmt] || 'builtin:' + style.numFmt : null,
      value: t === 's' ? shared[Number(v)] : t === 'inlineStr' ? unxml(isText || '') : t === 'str' ? unxml(v || '') : v == null ? null : Number(v),
    });
  }
  const rowsCount = (sheet.match(/<row /g) || []).length;
  const frozen = /<pane [^>]*ySplit="1"[^>]*state="frozen"/.test(sheet);
  const widths = [...sheet.matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g)].map((m) => Number(m[3]));
  return { cells, rowsCount, frozen, widths, sheet, files: Object.keys(zip) };
}
const COL = 'ABCDEFGHIJ';
const excelSerial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

describe('Righe dell\'export (stessi dati, stesso ordine)', () => {
  const data = historyRows(list, PLAN, { lang: 'it' });

  it('una riga per serie, dalla seduta più vecchia, poi ordine degli esercizi, poi numero della serie', () => {
    expect(data.map((r) => [key(r.date), r.exercise, r.set])).toEqual([
      ['2026-10-31', 'Panca', 1],
      ['2026-11-05', 'Panca', 1],
      ['2026-11-05', 'Panca', 2],
      ['2026-11-05', '-Rematore', 1],
    ]);
  });

  it('colonne nello stesso ordine di prima', () => {
    expect(XLSX_HEADER).toEqual(['Data', 'Workout', 'Giorno piano', 'Esercizio', 'Macchina', 'Serie', 'Peso (kg)', 'Ripetizioni', 'RIR', 'Note']);
    expect(ROW_KEYS).toHaveLength(XLSX_HEADER.length);
    for (const r of data) expect(Object.keys(r)).toEqual(ROW_KEYS);
  });

  it('numeri veri (Serie, Peso, Ripetizioni, RIR), al massimo 2 decimali; RIR mancante = vuoto', () => {
    expect(data[2]).toMatchObject({ set: 2, weight: 82.5, reps: 8, rir: 1.5 });
    expect(data[0]).toMatchObject({ weight: 77.25, rir: null });
    expect(cellNumber(36.28739)).toBe(36.29);
    expect(cellNumber('')).toBeNull();
    expect(cellNumber(null)).toBeNull();
    expect(cellNumber(-2.5)).toBe(-2.5);
  });

  it('testi così come sono: nessun apostrofo davanti a = + - @', () => {
    expect(data[0].notes).toBe('=SOMMA(A1:A2)');
    expect(data[3].exercise).toBe('-Rematore');
    expect(data[3].notes).toBe('@menzione');
    expect(data[2].notes).toBe(NOTE_LUNGA);
  });

  it('Workout come nel filtro dello Storico; Giorno piano vuoto senza giorno del piano', () => {
    expect(data[0]).toMatchObject({ workout: 'Upper A', planDay: '' });
    expect(data[1]).toMatchObject({ workout: 'Upper A', planDay: 'Upper A' });
  });

  it('macchina con marca · modello · codice; vuota senza macchina', () => {
    expect(data[0].machine).toBe('Marca Finta · Chest Press · CP1');
    expect(data[3].machine).toBe('');
  });

  it('data vicino alla mezzanotte: giorno del telefono, non UTC', () => {
    for (const tz of ['Pacific/Auckland', 'UTC', 'Pacific/Honolulu']) expect(dayKeyIn('2026-11-13', tz)).toBe('2026-11-13');
    expect(dayKeyIn('2026-11-13T11:30:00Z', 'Pacific/Auckland')).toBe('2026-11-14');   // 00:30 del 14 in NZ
    expect(dayKeyIn('2026-11-13T11:30:00Z', 'UTC')).toBe('2026-11-13');
    expect(dayKeyIn('2026-11-12T23:55:00Z', 'Pacific/Auckland')).toBe('2026-11-13');
    expect(dayKeyIn('', 'UTC')).toBe('');
    // seduta iniziata alle 23:50 in NZ (10:50 UTC) con session_date del telefono: nel file il giorno del telefono
    const notte = historyList(indexRows([S('m', '2026-11-13', { started_at: '2026-11-13T10:50:00Z' }), SE('me', 'm', 'x', null), ST('ms', 'me', 1, 50, 5, 1)]), null, { x: 'Curl' });
    for (const timeZone of ['UTC', 'Pacific/Auckland', 'Pacific/Honolulu']) expect(key(historyRows(notte, null, { timeZone })[0].date)).toBe('2026-11-13');
    // la data per Excel è la mezzanotte UTC di quel giorno (Excel conta i giorni, senza fuso)
    expect(excelDate('2026-11-13').toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(excelDate('')).toBeNull();
  });

  it('storico vuoto: nessuna riga', () => {
    expect(historyRows([], PLAN)).toEqual([]);
    expect(historyRows([], null)).toEqual([]);
  });

  it('la lista di partenza non cambia', () => {
    const prima = JSON.stringify(list);
    historyRows(list, PLAN);
    expect(JSON.stringify(list)).toBe(prima);
  });

  it('nome del file: storico-allenamenti-tutto-AAAA-MM-GG.xlsx, oppure con i giorni (30gg…)', () => {
    expect(exportFileName('2026-11-13')).toBe('storico-allenamenti-tutto-2026-11-13.xlsx');
    expect(exportFileName('2026-11-13', 'all')).toBe('storico-allenamenti-tutto-2026-11-13.xlsx');
    expect(exportFileName('2026-11-13', '14')).toBe('storico-allenamenti-14gg-2026-11-13.xlsx');
    expect(exportFileName('2026-11-13', '30')).toBe('storico-allenamenti-30gg-2026-11-13.xlsx');
    expect(exportFileName('2026-11-13', '90')).toBe('storico-allenamenti-90gg-2026-11-13.xlsx');
  });
});

describe('File .xlsx: scritto e riletto', () => {
  const data = historyRows(list, PLAN, { lang: 'it' });
  let X;
  const file = async () => (X ||= await readXlsx(await buildXlsx(data)));

  it('è un vero .xlsx (zip con il foglio), tipo giusto', async () => {
    const blob = await buildXlsx(data);
    expect(blob.type).toBe(XLSX_TYPE);
    const x = await file();
    expect(x.files).toContain('xl/workbook.xml');
    expect(x.rowsCount).toBe(1 + data.length);
  });

  it('prima riga: intestazione in grassetto e bloccata', async () => {
    const x = await file();
    XLSX_HEADER.forEach((h, i) => {
      const c = x.cells.get(COL[i] + '1');
      expect(c.value).toBe(h);
      expect(c.bold).toBe(true);
    });
    expect(x.frozen).toBe(true);
    expect(x.cells.get('A2').bold).toBe(false);
  });

  it('Data = data vera di Excel (numero di giorni) mostrata come gg/mm/aaaa', async () => {
    const x = await file();
    const a2 = x.cells.get('A2'), a3 = x.cells.get('A3');
    expect(a2.t).toBe('n');
    expect(a2.value).toBe(excelSerial(2026, 10, 31));
    expect(a3.value).toBe(excelSerial(2026, 11, 5));
    expect(a2.format).toBe(XLSX_DATE_FORMAT);
    expect(XLSX_DATE_FORMAT).toBe('dd/mm/yyyy');
  });

  it('Serie, Peso, Ripetizioni, RIR = numeri veri; RIR vuoto resta vuoto', async () => {
    const x = await file();
    // riga 4 = seduta 5/11, Panca serie 2: 82,5 kg × 8 @1,5
    for (const [c, v] of [['F4', 2], ['G4', 82.5], ['H4', 8], ['I4', 1.5]]) {
      expect(x.cells.get(c).t).toBe('n');
      expect(x.cells.get(c).value).toBe(v);
    }
    expect(x.cells.get('G2').value).toBe(77.25);
    expect(x.cells.has('I2')).toBe(false);   // RIR mancante: nessuna cella
  });

  it('testi salvati come testo, anche quelli che iniziano con = @ - (nessuna formula, nessun apostrofo)', async () => {
    const x = await file();
    const checks = [['J2', '=SOMMA(A1:A2)'], ['D5', '-Rematore'], ['J5', '@menzione'], ['B2', 'Upper A'], ['E2', 'Marca Finta · Chest Press · CP1']];
    for (const [c, v] of checks) {
      const cell = x.cells.get(c);
      expect(['s', 'inlineStr', 'str']).toContain(cell.t);
      expect(cell.formula).toBe(false);
      expect(cell.value).toBe(v);
    }
    expect(x.sheet).not.toMatch(/<f[ >]/);
    expect(x.cells.has('C2')).toBe(false);   // Giorno piano vuoto: nessuna cella
  });

  it('note su più righe: una sola cella, a capo attivo, testo intero (anche ; " < & )', async () => {
    const x = await file();
    const j4 = x.cells.get('J4');
    expect(j4.value).toBe(NOTE_LUNGA);
    expect(j4.value).toContain('\n');
    expect(j4.style.wrap).toBe(true);
    expect(x.cells.has('J6')).toBe(false);   // la nota non si è sparsa in altre righe
    expect(x.rowsCount).toBe(5);
  });

  it('colonne larghe abbastanza: almeno il testo più lungo (e l\'intestazione), al massimo 60', async () => {
    const x = await file();
    const w = columnWidths(data);
    expect(x.widths).toEqual(w);
    expect(w).toHaveLength(10);
    expect(w[0]).toBeGreaterThanOrEqual(10);                                   // gg/mm/aaaa
    expect(w[4]).toBeGreaterThanOrEqual('Marca Finta · Chest Press · CP1'.length);
    expect(w[2]).toBeGreaterThanOrEqual('Giorno piano'.length);
    expect(w[9]).toBeGreaterThanOrEqual('da controllare <bene> & poi'.length); // riga più lunga della nota
    expect(columnWidths([{ ...data[0], notes: 'x'.repeat(500) }])[9]).toBe(60);
  });

  it('file vuoto mai creato: senza righe buildXlsx si ferma e la libreria non viene nemmeno caricata', async () => {
    let loaded = false;
    await expect(buildXlsx([], async () => { loaded = true; return () => ({ toBlob: async () => new Blob([]) }); })).rejects.toThrow();
    await expect(buildXlsx(null)).rejects.toThrow();
    expect(loaded).toBe(false);
  });

  it('dati del foglio: tipi giusti per ogni colonna', () => {
    const sd = xlsxSheetData(data);
    expect(sd[0].every((c) => c.fontWeight === 'bold' && c.type === String)).toBe(true);
    expect(sd[1][0]).toMatchObject({ type: Date, format: 'dd/mm/yyyy' });
    for (const i of [5, 6, 7]) expect(sd[1][i].type).toBe(Number);
    expect(sd[1][8]).toBeNull();
    for (const i of [1, 3, 4, 9]) expect(sd[1][i].type).toBe(String);
  });
});

// ---------- serie come arrivano da Supabase (api.exportSets): ognuna con il suo esercizio della seduta e la sua seduta ----------
const TODAY = '2026-11-13';
const pad = (n) => String(n).padStart(5, '0');
/** n serie finte, 10 per seduta, una seduta al giorno andando indietro da oggi (quindi anche oltre i 120 giorni). */
function fakeSets(n, { perSession = 10, today = TODAY } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = Math.floor(i / perSession);
    const sid = 'ses-' + pad(day), seid = 'se-' + pad(day);
    out.push({
      id: 'set-' + pad(i), session_exercise_id: seid, user_id: 'u1', set_number: (i % perSession) + 1, set_type: 'normal',
      weight_kg: 50 + (i % 7) * 2.5, reps: 8, rir: 1, performed_at: null, notes: null, deleted_at: null,
      session_exercises: {
        id: seid, session_id: sid, user_id: 'u1', position: 1, exercise_id: 'ex1', machine_id: null, plan_exercise_id: null, deleted_at: null,
        exercise: { id: 'ex1', name: 'Esercizio finto' }, machine: null,
        sessions: { id: sid, user_id: 'u1', session_date: addDays(today, -day), started_at: null, ended_at: null, created_at: null, plan_day_id: null, day_name: 'Workout finto', deleted_at: null },
      },
    });
  }
  return out;
}
/** Una seduta finta con una serie, n giorni fa. */
const oneAt = (daysAgo, id = 'd' + daysAgo) => fakeSets(1, { today: addDays(TODAY, -daysAgo) }).map((s) => ({
  ...s, id: 'set-' + id, session_exercise_id: 'se-' + id,
  session_exercises: { ...s.session_exercises, id: 'se-' + id, session_id: 'ses-' + id, sessions: { ...s.session_exercises.sessions, id: 'ses-' + id } },
}))[0];

/** Server finto di Supabase: dà al massimo `cap` righe per richiesta, come il vero (1000), e applica i filtri dell'export. */
function fakeServer(all, { cap = 1000, failAt = -1 } = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    if (!u.pathname.endsWith('/rest/v1/sets')) return new Response('{}', { status: 404 });
    const q = u.searchParams;
    calls.push({ offset: Number(q.get('offset') || 0), limit: Number(q.get('limit') || 0), from: q.get('session_exercises.sessions.session_date'), user: q.get('user_id'), deleted: q.get('deleted_at'), order: q.get('order') });
    if (calls.length - 1 === failAt) return new Response(JSON.stringify({ code: 'XX000', message: 'errore finto' }), { status: 500, headers: { 'content-type': 'application/json' } });
    const from = (q.get('session_exercises.sessions.session_date') || '').replace(/^gte\./, '');
    let rows = all.filter((s) => s.user_id === 'u1' && !s.deleted_at && (!from || s.session_exercises.sessions.session_date >= from));
    rows = rows.sort((a, b) => a.id.localeCompare(b.id));
    const off = Number(q.get('offset') || 0), lim = Math.min(Number(q.get('limit') || cap), cap);
    return new Response(JSON.stringify(rows.slice(off, off + lim)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
const apiWith = (fetchImpl) => makeApi({ url: 'https://example.invalid', key: 'sb_publishable_test', fetch: fetchImpl, storage: mem() });

describe('Export da Supabase: tutto, a pagine', () => {
  it('più di 1000 serie (2345): con il server che ne dà 1000 per volta arrivano tutte, e tutte nel file .xlsx', async () => {
    const all = fakeSets(2345);
    const { fetchImpl, calls } = fakeServer(all);
    const r = await apiWith(fetchImpl).exportSets('u1', null);
    expect(r.error).toBeUndefined();
    expect(r.data).toHaveLength(2345);
    expect(new Set(r.data.map((s) => s.id)).size).toBe(2345);
    expect(calls.map((c) => c.offset)).toEqual([0, 1000, 2000, 2345]);   // la pagina dopo l'ultima serie arriva vuota: fine
    for (const c of calls) {
      expect(c.limit).toBeLessThanOrEqual(1000);
      expect(c.user).toBe('eq.u1');
      expect(c.deleted).toBe('is.null');
      expect(c.order).toBe('id.asc');
      expect(c.from).toBeNull();   // Tutto: nessun limite di data (niente 120 giorni)
    }
    const rows = exportFromSets(r.data, null, { today: TODAY, period: 'all' });
    expect(rows).toHaveLength(2345);
    expect(key(rows[0].date)).toBe(addDays(TODAY, -234));   // la seduta più vecchia, 234 giorni fa (oltre i 120)
    expect(key(rows[rows.length - 1].date)).toBe(TODAY);
    const x = await readXlsx(await buildXlsx(rows));
    expect(x.rowsCount).toBe(2346);   // intestazione + 2345 serie
    expect(x.cells.get('A2346').value).toBe(excelSerial(2026, 11, 13));
  }, 30000);

  it('se il server ne dà meno di quelle chieste (500 per volta) arrivano lo stesso tutte', async () => {
    const { fetchImpl, calls } = fakeServer(fakeSets(1234), { cap: 500 });
    const r = await apiWith(fetchImpl).exportSets('u1', null);
    expect(r.data).toHaveLength(1234);
    expect(calls.map((c) => c.offset)).toEqual([0, 500, 1000, 1234]);
  });

  it('errore a metà: nessun dato a metà (niente file incompleto)', async () => {
    const { fetchImpl } = fakeServer(fakeSets(2345), { failAt: 1 });
    const r = await apiWith(fetchImpl).exportSets('u1', null);
    expect(r.data).toBeUndefined();
    expect(r.error).toBeTruthy();
  });

  it('senza rete: errore "offline" (la pagina mostra "Serve internet…", nessun file)', async () => {
    const r = await apiWith(async () => { throw new TypeError('Failed to fetch'); }).exportSets('u1', null);
    expect(r.data).toBeUndefined();
    expect(r.error.offline).toBe(true);
  }, 20000);   // supabase-js riprova 3 volte (1 + 2 + 4 secondi) prima di dire che la rete non c'è

  it('periodo: il filtro sulla data della seduta arriva al server', async () => {
    const { fetchImpl, calls } = fakeServer(fakeSets(300));
    const r = await apiWith(fetchImpl).exportSets('u1', periodFrom(TODAY, '14'));
    expect(calls[0].from).toBe('gte.2026-10-31');
    expect(r.data).toHaveLength(140);   // 14 sedute (oggi e i 13 giorni prima) × 10 serie
  });

  it('fetchAllPages: pagine fino a quella vuota; freno di sicurezza', async () => {
    const seen = [];
    const r = await fetchAllPages(async (a, b) => { seen.push([a, b]); return { data: a < 25 ? Array.from({ length: Math.min(10, 25 - a) }, (_, i) => a + i) : [] }; }, 10);
    expect(r.data).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(seen).toEqual([[0, 9], [10, 19], [20, 29], [25, 34]]);
    const loop = await fetchAllPages(async () => ({ data: [1] }), 1, 5);
    expect(loop.error.code).toBe('too-many-pages');
  });

  it('serie scaricate → righe di sempre: sedute ed esercizi cancellati fuori, come nello Storico', () => {
    const del = oneAt(3, 'cancellata');
    del.session_exercises.sessions.deleted_at = '2026-11-10T10:00:00Z';
    const rows = exportFromSets([oneAt(1), del, oneAt(2)], null, { today: TODAY });
    expect(rows.map((r) => key(r.date))).toEqual(['2026-11-11', '2026-11-12']);
    expect(rows[0]).toMatchObject({ exercise: 'Esercizio finto', workout: 'Workout finto', planDay: '' });
  });
});

describe('Periodo da esportare', () => {
  const at = (...days) => days.map((d) => oneAt(d));
  const dates = (sets, period) => exportFromSets(sets, null, { today: TODAY, period }).map((r) => key(r.date));

  it('di base: Tutto; scelte 14 / 30 / 90 / Tutto', () => {
    expect(EXPORT_PERIODS).toEqual(['14', '30', '90', 'all']);
    expect(DEFAULT_PERIOD).toBe('all');
    for (const l of ['it', 'en']) for (const p of EXPORT_PERIODS) expect(LANGS[l].expPeriods[p]).toBeTruthy();
    expect(LANGS.it.expPeriods.all).toBe('Tutto');
  });

  it('primo giorno del periodo, oggi incluso (anche a cavallo di mese e anno)', () => {
    expect(periodFrom(TODAY, '14')).toBe('2026-10-31');
    expect(periodFrom(TODAY, '30')).toBe('2026-10-15');
    expect(periodFrom(TODAY, '90')).toBe('2026-08-16');
    expect(periodFrom(TODAY, 'all')).toBeNull();
    expect(periodFrom('2027-01-05', '14')).toBe('2026-12-23');
    expect(periodFrom('2028-03-01', '14')).toBe('2028-02-17');   // anno bisestile
  });

  it('14 giorni: oggi e 13 giorni fa dentro; esattamente 14 giorni fa fuori', () => {
    expect(dates(at(0, 13, 14, 15), '14')).toEqual(['2026-10-31', '2026-11-13']);
  });

  it('30 e 90 giorni: stesso limite', () => {
    expect(dates(at(0, 29, 30), '30')).toEqual(['2026-10-15', '2026-11-13']);
    expect(dates(at(0, 89, 90), '90')).toEqual(['2026-08-16', '2026-11-13']);
  });

  it('Tutto: anche le sedute vecchissime (oltre 120 giorni)', () => {
    expect(dates(at(0, 121, 400), 'all')).toEqual([addDays(TODAY, -400), addDays(TODAY, -121), TODAY]);
  });

  it('periodo senza sedute: nessuna riga (la pagina dice "Nessun allenamento in questo periodo", nessun file)', () => {
    expect(exportFromSets(at(20, 40), null, { today: TODAY, period: '14' })).toEqual([]);
    expect(exportFromSets([], null, { today: TODAY, period: 'all' })).toEqual([]);
    expect(LANGS.it.exportNone).toBe('Nessun allenamento in questo periodo');
  });
});

describe('Tasto "Esporta storico"', () => {
  const main = read('src/main.js');
  const fn = (name) => (main.match(new RegExp('async function ' + name + '\\(\\)[\\s\\S]*?\\n}\\n')) || [''])[0];

  it('testi in italiano e in inglese', () => {
    expect(LANGS.it.exportBtn).toBe('Esporta storico');
    expect(LANGS.it.exportEmpty).toBe('Non ci sono ancora allenamenti da esportare');
    expect(LANGS.it.exportNeedNet).toBe('Serve internet per esportare lo storico completo');
    expect(LANGS.it.exportHead).toBe('Esporta tutto lo storico del tuo account');
    for (const k of ['exportBtn', 'exportEmpty', 'exportNeedNet', 'exportNone', 'exportBusy', 'exportReady', 'expPeriod', 'exportHead']) {
      expect(LANGS.it[k]).toBeTruthy();
      expect(LANGS.en[k]).toBeTruthy();
    }
  });

  it('in cima allo Storico: titolo, periodo e tasto; sotto filtri, "Sedute salvate su questo telefono" e lista', () => {
    expect(main).toContain('id="exportBtn"');
    expect(main).toContain("pfSelect('expPeriod'");
    expect(main).toMatch(/expHead[^\n]*T\.exportHead/);
    const hv = (main.match(/function historyView\(list\) \{[\s\S]*?\n}\n/) || [''])[0];
    const iExp = hv.indexOf('exportBox()'), iFil = hv.indexOf("pfSelect('fDay'"), iNote = hv.indexOf('T.historyNote'), iList = hv.indexOf('shown.map(');
    expect(iExp).toBeGreaterThan(-1);
    expect(iExp).toBeLessThan(iFil);
    expect(iFil).toBeLessThan(iNote);
    expect(iNote).toBeLessThan(iList);
    expect(hv.slice(iNote, iList)).not.toContain('exportBox');   // tra la nota e la lista nient'altro
  });

  it('l\'export legge da Supabase (non dal telefono né dai filtri) e scrive un .xlsx; niente CSV', () => {
    const ex = fn('exportHistory');
    expect(ex).toContain('api.exportSets(');
    expect(ex).toContain('exportFromSets(');
    expect(ex).toContain('buildXlsx(');
    expect(ex).not.toContain('S.local');
    expect(ex).not.toContain('S.prog');
    expect(ex).toMatch(/navigator\.onLine/);
    expect(ex).toContain('T.exportNeedNet');
    expect(ex).toContain('T.exportNone');
    expect(main).not.toMatch(/text\/csv|toCsv/);
  });

  it('mentre scarica e scrive il file: tasto spento con la scritta di attesa', () => {
    expect(main).toMatch(/E\.busy \? ' disabled aria-busy="true"'/);
    expect(main).toContain('T.exportBusy');
    const ex = fn('exportHistory');
    expect(ex.indexOf('E.busy = true')).toBeLessThan(ex.indexOf('buildXlsx('));
    expect(ex.indexOf('buildXlsx(')).toBeLessThan(ex.lastIndexOf('E.busy = false'));
  });

  it('libreria del file caricata solo al momento dell\'export (import dinamico, mai all\'apertura)', () => {
    for (const f of fs.readdirSync(path.join(appDir, 'src')).filter((x) => x.endsWith('.js'))) {
      expect(read('src/' + f)).not.toMatch(/^\s*import\s[^(]*['"]write-excel-file/m);
    }
    expect(read('src/esporta.js')).toMatch(/import\('write-excel-file\/universal'\)/);
  });
});
