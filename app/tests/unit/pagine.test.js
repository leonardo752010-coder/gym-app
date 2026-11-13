// Barra in basso (Program / Track / Progress): tasto indietro, pagina di partenza, storico per Progress.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, START_PAGE, navStep, pageFromState, historyList } from '../../src/pages.js';
import { indexRows } from '../../src/logic.js';
import { LANGS } from '../../src/i18n.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

describe('navigazione', () => {
  it('tre pagine, in quest\'ordine; si parte da Track', () => {
    expect(PAGES).toEqual(['program', 'track', 'progress']);
    expect(START_PAGE).toBe('track');
  });

  it('da Track a Program/Progress si aggiunge un passo; tra le due si sostituisce; verso Track si torna indietro', () => {
    expect(navStep('track', 'program', false)).toBe('push');
    expect(navStep('track', 'progress', false)).toBe('push');
    expect(navStep('program', 'progress', true)).toBe('replace');
    expect(navStep('progress', 'program', true)).toBe('replace');
    expect(navStep('program', 'track', true)).toBe('back');
    expect(navStep('progress', 'track', true)).toBe('back');
  });

  it('niente passi doppi: stessa pagina o pagina sconosciuta non fanno niente', () => {
    expect(navStep('track', 'track', false)).toBeNull();
    expect(navStep('program', 'program', true)).toBeNull();
    expect(navStep('track', 'library', false)).toBeNull();
    expect(navStep('program', 'track', false)).toBeNull();   // nessun passo da togliere: si cambia pagina e basta
    expect(navStep('program', 'progress', false)).toBe('push');
  });

  it('cronologia → pagina: senza stato (o stato strano) è Track', () => {
    expect(pageFromState(null)).toBe('track');
    expect(pageFromState({})).toBe('track');
    expect(pageFromState({ gymPage: 'library' })).toBe('track');
    expect(pageFromState({ gymPage: 'program' })).toBe('program');
    expect(pageFromState({ gymPage: 'progress' })).toBe('progress');
  });

  it('niente pagina o voce di menu "Library" / "Libreria"; niente "Importa" o "Crea nuovo programma"', () => {
    // pagine della barra in basso: solo le tre, nessuna "library"
    expect(PAGES.some((p) => /librar|librer/i.test(p))).toBe(false);
    // nomi delle pagine (barra in basso) nelle due lingue
    const nav = [LANGS.it, LANGS.en].flatMap((L) => Object.entries(L).filter(([k]) => /^nav/.test(k)).map(([, v]) => String(v)));
    expect(nav.join(' ')).not.toMatch(/librar|librer/i);
    // nessun tasto di pagina o del menu che porti a una "library" (data-page, id dei tasti del menu)
    const main = read('src/main.js');
    expect(main).not.toMatch(/data-page=["']?librar|gymPage:\s*'librar|id=["']m\w*Lib/i);
    // le funzioni rimandate restano fuori: importazione del piano e "crea nuovo programma"
    const src = main + read('src/pages.js') + JSON.stringify(LANGS);
    expect(src).not.toMatch(/importa|import plan|crea nuovo programma|new program/i);
  });

  it('etichette nelle due lingue', () => {
    expect([LANGS.it.navProgram, LANGS.it.navTrack, LANGS.it.navProgress]).toEqual(['Programma', 'Allenamento', 'Progressi']);
    expect([LANGS.en.navProgram, LANGS.en.navTrack, LANGS.en.navProgress]).toEqual(['Program', 'Workout', 'Progress']);
  });

  it('le pagine nuove non scrivono e non chiamano il server', () => {
    const src = read('src/pages.js');
    expect(src).not.toMatch(/\bapi\b|fetch|write\(|setKv|saveSet|updateSet|deleteSet|localStorage|indexedDB/);
  });
});

// righe come quelle sul telefono
const S = (id, date, extra = {}) => ({ table: 'sessions', data: { id, session_date: date, deleted_at: null, ended_at: null, ...extra } });
const SE = (id, sid, ex, extra = {}) => ({ table: 'session_exercises', data: { id, session_id: sid, exercise_id: ex, machine_id: null, plan_exercise_id: null, position: 0, deleted_at: null, ...extra } });
const ST = (id, se, n, kg, reps, extra = {}) => ({ table: 'sets', data: { id, session_exercise_id: se, set_number: n, weight_kg: kg, reps, rir: 1, set_type: 'normal', deleted_at: null, ...extra } });
const MAC = { id: 'm1', code: 'MF-10', brand: 'Marca', model: 'Press' };
const PLAN = { id: 'p', name: 'Piano', days: [
  { id: 'dA', name: 'Upper A', exercises: [
    { id: 'pe1', exercise_id: 'ex1', exercise: { name: { it: 'Panca', en: 'Bench' } }, machine: MAC, alt_machine: null, sets: 2 },
    { id: 'pe2', exercise_id: 'ex2', exercise: { name: { it: 'Lat', en: 'Lat' } }, machine: null, alt_machine: null, sets: 3 },
  ] },
  { id: 'dB', name: 'Lower A', exercises: [] },
] };

describe('storico per Progress', () => {
  const rows = [
    S('s1', '2026-11-01', { plan_day_id: 'dA', started_at: '2026-11-01T08:00:00Z', ended_at: '2026-11-01T09:00:00Z' }),
    SE('a1', 's1', 'ex2', { plan_exercise_id: 'pe2', position: 1 }), ST('x1', 'a1', 1, 60, 10),
    SE('a0', 's1', 'ex1', { plan_exercise_id: 'pe1', machine_id: 'm1', position: 0 }), ST('x2', 'a0', 2, 80, 8), ST('x3', 'a0', 1, 80, 9),
    ST('x4', 'a0', 3, 999, 1, { deleted_at: '2026-11-01T09:00:00Z' }),
    S('s2', '2026-11-05', { day_name: 'Vecchio giorno' }), SE('b0', 's2', 'exOld'), ST('y1', 'b0', 1, 20, 12),
    S('s3', '2026-11-06', { plan_day_id: 'dB' }), SE('c0', 's3', 'ex1'),                        // seduta senza serie
    S('s4', '2026-11-07', { deleted_at: '2026-11-07T10:00:00Z' }), SE('d0', 's4', 'ex1'), ST('z1', 'd0', 1, 50, 5),   // cancellata
    S('s5', '2026-11-08', { plan_day_id: 'dA' }), SE('e0', 's5', 'ex1'), ST('w1', 'e0', 1, 82.5, 6),   // oggi, in corso
  ];
  const list = historyList(indexRows(rows), PLAN);

  it('dalla più recente; senza sedute vuote o cancellate; comprende quella di oggi', () => {
    expect(list.map((s) => s.id)).toEqual(['s5', 's2', 's1']);
    expect(list[0]).toMatchObject({ date: '2026-11-08', dayName: 'Upper A', ended: false, setCount: 1 });
  });

  it('esercizi nell\'ordine della seduta, serie in ordine, senza serie cancellate; nomi e macchina dal piano', () => {
    const s1 = list.find((s) => s.id === 's1');
    expect(s1).toMatchObject({ dayName: 'Upper A', ended: true, setCount: 3 });
    expect(s1.exercises.map((e) => e.name.it)).toEqual(['Panca', 'Lat']);
    expect(s1.exercises[0].machine.code).toBe('MF-10');
    expect(s1.exercises[0].sets.map((x) => [x.set_number, x.weight_kg, x.reps])).toEqual([[1, 80, 9], [2, 80, 8]]);
  });

  it('esercizio senza plan_exercise_id: nome dall\'esercizio del piano; fuori dal piano: nome vuoto; giorno dal nome salvato', () => {
    expect(list[0].exercises[0].name.it).toBe('Panca');
    const s2 = list.find((s) => s.id === 's2');
    expect(s2.dayName).toBe('Vecchio giorno');
    expect(s2.exercises[0].name).toBeNull();
  });

  it('nome dalla libreria esercizi (exercise_id): anche fuori dal piano, e prima di quello del piano', () => {
    const names = { exOld: { it: 'Pulley basso', en: 'Seated row' }, ex2: { it: 'Lat (libreria)' } };
    const l = historyList(indexRows(rows), PLAN, names);
    expect(l.find((s) => s.id === 's2').exercises[0].name.it).toBe('Pulley basso');
    expect(l.find((s) => s.id === 's1').exercises.map((e) => e.name.it)).toEqual(['Panca', 'Lat (libreria)']);
    // senza piano sul telefono il nome c'è lo stesso
    expect(historyList(indexRows(rows), null, names).find((s) => s.id === 's2').exercises[0].name.it).toBe('Pulley basso');
  });

  it('la riga del piano oggi punta a un altro esercizio: lo storico tiene il nome del suo exercise_id', () => {
    const plan2 = { ...PLAN, days: PLAN.days.map((d) => ({ ...d, exercises: d.exercises.map((pe) => (pe.id === 'pe2' ? { ...pe, exercise_id: 'exNew', exercise: { name: { it: 'Pulley' } } } : pe)) })) };
    const s1 = historyList(indexRows(rows), plan2, { ex2: { it: 'Lat' } }).find((s) => s.id === 's1');
    expect(s1.exercises.map((e) => e.name.it)).toEqual(['Panca', 'Lat']);
  });

  it('macchina dalla libreria (machine_id della seduta): anche se è uscita dal piano', () => {
    const lib = { m1: { id: 'm1', code: 'MF-10', brand: 'Marca', model: 'Press (libreria)' }, m9: { id: 'm9', code: 'OLD-9', brand: 'Vecchia', model: 'Row' } };
    const rows2 = [...rows, S('s6', '2026-11-09', { day_name: 'Vecchio giorno' }), SE('f0', 's6', 'ex1', { machine_id: 'm9' }), ST('v1', 'f0', 1, 40, 10)];
    const l = historyList(indexRows(rows2), PLAN, null, lib);
    expect(l.find((s) => s.id === 's6').exercises[0].machine).toMatchObject({ id: 'm9', brand: 'Vecchia', model: 'Row' });
    expect(l.find((s) => s.id === 's1').exercises[0].machine.model).toBe('Press (libreria)');
    // senza la libreria: macchina fuori dal piano → null (la pagina mostra "altra macchina"), come prima
    expect(historyList(indexRows(rows2), PLAN).find((s) => s.id === 's6').exercises[0].machine).toBeNull();
  });

  it('la riga del piano oggi ha un\'altra macchina: lo storico tiene quella con cui la seduta è stata fatta', () => {
    const NEW = { id: 'm2', code: 'NEW-2', brand: 'Nuova', model: 'Press 2' };
    const plan2 = { ...PLAN, days: PLAN.days.map((d) => ({ ...d, exercises: d.exercises.map((pe) => (pe.id === 'pe1' ? { ...pe, machine: NEW } : pe)) })) };
    const s1 = historyList(indexRows(rows), plan2, null, { m1: MAC }).find((s) => s.id === 's1');
    expect(s1.exercises[0]).toMatchObject({ machineId: 'm1', machine: { code: 'MF-10' } });
  });

  it('senza piano sul telefono funziona lo stesso', () => {
    expect(historyList(indexRows(rows), null).map((s) => s.id)).toEqual(['s5', 's2', 's1']);
    expect(historyList(indexRows([]), PLAN)).toEqual([]);
  });

  it('non cambia le righe', () => {
    const copy = JSON.stringify(rows);
    historyList(indexRows(rows), PLAN);
    expect(JSON.stringify(rows)).toBe(copy);
  });
});
