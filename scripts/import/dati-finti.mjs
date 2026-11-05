// Crea file .xlsx FINTI (nessun dato vero) nel formato del foglio GYM, con dentro apposta i casi sporchi,
// più il file dei collegamenti già "controllato". Il file finto nel formato di Raina serve solo a provare
// che viene rifiutato (per Raina niente import). Cartella: tests/out/import (ignorata da git).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { REPO, aggiornaBozza } from './lib.mjs';

export const CARTELLA = path.join(REPO, 'tests', 'out', 'import');
const D = (y, m, d, h = 0, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi));   // ora "locale del foglio"

const PIANO_GYM = [
  ['Day_Code', 'Day_Name', 'Order', 'Exercise', 'Target_Muscle', 'Sets', 'Reps_Min', 'Reps_Max', 'Target_RIR', 'Notes'],
  ['UA', 'Upper A', 1, 'Hammer Strenght Select chest press', 'chest', 3, 8, 12, '1-2', 'nota del piano'],
  ['UA', 'Upper A', 2, 'Panca inclinata manubri', 'chest', 3, 8, 12, '0-1', ''],
  ['UA', 'Upper A', 3, 'Pulldown presa larga', 'back', 2, 10, 15, D(2026, 2, 1), ''],      // "1-2" diventato 1 febbraio
  ['UA', 'Upper A', 4, '[ ] curl da scegliere', 'biceps', 2, 8, 12, '1', ''],
  ['LA', 'Lower A', 1, 'Hack squat (Panatta)', 'quads', 3, 6, 10, '1-2', ''],
  ['LA', 'Lower A', 2, 'Leg extension', 'quads', 0, 10, 15, '0-1', 'fuori piano'],
  ['LA', 'Lower A', 3, '  Calf  seduto ', 'calves', 2, 10, 15, '1', '']
];
const H_STORICO = ['Timestamp', 'Date', 'Day', 'Exercise', 'Set', 'Weight_kg', 'Reps', 'RIR', 'Target_RIR_Pattern', 'Notes', 'personal notes', 'Input_weight', 'Input_unit'];
const S = (ts, d, day, ex, set, kg, reps, rir, pat = '1-2', note = '', iw = '', iu = '') => [ts, d, day, ex, set, kg, reps, rir, pat, 'nota del piano', note, iw, iu];
const STORICO_PULITO = [
  S(D(2026, 10, 20, 18), D(2026, 10, 20), 'Upper A', 'Hammer Strenght Select chest press', 1, 19, 15, 2),         // prima del periodo
  S(D(2026, 10, 20, 18), D(2026, 10, 20), 'Upper A', 'Hammer Strenght Select chest press', 2, 19, 14, 1),
  S(D(2026, 10, 31, 18, 5), D(2026, 10, 31), 'Upper A', 'Hammer Strenght Select chest press', 1, 20, 15, 2),
  S(D(2026, 10, 31, 18, 9), D(2026, 10, 31), 'Upper A', 'Hammer Strenght Select chest press', 2, 20, 14, 1),
  S(D(2026, 10, 31, 18, 20), D(2026, 10, 31), 'Upper A', 'Panca inclinata manubri', 1, '22,5', 10, '2RIR', '0-1'),   // numeri scritti come testo
  S(D(2026, 10, 31, 18, 24), D(2026, 10, 31), 'Upper A', 'Panca inclinata manubri', 2, 22.5, 9, 1, '0-1', 'spalla ok'),
  S(D(2026, 10, 31, 18, 40), D(2026, 10, 31), 'Upper A', 'Pulldown presa larga', 1, 60, 12, 2),
  S(D(2026, 10, 31, 18, 40), D(2026, 10, 31), 'Upper A', 'Pulldown presa larga', 1, 60, 12, 2),                      // doppione identico
  S(D(2026, 10, 31, 18, 50), D(2026, 10, 31), 'Upper A', '[ ] curl da scegliere', 1, 10, 10, 1),                     // segnaposto
  S(D(2026, 11, 2, 7, 30), D(2026, 11, 2), 'Lower A', 'Hack squat (Panatta)', 1, 99.79, 8, 2, '1-2', '', 220, 'lb'),  // scritto in lb
  S(D(2026, 11, 2, 7, 35), D(2026, 11, 2), 'Lower A', 'Hack squat (Panatta)', 2, 99.79, 7, 1, '1-2', '', 220, 'lb'),
  S('', D(2026, 11, 2), 'Lower A', 'Calf seduto', 1, 40, 12, '', '1'),                                              // senza Timestamp, RIR vuoto
  S('', D(2026, 11, 2), 'Lower A', 'Calf seduto ', 2, 40, 11, 0, '1'),
  S(D(2026, 11, 5, 18), D(2026, 11, 5), 'Upper A', 'Hammer Strength Select chest press', 1, 21, 13, 1),          // nome cambiato
  S(D(2026, 11, 5, 18, 15), D(2026, 11, 5), 'Upper A', 'Panca inclinata manubri', 1, 24, 8, 1, '0-1', '', 24, 'kg'),
  S(D(2026, 11, 8, 18), D(2026, 11, 8), 'Upper A', 'Panca inclinata manubri', 1, 25, 8, 1)                           // dopo il periodo
];
const ERRORI_SPORCO = [
  S(D(2026, 11, 1, 9), D(2026, 11, 1), 'Upper A', 'Panca inclinata manubri', 1, 24, '', 1),            // mancano le reps
  S(D(2026, 10, 31, 18, 41), D(2026, 10, 31), 'Upper A', 'Pulldown presa larga', 1, 62, 12, 2),        // doppione con valori diversi
  S(D(2026, 11, 1, 9), D(2026, 11, 1), 'Upper A', 'Pulldown presa larga', 1, '100lb', 10, 1),           // lb nella colonna dei kg
  S(D(2026, 11, 1, 9), '32/13/2026', 'Upper A', 'Pulldown presa larga', 2, 60, 10, 1),                  // data impossibile
  S(D(2026, 11, 1, 9), D(2026, 11, 1), 'Upper A', 'Pulldown presa larga', 3, 60, 0, 1)                  // reps 0
];

const PIANO_COMEBACK = [
  ['Day_Code', 'Day_Name', 'Order', 'Exercise', 'Target_Muscle', 'Sets', 'Target_Reps', 'Target_RIR', 'Notes'],
  ['X', 'Giorno finto', 1, 'Esercizio finto', 'quads', '2-3', '8-10', '1-2', '']
];

async function scrivi(file, schede) {
  const wb = new ExcelJS.Workbook();
  for (const [nome, righe] of Object.entries(schede)) {
    const ws = wb.addWorksheet(nome);
    righe.forEach((r) => ws.addRow(r.map((v) => (v === '' ? null : v))));
    ws.eachRow((row) => row.eachCell((c) => { if (c.value instanceof Date) c.numFmt = 'yyyy-mm-dd hh:mm'; }));
  }
  await wb.xlsx.writeFile(file);
}

// Collegamenti "controllati": la bozza, con codici "prova-..." e stato ok (simula il lavoro di Leonardo).
function collegamentiPronti(piano, storico) {
  const nomi = new Map();
  piano.slice(1).forEach((r) => { if (!/^\[/.test(r[3]) && r[5] !== 0) nomi.set(String(r[3]).replace(/\s+/g, ' ').trim(), r[4]); });
  (storico || []).forEach((r) => { const n = String(r[3]).replace(/\s+/g, ' ').trim(); if (!/^\[/.test(n) && !nomi.has(n)) nomi.set(n, ''); });
  const b = {};
  aggiornaBozza(b, nomi);
  const out = { versione: 1, palestra: { nome: 'Palestra Finta' }, esercizi: {}, macchine: {}, nomi: {} };
  for (const [c, e] of Object.entries(b.esercizi)) out.esercizi['prova-' + c] = { ...e, muscolo: e.muscolo || 'chest' };
  for (const [c, m] of Object.entries(b.macchine)) out.macchine['prova-' + c] = { ...m, codice_marca: 'X100' };
  for (const [n, x] of Object.entries(b.nomi)) out.nomi[n] = { esercizio: 'prova-' + x.esercizio, macchina: x.macchina ? 'prova-' + x.macchina : null, stato: 'ok' };
  return out;
}

export async function creaDatiFinti() {
  fs.mkdirSync(CARTELLA, { recursive: true });
  const modificato = STORICO_PULITO.map((r) => [...r]);
  modificato.find((r) => String(r[3]).trim() === 'Calf seduto' && r[4] === 1)[5] = 42;
  await scrivi(path.join(CARTELLA, 'gym-pulito.xlsx'), { PIANO: PIANO_GYM, STORICO: [H_STORICO, ...STORICO_PULITO] });
  await scrivi(path.join(CARTELLA, 'gym-sporco.xlsx'), { PIANO: PIANO_GYM, STORICO: [H_STORICO, ...STORICO_PULITO, ...ERRORI_SPORCO] });
  await scrivi(path.join(CARTELLA, 'gym-modificato.xlsx'), { PIANO: PIANO_GYM, STORICO: [H_STORICO, ...modificato] });
  await scrivi(path.join(CARTELLA, 'comeback.xlsx'), { PIANO: PIANO_COMEBACK, STORICO: [H_STORICO.slice(0, 10)] });
  fs.writeFileSync(path.join(CARTELLA, 'collegamenti-gym.json'), JSON.stringify(collegamentiPronti(PIANO_GYM, STORICO_PULITO), null, 2));
  return CARTELLA;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Dati finti in ' + await creaDatiFinti());
}
