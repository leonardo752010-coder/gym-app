// Programma → "Modifica": campi della finestra, controlli prima di salvare, copia del piano dopo il salvataggio.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAN_EDIT_FIELDS, planEditForm, validatePlanEdit, applyPlanEdit, findPlanExercise, moveInDay, orderForDay, dayOfExercise, planMoveRows, applyPlanMove, PE_COLUMNS,
  normText, searchExercises, exactExercise, clubChoices, validateExerciseChange, exerciseChangeArgs, exerciseChangeErrorKey, hasSetsToday, applyExerciseChange } from '../../src/modifica.js';
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

describe('Cambia esercizio: ricerca e scelta', () => {
  const LIB = [
    { id: 'e1', code: 'panca-inclinata', name: { it: 'Panca inclinata', en: 'Incline press' } },
    { id: 'e2', code: 'alzate', name: { it: 'Alzate laterali', en: 'Lateral raise' } },
    { id: 'e3', code: 'leg-curl', name: { it: 'Leg curl seduto', en: 'Seated leg curl' } },
    { id: 'e4', code: 'u-pec-deck-1a2b3c4d', name: { it: 'Pec deck è', en: 'Pec deck è' } },
  ];

  it('ricerca: tutte le parole, senza badare a maiuscole e accenti, nel nome italiano, inglese o nel codice; in ordine di nome', () => {
    expect(searchExercises(LIB, '', 'it').map((e) => e.id)).toEqual(['e2', 'e3', 'e1', 'e4']);
    expect(searchExercises(LIB, 'PANCA', 'it').map((e) => e.id)).toEqual(['e1']);
    expect(searchExercises(LIB, 'raise', 'it').map((e) => e.id)).toEqual(['e2']);
    expect(searchExercises(LIB, 'curl sed', 'it').map((e) => e.id)).toEqual(['e3']);
    expect(searchExercises(LIB, 'deck e', 'it').map((e) => e.id)).toEqual(['e4']);
    expect(searchExercises(LIB, 'squat', 'it')).toEqual([]);
    expect(searchExercises(LIB, '', 'it', 2)).toHaveLength(2);
  });

  it('nome esatto già nella libreria (niente doppioni con "Crea nuovo esercizio")', () => {
    expect(exactExercise(LIB, '  panca INCLINATA ')).toBe(LIB[0]);
    expect(exactExercise(LIB, 'incline press')).toBe(LIB[0]);
    expect(exactExercise(LIB, 'Pec deck e')).toBe(LIB[3]);
    expect(exactExercise(LIB, 'Panca')).toBeNull();
    expect(exactExercise(LIB, '')).toBeNull();
    expect(normText('  Alzàte   LATERALI ')).toBe('alzate laterali');
  });

  it('palestre: quelle dell\'atleta più quelle della riga, la principale per prima, con le loro macchine e la scelta di adesso', () => {
    const M1 = { id: 'm1', code: 'a', brand: 'Marca', model: 'Zeta' }, M2 = { id: 'm2', code: 'b', brand: 'Marca', model: 'Alfa' }, M3 = { id: 'm3', code: 'c' };
    const clubs = clubChoices(
      [{ club_id: 'c2', is_home: false, club: { id: 'c2', name: 'Bravo' } }, { club_id: 'c1', is_home: true, club: { id: 'c1', name: 'Zulu' } }],
      [{ club_id: 'c1', machine_id: 'm1', alt_machine_id: 'm2', club: { id: 'c1', name: 'Zulu' } }, { club_id: 'c3', machine_id: 'm9', alt_machine_id: null, club: { id: 'c3', name: 'Charlie' } }],
      [{ club_id: 'c1', machine: M1 }, { club_id: 'c1', machine: M2 }, { club_id: 'c2', machine: M3 }, { club_id: 'c1', machine: M1 }],
    );
    expect(clubs.map((c) => [c.clubId, c.isHome])).toEqual([['c1', true], ['c2', false], ['c3', false]]);
    expect(clubs[0]).toMatchObject({ name: 'Zulu', machineId: 'm1', altId: 'm2' });
    expect(clubs[0].machines.map((m) => m.id)).toEqual(['m2', 'm1']);   // in ordine di nome, senza doppioni
    expect(clubs[1]).toMatchObject({ machineId: null, altId: null });
    expect(clubs[2]).toMatchObject({ machineId: null });                // macchina che non è (più) in quella palestra: nessuna
  });
});

describe('Cambia esercizio: controlli, richiesta, errori, copia del piano', () => {
  it('controlli: scegliere o creare; nome 1-80; alternativa solo con una macchina, e diversa', () => {
    expect(validateExerciseChange({ exerciseId: null, newName: null, clubs: [] })).toEqual(['pick']);
    expect(validateExerciseChange({ exerciseId: null, newName: '   ', clubs: [] })).toEqual(['pick', 'name']);
    expect(validateExerciseChange({ exerciseId: null, newName: 'x'.repeat(81), clubs: [] })).toEqual(['name']);
    expect(validateExerciseChange({ exerciseId: 'e1', newName: null, clubs: [{ clubId: 'c1', machineId: null, altId: null }] })).toEqual([]);
    expect(validateExerciseChange({ exerciseId: 'e1', clubs: [{ clubId: 'c1', machineId: null, altId: 'm2' }] })).toEqual(['altNoMachine']);
    expect(validateExerciseChange({ exerciseId: 'e1', clubs: [{ clubId: 'c1', machineId: 'm2', altId: 'm2' }] })).toEqual(['altSame']);
    expect(validateExerciseChange({ exerciseId: null, newName: 'Pec deck', clubs: [] })).toEqual([]);
  });

  it('richiesta alla funzione del database: esercizio o nome nuovo, macchine per palestra, data di oggi', () => {
    const clubs = [{ clubId: 'c1', machineId: 'm1', altId: 'm2' }, { clubId: 'c2', machineId: null, altId: 'm3' }];
    expect(exerciseChangeArgs('pe1', { exerciseId: 'e1', newName: 'ignorato', clubs }, '2026-11-13')).toEqual({
      p_plan_exercise_id: 'pe1', p_exercise_id: 'e1', p_new_exercise_name: null, p_today: '2026-11-13',
      p_machines: [{ club_id: 'c1', machine_id: 'm1', alt_machine_id: 'm2' }, { club_id: 'c2', machine_id: null, alt_machine_id: null }],
    });
    expect(exerciseChangeArgs('pe1', { exerciseId: null, newName: '  Pec deck ', clubs: [] }, '2026-11-13')).toMatchObject({ p_exercise_id: null, p_new_exercise_name: 'Pec deck', p_machines: [] });
  });

  it('errori del database → messaggi chiari', () => {
    expect(['GE001', 'GE002', 'GE003', 'GE004', 'GE005', '42501', undefined].map((code) => exerciseChangeErrorKey({ code })))
      .toEqual(['notAllowed', 'today', 'machines', 'exercise', 'name', null, null]);
    for (const L of [LANGS.it, LANGS.en]) for (const k of ['pick', 'name', 'altNoMachine', 'altSame', 'today', 'notAllowed', 'machines', 'exercise']) expect(L.chErr[k], k).toBeTruthy();
    expect(LANGS.it.chBtn).toBe('Cambia esercizio');
    expect(LANGS.it.chNeedNet).toBe('Serve internet per cambiare esercizio.');
  });

  it('serie di oggi sul telefono (anche non inviate) per quella riga del piano; cancellate e di altri giorni non contano', () => {
    const T = '2026-11-13';
    const rows = [
      { table: 'sessions', data: { id: 's1', session_date: T, deleted_at: null } },
      { table: 'sessions', data: { id: 's0', session_date: '2026-11-12', deleted_at: null } },
      { table: 'session_exercises', data: { id: 'se1', session_id: 's1', plan_exercise_id: 'pe1', deleted_at: null } },
      { table: 'session_exercises', data: { id: 'se0', session_id: 's0', plan_exercise_id: 'pe2', deleted_at: null } },
      { table: 'session_exercises', data: { id: 'se3', session_id: 's1', plan_exercise_id: 'pe3', deleted_at: null } },
      { table: 'sets', data: { id: 'x1', session_exercise_id: 'se1', deleted_at: null } },
      { table: 'sets', data: { id: 'x0', session_exercise_id: 'se0', deleted_at: null } },
      { table: 'sets', data: { id: 'x3', session_exercise_id: 'se3', deleted_at: '2026-11-13T10:00:00Z' } },
    ];
    expect(hasSetsToday(rows, 'pe1', T)).toBe(true);
    expect(hasSetsToday(rows, 'pe2', T)).toBe(false);   // ieri
    expect(hasSetsToday(rows, 'pe3', T)).toBe(false);   // serie cancellata
    expect(hasSetsToday([], 'pe1', T)).toBe(false);
  });

  it('copia del piano: nuovo esercizio e macchina della palestra principale; serie, rep e RIR uguali', () => {
    const P = { id: 'p', days: [{ id: 'd1', exercises: [{ id: 'pe1', exercise_id: 'e1', exercise: { id: 'e1', name: { it: 'Panca' } }, sets: 2, reps_min: 6, reps_max: 10, rir_min: 1, machine: { id: 'mOld' }, muscle: 'Petto' }] }] };
    const M = { id: 'm5', code: 'x', brand: 'B', model: 'Curl' };
    const ex = { id: 'e3', code: 'leg-curl', name: { it: 'Leg curl' }, exercise_muscles: [{ role: 'primary', muscle: { name: { it: 'Femorali' } } }] };
    const P2 = applyExerciseChange(P, 'pe1', { exercise: ex, homeClubId: 'c1', clubs: [{ clubId: 'c2', machines: [], machineId: null }, { clubId: 'c1', machines: [M], machineId: 'm5', altId: null }] });
    expect(findPlanExercise(P2, 'pe1')).toMatchObject({ exercise_id: 'e3', exercise: { name: { it: 'Leg curl' } }, machine: M, alt_machine: null, club_id: 'c1', sets: 2, reps_min: 6, reps_max: 10, rir_min: 1, muscle: { it: 'Femorali' } });
    expect(findPlanExercise(P, 'pe1').exercise_id).toBe('e1');
    const P3 = applyExerciseChange(P, 'pe1', { exercise: { id: 'e9', name: { it: 'Nuovo' } }, homeClubId: 'c1', clubs: [] });
    expect(findPlanExercise(P3, 'pe1')).toMatchObject({ exercise_id: 'e9', machine: { id: 'mOld' }, muscle: null });
  });

  it('nessuna pagina "Library": la scelta sta dentro la finestra Modifica', () => {
    const main = read('src/main.js');
    expect(main).toMatch(/id="peChange"/);
    expect(main).toMatch(/id="peChg" hidden/);
  });
});
