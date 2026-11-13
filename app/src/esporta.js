// Export dello storico in CSV per Excel in italiano. Logica pura (nessun DOM, nessuna rete):
// riceve la lista di historyList (pages.js), la stessa dello Storico in Progressi, e restituisce il testo del file.
// Si prova con tests/unit/esporta.test.js.
import { historyFilterOptions } from './pages.js';
import { tr } from './i18n.js';
import { machineLabel } from './logic.js';

export const CSV_HEADER = ['Data', 'Workout', 'Giorno piano', 'Esercizio', 'Macchina', 'Serie', 'Peso (kg)', 'Ripetizioni', 'RIR', 'Note'];
export const CSV_BOM = '﻿';
export const CSV_SEP = ';';
export const CSV_EOL = '\r\n';

/** Nome del file: storico-allenamenti-AAAA-MM-GG.csv (data del telefono). */
export const exportFileName = (dateKey) => 'storico-allenamenti-' + dateKey + '.csv';

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
