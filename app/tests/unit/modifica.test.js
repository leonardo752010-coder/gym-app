// Programma → "Modifica": campi della finestra, controlli prima di salvare, copia del piano dopo il salvataggio.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_EDIT_FIELDS, planEditForm, validatePlanEdit, applyPlanEdit, findPlanExercise, moveInDay, orderForDay, dayOfExercise, planMoveRows, applyPlanMove, PE_COLUMNS } from '../../src/modifica.js';
import { LANGS } from '../../src/i18n.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

const PE = { id: 'pe1', exercise_id: 'ex1', sets: 2, sets_max: null, reps_min: 6, reps_max: 10, rir_min: 2, rir_max: 3, rest_seconds: 150, notes: 'Schiena appoggiata', machine: { id: 'm1' } };
const PLAN = { id: 'p', name: 'Piano', days: [
  { id: 'dA', name: 'Upper A', exercises: [PE, { id: 'pe2', exercise_id: 'ex2', sets: 3, reps_min: 8, reps_max: 12 }] },
  { id: 'dB', name: 'Lower A', exercises: [{ id: 'pe3', exercise_id: 'ex3', sets: 1, reps_min: 10, reps_max: 15 }] },
] };
const OK = { sets: '3', sets_max: '', reps_min: '8', reps_max: '12', rir_min: '1', rir_max: '2', rest_seconds: '120', notes: '' };
const errs = (patch) => validatePlanEdit({ ...OK, ...patch }).errors;

describe('finestra di modifica', () => {
  it('i campi chiesti, in quest\'ordine', () => {
    expect(PLAN_EDIT_FIELDS.map((f) => f.key)).toEqual(['sets', 'sets_max', 'reps_min', 'reps_max', 'rir_min', 'rir_max', 'rest_seconds', 'notes']);
  });

  it('già compilata con i valori del piano (vuoto dove non c\'è niente)', () => {
    expect(planEditForm(PE)).toEqual({ sets: '2', sets_max: '', reps_min: '6', reps_max: '10', rir_min: '2', rir_max: '3', rest_seconds: '150', notes: 'Schiena appoggiata' });
    expect(planEditForm({ ...PE, rir_min: 1.5, rest_seconds: null, notes: null })).toMatchObject({ rir_min: '1.5', rest_seconds: '', notes: '' });
  });

  it('testi e messaggi in tutte e due le lingue', () => {
    for (const L of [LANGS.it, LANGS.en]) {
      for (const k of ['sets', 'setsMax', 'setsMaxLow', 'reps', 'repsOrder', 'rir', 'rirOrder', 'rest']) expect(L.peErr[k], k).toBeTruthy();
    }
    expect(LANGS.it.peNeedNet).toBe('Serve internet per modificare il piano.');
    expect(LANGS.it.peEdit).toBe('Modifica');
  });
});

describe('controlli prima di salvare', () => {
  it('valori giusti: nessun errore, riga pronta per plan_exercises (numeri, vuoto = null)', () => {
    const r = validatePlanEdit({ ...OK, rir_min: '0,5', notes: '  tempo 3-1-1  ' });
    expect(r.errors).toEqual([]);
    expect(r.values).toEqual({ sets: 3, sets_max: null, reps_min: 8, reps_max: 12, rir_min: 0.5, rir_max: 2, rest_seconds: 120, notes: 'tempo 3-1-1' });
    expect(validatePlanEdit({ ...OK, rir_min: '', rir_max: '', rest_seconds: '', notes: '' }).values).toMatchObject({ rir_min: null, rir_max: null, rest_seconds: null, notes: null });
  });

  it('serie: intero da 0 a 20, obbligatorio; 0 va bene (fuori dal volume)', () => {
    expect(errs({ sets: '0' })).toEqual([]);
    for (const s of ['', '-1', '21', '2.5', 'tre']) expect(errs({ sets: s }), s).toEqual(['sets']);
  });

  it('serie max: vuoto oppure ≥ serie (e da 1 a 20)', () => {
    expect(errs({ sets: '3', sets_max: '' })).toEqual([]);
    expect(errs({ sets: '3', sets_max: '3' })).toEqual([]);
    expect(errs({ sets: '3', sets_max: '4' })).toEqual([]);
    expect(errs({ sets: '3', sets_max: '2' })).toEqual(['setsMaxLow']);
    expect(errs({ sets: '0', sets_max: '0' })).toEqual(['setsMax']);
    expect(errs({ sets_max: '21' })).toEqual(['setsMax']);
  });

  it('rep: min ≤ max, interi 1-200, tutti e due', () => {
    expect(errs({ reps_min: '10', reps_max: '10' })).toEqual([]);
    expect(errs({ reps_min: '12', reps_max: '8' })).toEqual(['repsOrder']);
    for (const [a, b] of [['', '10'], ['8', ''], ['0', '10'], ['8', '201'], ['8,5', '10']]) expect(errs({ reps_min: a, reps_max: b }), a + '/' + b).toEqual(['reps']);
  });

  it('RIR: min ≤ max, 0-10 con al massimo un decimale, vuoto ammesso', () => {
    expect(errs({ rir_min: '2', rir_max: '2' })).toEqual([]);
    expect(errs({ rir_min: '', rir_max: '3' })).toEqual([]);
    expect(errs({ rir_min: '3', rir_max: '1' })).toEqual(['rirOrder']);
    for (const v of ['11', '-1', '1.25', 'x']) expect(errs({ rir_min: v }), v).toEqual(['rir']);
  });

  it('recupero: secondi interi 0-3600 o vuoto', () => {
    expect(errs({ rest_seconds: '0' })).toEqual([]);
    for (const v of ['3601', '90.5', '-5']) expect(errs({ rest_seconds: v }), v).toEqual(['rest']);
  });

  it('più errori insieme: tutti, nell\'ordine dei campi', () => {
    expect(errs({ sets: '', reps_min: '12', reps_max: '8', rir_min: '4', rir_max: '1', rest_seconds: '9999' })).toEqual(['sets', 'repsOrder', 'rirOrder', 'rest']);
  });
});

describe('copia del piano dopo il salvataggio', () => {
  const row = { id: 'pe1', sets: 4, sets_max: 5, reps_min: 8, reps_max: 12, rir_min: '1.0', rir_max: '2.0', rest_seconds: 90, notes: null };

  it('cambia solo quell\'esercizio; il resto del piano è lo stesso', () => {
    const p2 = applyPlanEdit(PLAN, 'pe1', row);
    expect(findPlanExercise(p2, 'pe1')).toEqual({ ...PE, sets: 4, sets_max: 5, reps_min: 8, reps_max: 12, rir_min: 1, rir_max: 2, rest_seconds: 90, notes: null });
    expect(p2.days[0].exercises[1]).toBe(PLAN.days[0].exercises[1]);
    expect(p2.days[1]).toBe(PLAN.days[1]);
    expect(findPlanExercise(PLAN, 'pe1').sets).toBe(2);   // il piano di partenza non cambia
  });

  it('esercizio che non c\'è o niente risposta: piano uguale', () => {
    expect(applyPlanEdit(PLAN, 'nessuno', row)).toEqual(PLAN);
    expect(applyPlanEdit(PLAN, 'pe1', null)).toBe(PLAN);
    expect(findPlanExercise(PLAN, 'pe3').sets).toBe(1);
    expect(findPlanExercise(null, 'pe3')).toBeNull();
  });
});

describe('solo online, solo la riga del piano', () => {
  it('modifica.js non usa rete, coda o telefono (logica pura)', () => {
    expect(read('src/modifica.js')).not.toMatch(/fetch|createClient|import |\bapi\.|write\(|setKv|indexedDB|localStorage/);
  });

  it('il piano non entra nella coda offline: la coda resta sedute, esercizi della seduta, serie', () => {
    expect(read('src/store.js')).toMatch(/TABLES = \['sessions', 'session_exercises', 'sets'\]/);
  });

  it('il salvataggio aggiorna solo plan_exercises, per id, e solo le colonne della finestra', () => {
    const api = read('src/api.js');
    const fn = api.slice(api.indexOf('async updatePlanExercise'), api.indexOf('planDayRows('));
    expect(fn).toMatch(/from\('plan_exercises'\)\.update\(values\)\.eq\('id', id\)/);
    expect(fn).not.toMatch(/sessions|session_exercises|sets\(|upsert|delete/);
  });

  it('senza internet il tasto Salva è spento e c\'è la scritta', () => {
    const main = read('src/main.js');
    expect(main).toMatch(/b\.disabled = !on;/);
    expect(main).toMatch(/T\.peNeedNet/);
  });
});

describe('spostamento: Su / Giù dentro il giorno', () => {
  const O = (s) => s.split(' ').map((t) => { const [id, ss] = t.split(':'); return { id, superset_id: ss || null }; });
  const ids = (o) => o && o.map((x) => x.id).join(' ');

  it('esercizi normali: scambio con il vicino; ai bordi non si muove', () => {
    expect(ids(moveInDay(O('a b c'), 'b', -1))).toBe('b a c');
    expect(ids(moveInDay(O('a b c'), 'b', 1))).toBe('a c b');
    expect(moveInDay(O('a b c'), 'a', -1)).toBeNull();
    expect(moveInDay(O('a b c'), 'c', 1)).toBeNull();
    expect(moveInDay(O('a b c'), 'x', 1)).toBeNull();
  });

  it('un esercizio normale scavalca una superserie intera (la superserie resta unita)', () => {
    expect(ids(moveInDay(O('x s1:S s2:S y'), 'x', 1))).toBe('s1 s2 x y');
    expect(ids(moveInDay(O('x s1:S s2:S y'), 'y', -1))).toBe('x y s1 s2');
  });

  it('un esercizio di una superserie si muove solo dentro la sua superserie', () => {
    expect(ids(moveInDay(O('x s1:S s2:S y'), 's1', 1))).toBe('x s2 s1 y');
    expect(moveInDay(O('x s1:S s2:S y'), 's1', -1)).toBeNull();
    expect(moveInDay(O('x s1:S s2:S y'), 's2', 1)).toBeNull();
  });
});

describe('spostamento: giorno e righe da scrivere', () => {
  const D1 = 'd1', D2 = 'd2';
  const R = (id, day, position, extra = {}) => ({ id, user_id: 'u', plan_day_id: day, position, exercise_id: 'ex-' + id, superset_id: null, sets: 2, sets_max: null,
    reps_min: 8, reps_max: 12, rir_min: 1, rir_max: 2, rest_seconds: null, set_type: 'normal', progression_method: 'double-progression', progression_settings: {}, notes: null, archived_at: null, ...extra });
  const rows = [R('a', D1, 1), R('b', D1, 2), R('arch', D1, 3, { archived_at: '2026-11-01T00:00:00Z' }), R('c', D1, 4), R('p', D2, 1), R('q', D2, 2)];
  const pos = (out) => Object.fromEntries(out.map((r) => [r.id, r.plan_day_id + '#' + r.position]));

  it('in un altro giorno: in fondo al giorno nuovo; giorno vecchio senza buchi (archiviati in fondo)', () => {
    const { rows: out } = planMoveRows(rows, 'b', D2, ['p', 'q', 'b'], { sets: 3 });
    expect(pos(out)).toEqual({ b: 'd2#3', c: 'd1#2' });   // a resta 1, c da 4 a 2, l'archiviato era già 3 (in fondo)
    expect(out.find((r) => r.id === 'b')).toMatchObject({ id: 'b', exercise_id: 'ex-b', sets: 3, plan_day_id: D2, position: 3 });
    expect(Object.keys(out[0]).sort()).toEqual([...PE_COLUMNS].sort());
  });

  it('nel giorno di partenza e in quello di arrivo: posizioni 1, 2, 3… senza doppioni', () => {
    const { rows: out } = planMoveRows(rows, 'a', D2, ['p', 'a', 'q']);
    const after = rows.map((r) => out.find((x) => x.id === r.id) || r);
    for (const d of [D1, D2]) {
      const ps = after.filter((r) => r.plan_day_id === d).map((r) => r.position).sort((x, y) => x - y);
      expect(ps, d).toEqual(ps.map((_, i) => i + 1));
    }
  });

  it('Su / Giù nello stesso giorno: cambiano solo le righe che cambiano posizione (più l\'esercizio)', () => {
    const { rows: out } = planMoveRows(rows, 'c', D1, ['a', 'c', 'b']);
    expect(pos(out)).toEqual({ b: 'd1#3', c: 'd1#2', arch: 'd1#4' });   // l'archiviato va in fondo, dopo i 3 attivi
  });

  it('esercizio che il telefono non conosceva (aggiunto da un altro telefono): resta, dopo quelli scelti', () => {
    const more = [...rows, R('new', D2, 3)];
    const { rows: out } = planMoveRows(more, 'a', D2, ['p', 'q', 'a']);
    expect(pos(out)).toMatchObject({ a: 'd2#3', new: 'd2#4' });
  });

  it('superserie: non cambia giorno; esercizio sparito; giorno pieno', () => {
    expect(planMoveRows([R('s', D1, 1, { superset_id: 'S' }), R('p', D2, 1)], 's', D2, ['p', 's']).error).toBe('superset');
    expect(planMoveRows(rows, 'zzz', D2, ['zzz']).error).toBe('missing');
    const big = [R('m', D1, 1), ...Array.from({ length: 100 }, (_, i) => R('f' + i, D2, i + 1))];
    expect(planMoveRows(big, 'm', D2, [...big.slice(1).map((r) => r.id), 'm']).error).toBe('full');
  });

  it('copia sul telefono: esercizio nel giorno nuovo, ordini aggiornati, piano di partenza intatto', () => {
    const P = { id: 'p', days: [
      { id: D1, name: 'A', exercises: [{ id: 'a', position: 1, sets: 2 }, { id: 'b', position: 2, sets: 2 }, { id: 'c', position: 4, sets: 2 }] },
      { id: D2, name: 'B', exercises: [{ id: 'p', position: 1, sets: 1 }, { id: 'q', position: 2, sets: 1 }] },
    ] };
    expect(dayOfExercise(P, 'b')).toBe(D1);
    expect(orderForDay(P, 'b', D2).map((x) => x.id)).toEqual(['p', 'q', 'b']);
    expect(orderForDay(P, 'b', D1).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    const { rows: out } = planMoveRows(rows, 'b', D2, ['p', 'q', 'b'], { sets: 3, sets_max: null, reps_min: 8, reps_max: 12, rir_min: 1, rir_max: 2, rest_seconds: null, notes: null });
    const P2 = applyPlanMove(P, 'b', out);
    expect(P2.days[0].exercises.map((x) => x.id + '#' + x.position)).toEqual(['a#1', 'c#2']);
    expect(P2.days[1].exercises.map((x) => x.id + '#' + x.position)).toEqual(['p#1', 'q#2', 'b#3']);
    expect(findPlanExercise(P2, 'b').sets).toBe(3);
    expect(dayOfExercise(P, 'b')).toBe(D1);
  });
});
