// Export dello storico in CSV (Excel in italiano). Solo logica pura: nessun DOM, nessuna rete, dati finti.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows, addDays } from '../../src/logic.js';
import { historyList } from '../../src/pages.js';
import { LANGS } from '../../src/i18n.js';
import { makeApi } from '../../src/api.js';
import { CSV_HEADER, historyCsvRows, toCsv, csvDate, csvNumber, csvField, csvSafeText, exportFileName,
  EXPORT_PERIODS, DEFAULT_PERIOD, periodFrom, fetchAllPages, exportFromSets } from '../../src/esporta.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

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

const rows = [
  // seduta nuova, Upper A (giorno del piano); esercizi in ordine 2 → 1 nei dati, serie fuori ordine
  S('s2', '2026-11-05', { plan_day_id: 'dA', day_name: 'Upper A' }),
  SE('b2', 's2', 'row', null, { position: 2 }), ST('y3', 'b2', 1, 60, 10, 2),
  SE('b1', 's2', 'bench', 'm1', { position: 1 }), ST('y2', 'b1', 2, 82.5, 8, 1.5, { notes: 'spalla; un po\' "rigida"\nda controllare' }), ST('y1', 'b1', 1, 80, 9, 2),
  // seduta vecchia importata: niente giorno del piano, stesso nome con maiuscole/spazi diversi
  S('s1', '2026-10-31', { day_name: ' upper a ' }),
  SE('a1', 's1', 'bench', 'm1'), ST('x1', 'a1', 1, 77.25, 10, null, { notes: '=SOMMA(A1:A2)' }),
  // serie cancellata: fuori
  ST('x9', 'a1', 2, 999, 1, 0, { deleted_at: '2026-10-31T10:00:00Z' }),
];
const list = historyList(indexRows(rows), PLAN, { bench: { it: 'Panca', en: 'Bench' }, row: '-Rematore' }, { m1: M1 });

describe('CSV dello storico', () => {
  const data = historyCsvRows(list, PLAN, { lang: 'it' });
  const csv = toCsv(data);

  it('una riga per serie, dalla seduta più vecchia, poi ordine degli esercizi, poi numero della serie', () => {
    expect(data.map((r) => [r[0], r[3], r[5]])).toEqual([
      ['31/10/2026', 'Panca', '1'],
      ['05/11/2026', 'Panca', '1'],
      ['05/11/2026', 'Panca', '2'],
      ['05/11/2026', "'-Rematore", '1'],
    ]);
  });

  it('colonne nell\'ordine giusto, intestazione esatta', () => {
    expect(CSV_HEADER).toEqual(['Data', 'Workout', 'Giorno piano', 'Esercizio', 'Macchina', 'Serie', 'Peso (kg)', 'Ripetizioni', 'RIR', 'Note']);
    expect(csv.split('\r\n')[0]).toBe('﻿Data;Workout;Giorno piano;Esercizio;Macchina;Serie;Peso (kg);Ripetizioni;RIR;Note');
    for (const r of data) expect(r).toHaveLength(10);
  });

  it('decimali con la virgola (82,5; 77,25; RIR 1,5), niente punto; vuoto se manca', () => {
    expect(data[2][6]).toBe('82,5');
    expect(data[2][8]).toBe('1,5');
    expect(data[0][6]).toBe('77,25');
    expect(data[0][8]).toBe('');
    expect(csvNumber(36.287390)).toBe('36,29');
    expect(csvNumber(100)).toBe('100');
    expect(csvNumber(null)).toBe('');
    expect(csvNumber('')).toBe('');
    expect(csvNumber(1234.5)).toBe('1234,5');
  });

  it('; virgolette e a capo nelle note: campo tra virgolette, " raddoppiate', () => {
    expect(csvField('a;b')).toBe('"a;b"');
    expect(csvField('di "più"')).toBe('"di ""più"""');
    expect(csvField('riga1\nriga2')).toBe('"riga1\nriga2"');
    expect(csvField('normale')).toBe('normale');
    expect(csv).toContain(';"spalla; un po\' ""rigida""\nda controllare"\r\n');
  });

  it('BOM UTF-8 all\'inizio, righe con CRLF, separatore ;', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.endsWith('\r\n')).toBe(true);
    // ogni a capo fuori dalle virgolette è CRLF: tolte le note tra virgolette non resta nessun \n da solo
    const fuori = csv.replace(/"(?:[^"]|"")*"/g, '');
    expect(fuori).not.toMatch(/[^\r]\n/);
    expect(fuori.split('\r\n').filter(Boolean).every((l) => l.split(';').length === 10)).toBe(true);
  });

  it('Workout come nel filtro dello Storico (un nome per tipo); Giorno piano vuoto senza giorno del piano', () => {
    expect(data[0][1]).toBe('Upper A');   // ' upper a ' della seduta vecchia = tipo "Upper A" del piano
    expect(data[0][2]).toBe('');          // seduta vecchia importata: nessun giorno del piano
    expect(data[1][1]).toBe('Upper A');
    expect(data[1][2]).toBe('Upper A');
  });

  it('macchina con marca · modello · codice; vuota senza macchina', () => {
    expect(data[0][4]).toBe('Marca Finta · Chest Press · CP1');
    expect(data[3][4]).toBe('');
  });

  it('apostrofo davanti a = + - @ nei testi, mai nei numeri', () => {
    expect(data[0][9]).toBe("'=SOMMA(A1:A2)");
    expect(data[3][3]).toBe("'-Rematore");
    for (const c of ['=1+1', '+39', '-x', '@a']) expect(csvSafeText(c)).toBe("'" + c);
    expect(csvSafeText('Panca')).toBe('Panca');
    expect(csvSafeText(null)).toBe('');
    expect(csvNumber(-2.5)).toBe('-2,5');   // numero negativo: nessun apostrofo
    const lista = historyList(indexRows([S('n', '2026-11-01'), SE('ne', 'n', 'x', null), ST('ns', 'ne', 1, -5, 3, 0)]), null, { x: '@Esercizio' });
    const r = historyCsvRows(lista, null)[0];
    expect(r[3]).toBe("'@Esercizio");
    expect(r[6]).toBe('-5');
  });

  it('data vicino alla mezzanotte: giorno del telefono, non UTC', () => {
    // session_date è già il giorno del telefono: resta quello in qualsiasi fuso (new Date('2026-11-13') a Honolulu sarebbe il 12)
    for (const tz of ['Pacific/Auckland', 'UTC', 'Pacific/Honolulu']) expect(csvDate('2026-11-13', tz)).toBe('13/11/2026');
    // orario completo: 11:30 UTC del 13/11 = 00:30 del 14/11 in Nuova Zelanda (UTC+13)
    expect(csvDate('2026-11-13T11:30:00Z', 'Pacific/Auckland')).toBe('14/11/2026');
    expect(csvDate('2026-11-13T11:30:00Z', 'UTC')).toBe('13/11/2026');
    // 23:55 UTC del 12/11 = 12:55 del 13/11 in NZ
    expect(csvDate('2026-11-12T23:55:00Z', 'Pacific/Auckland')).toBe('13/11/2026');
    // seduta iniziata alle 23:50 in NZ (10:50 UTC) con session_date del telefono: nel file il giorno del telefono
    const notte = historyList(indexRows([S('m', '2026-11-13', { started_at: '2026-11-13T10:50:00Z' }), SE('me', 'm', 'x', null), ST('ms', 'me', 1, 50, 5, 1, { performed_at: '2026-11-13T11:05:00Z' })]), null, { x: 'Curl' });
    expect(historyCsvRows(notte, null, { timeZone: 'UTC' })[0][0]).toBe('13/11/2026');
    expect(historyCsvRows(notte, null, { timeZone: 'Pacific/Auckland' })[0][0]).toBe('13/11/2026');
    expect(csvDate('', 'UTC')).toBe('');
  });

  it('storico vuoto: nessuna riga, il file avrebbe solo l\'intestazione', () => {
    expect(historyCsvRows([], PLAN)).toEqual([]);
    expect(historyCsvRows([], null)).toEqual([]);
    expect(toCsv([])).toBe('﻿' + CSV_HEADER.join(';') + '\r\n');
  });

  it('tutto lo storico: la lista di partenza non cambia (nessun filtro, nessun riordino)', () => {
    const prima = JSON.stringify(list);
    historyCsvRows(list, PLAN);
    expect(JSON.stringify(list)).toBe(prima);
  });

  it('nome del file: storico-allenamenti-tutto-AAAA-MM-GG.csv, oppure con i giorni (30gg…)', () => {
    expect(exportFileName('2026-11-13')).toBe('storico-allenamenti-tutto-2026-11-13.csv');
    expect(exportFileName('2026-11-13', 'all')).toBe('storico-allenamenti-tutto-2026-11-13.csv');
    expect(exportFileName('2026-11-13', '14')).toBe('storico-allenamenti-14gg-2026-11-13.csv');
    expect(exportFileName('2026-11-13', '30')).toBe('storico-allenamenti-30gg-2026-11-13.csv');
    expect(exportFileName('2026-11-13', '90')).toBe('storico-allenamenti-90gg-2026-11-13.csv');
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
  it('più di 1000 serie (2345): con il server che ne dà 1000 per volta arrivano tutte, e tutte nel CSV', async () => {
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
    expect(rows[0][0]).toBe(csvDate(addDays(TODAY, -234)));   // la seduta più vecchia, 234 giorni fa (oltre i 120)
    expect(rows[rows.length - 1][0]).toBe('13/11/2026');
  });

  it('se il server ne dà meno di quelle chieste (500 per volta) arrivano lo stesso tutte', async () => {
    const all = fakeSets(1234);
    const { fetchImpl, calls } = fakeServer(all, { cap: 500 });
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
    expect(rows.map((r) => r[0])).toEqual(['11/11/2026', '12/11/2026']);
    expect(rows[0][3]).toBe('Esercizio finto');
    expect(rows[0][1]).toBe('Workout finto');
    expect(rows[0][2]).toBe('');   // niente giorno del piano
  });
});

describe('Periodo da esportare', () => {
  const at = (...days) => days.map((d) => oneAt(d));
  const dates = (sets, period) => exportFromSets(sets, null, { today: TODAY, period }).map((r) => r[0]);

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
    expect(dates(at(0, 13, 14, 15), '14')).toEqual(['31/10/2026', '13/11/2026']);
  });

  it('30 e 90 giorni: stesso limite', () => {
    expect(dates(at(0, 29, 30), '30')).toEqual(['15/10/2026', '13/11/2026']);
    expect(dates(at(0, 89, 90), '90')).toEqual(['16/08/2026', '13/11/2026']);
  });

  it('Tutto: anche le sedute vecchissime (oltre 120 giorni)', () => {
    expect(dates(at(0, 121, 400), 'all')).toEqual([csvDate(addDays(TODAY, -400)), csvDate(addDays(TODAY, -121)), '13/11/2026']);
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
    for (const k of ['exportBtn', 'exportEmpty', 'exportNeedNet', 'exportNone', 'exportBusy', 'exportReady', 'expPeriod']) {
      expect(LANGS.it[k]).toBeTruthy();
      expect(LANGS.en[k]).toBeTruthy();
    }
  });

  it('Progressi → Storico ha periodo e tasto; l\'export legge da Supabase, non dal telefono né dai filtri', () => {
    expect(main).toContain('id="exportBtn"');
    expect(main).toContain("pfSelect('expPeriod'");
    const ex = fn('exportHistory');
    expect(ex).toContain('api.exportSets(');
    expect(ex).toContain('exportFromSets(');
    expect(ex).not.toContain('S.local');
    expect(ex).not.toContain('S.prog');
    expect(ex).toMatch(/navigator\.onLine/);
    expect(ex).toContain('T.exportNeedNet');
    expect(ex).toContain('T.exportNone');
  });

  it('mentre scarica: tasto spento con la scritta di attesa', () => {
    expect(main).toMatch(/E\.busy \? ' disabled aria-busy="true"'/);
    expect(main).toContain('T.exportBusy');
  });
});
