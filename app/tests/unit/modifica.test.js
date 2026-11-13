// Programma → "Modifica": campi della finestra, controlli prima di salvare, copia del piano dopo il salvataggio.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_EDIT_FIELDS, planEditForm, validatePlanEdit, applyPlanEdit, findPlanExercise } from '../../src/modifica.js';
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
    const fn = api.slice(api.indexOf('async updatePlanExercise'), api.indexOf('upsert(table, rows)'));
    expect(fn).toMatch(/from\('plan_exercises'\)\.update\(values\)\.eq\('id', id\)/);
    expect(fn).not.toMatch(/sessions|session_exercises|sets\(|upsert|delete/);
  });

  it('senza internet il tasto Salva è spento e c\'è la scritta', () => {
    const main = read('src/main.js');
    expect(main).toMatch(/b\.disabled = !on;/);
    expect(main).toMatch(/T\.peNeedNet/);
  });
});
