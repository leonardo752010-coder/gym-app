// Export dello storico in CSV (Excel in italiano). Solo logica pura: nessun DOM, nessuna rete, dati finti.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows } from '../../src/logic.js';
import { historyList } from '../../src/pages.js';
import { LANGS } from '../../src/i18n.js';
import { CSV_HEADER, historyCsvRows, toCsv, csvDate, csvNumber, csvField, csvSafeText, exportFileName } from '../../src/esporta.js';

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

  it('nome del file: storico-allenamenti-AAAA-MM-GG.csv', () => {
    expect(exportFileName('2026-11-13')).toBe('storico-allenamenti-2026-11-13.csv');
  });
});

describe('Tasto "Esporta storico"', () => {
  it('testi in italiano e in inglese', () => {
    expect(LANGS.it.exportBtn).toBe('Esporta storico');
    expect(LANGS.it.exportEmpty).toBe('Non ci sono ancora allenamenti da esportare');
    expect(LANGS.en.exportBtn).toBeTruthy();
    expect(LANGS.en.exportEmpty).toBeTruthy();
  });

  it('Progressi → Storico ha il tasto e usa lo storico intero (non quello filtrato)', () => {
    const main = read('src/main.js');
    expect(main).toContain('id="exportBtn"');
    expect(main).toMatch(/historyCsvRows\(\s*list\s*,/);
    expect(main).not.toMatch(/historyCsvRows\(\s*shown/);
  });
});
