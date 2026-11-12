// Progressi: filtri dello Storico, punti del grafico (e1RM), tasto "Storico" (ultime 3 volte). Solo logica pura.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexRows, e1rm, e1rmPoints, lastPerformance, lastPerformances } from '../../src/logic.js';
import { historyList, historyFilterOptions, filterHistory, chartChoices } from '../../src/pages.js';
import { LANGS } from '../../src/i18n.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

// righe come quelle sul telefono
const S = (id, date, extra = {}) => ({ table: 'sessions', data: { id, session_date: date, deleted_at: null, ended_at: date + 'T10:00:00Z', started_at: date + 'T09:00:00Z', ...extra } });
const SE = (id, sid, ex, mac, extra = {}) => ({ table: 'session_exercises', data: { id, session_id: sid, exercise_id: ex, machine_id: mac, plan_exercise_id: null, position: 1, deleted_at: null, ...extra } });
const ST = (id, se, n, kg, reps, rir, extra = {}) => ({ table: 'sets', data: { id, session_exercise_id: se, set_number: n, weight_kg: kg, reps, rir, set_type: 'normal', performed_at: null, deleted_at: null, ...extra } });

const M1 = { id: 'm1', code: 'MF-10', brand: 'Marca', model: 'Press' };
const PLAN = { id: 'p', name: 'Piano', days: [
  { id: 'dA', name: 'Upper A', exercises: [
    { id: 'pe1', exercise_id: 'bench', exercise: { name: { it: 'Panca', en: 'Bench' } }, machine: M1, alt_machine: null, sets: 3 },
    { id: 'pe2', exercise_id: 'row', exercise: { name: { it: 'Rematore', en: 'Row' } }, machine: null, alt_machine: null, sets: 3 },
  ] },
  { id: 'dB', name: 'Lower A', exercises: [
    { id: 'pe3', exercise_id: 'squat', exercise: { name: { it: 'Squat', en: 'Squat' } }, machine: null, alt_machine: null, sets: 3 },
  ] },
] };

const rows = [
  // 1 nov, Upper A: panca su m1, rematore
  S('s1', '2026-11-01', { plan_day_id: 'dA' }),
  SE('a1', 's1', 'bench', 'm1', { plan_exercise_id: 'pe1' }), ST('x1', 'a1', 1, 40, 12, null, { set_type: 'warmup' }), ST('x2', 'a1', 2, 80, 8, 2), ST('x3', 'a1', 3, 80, 7, 1),
  SE('a2', 's1', 'row', null, { plan_exercise_id: 'pe2', position: 2 }), ST('x4', 'a2', 1, 60, 10, 2),
  // 3 nov, Lower A
  S('s2', '2026-11-03', { plan_day_id: 'dB' }), SE('b1', 's2', 'squat', null, { plan_exercise_id: 'pe3' }), ST('y1', 'b1', 1, 100, 5, 2),
  // 5 nov, Upper A: panca su m1 (meglio) + panca su un'altra macchina m2 (non si mischia)
  S('s3', '2026-11-05', { plan_day_id: 'dA' }),
  SE('c1', 's3', 'bench', 'm1', { plan_exercise_id: 'pe1' }), ST('z1', 'c1', 1, 82.5, 8, 2), ST('z2', 'c1', 2, 82.5, null, 1), ST('z3', 'c1', 3, null, 8, 1),
  SE('c2', 's3', 'bench', 'm2', { position: 2 }), ST('z4', 'c2', 1, 200, 10, 0),
  // 8 nov, Upper A: panca su m1, una serie cancellata (fuori)
  S('s4', '2026-11-08', { plan_day_id: 'dA' }),
  SE('d1', 's4', 'bench', 'm1', { plan_exercise_id: 'pe1' }), ST('w1', 'd1', 1, 85, 6, null), ST('w2', 'd1', 2, 300, 10, 0, { deleted_at: '2026-11-08T10:00:00Z' }),
  // seduta cancellata: fuori da tutto
  S('s5', '2026-11-09', { plan_day_id: 'dA', deleted_at: '2026-11-09T10:00:00Z' }), SE('e1', 's5', 'bench', 'm1'), ST('v1', 'e1', 1, 500, 10, 0),
  // seduta vecchia senza giorno del piano (solo il nome salvato)
  S('s0', '2026-10-20', { day_name: 'Vecchio' }), SE('f1', 's0', 'row', null), ST('u1', 'f1', 1, 55, 10, 3),
];
const idx = indexRows(rows);
const list = historyList(idx, PLAN);

describe('e1RM', () => {
  it('formula: kg × (1 + (reps + RIR) / 30); esempio 80 kg × 8 @2 = 106,7', () => {
    expect(e1rm(80, 8, 2)).toBeCloseTo(106.667, 3);
    expect(Math.round(e1rm(80, 8, 2) * 10) / 10).toBe(106.7);
    expect(e1rm(100, 5, 0)).toBeCloseTo(116.667, 3);
  });

  it('RIR mancante conta 0; numeri scritti come testo vanno bene', () => {
    expect(e1rm(85, 6, null)).toBeCloseTo(102, 6);
    expect(e1rm(85, 6, undefined)).toBeCloseTo(102, 6);
    expect(e1rm('82.5', '8', '2')).toBeCloseTo(110, 6);
  });

  it('mancano kg o reps (o non sono numeri): null', () => {
    expect(e1rm(null, 8, 2)).toBeNull();
    expect(e1rm(80, null, 2)).toBeNull();
    expect(e1rm('', 8, 2)).toBeNull();
    expect(e1rm(80, '', 2)).toBeNull();
    expect(e1rm('abc', 8, 2)).toBeNull();
    expect(e1rm(-5, 8, 2)).toBeNull();
  });
});

describe('punti del grafico', () => {
  it('un punto per seduta, dalla più vecchia; la serie migliore; riscaldamento, serie senza kg/reps e cancellate fuori', () => {
    const pts = e1rmPoints(idx, 'bench', 'm1');
    expect(pts.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-05', '2026-11-08']);
    expect(pts[0].best).toBeCloseTo(e1rm(80, 8, 2), 6);           // 106,7 batte 80 × 7 @1 (101,3); il riscaldamento 40 × 12 non conta
    expect(pts[0].bestSet.id).toBe('x2');
    expect(pts[1].best).toBeCloseTo(110, 6);                       // 82,5 × 8 @2; le serie senza reps o kg si saltano
    expect(pts[2].best).toBeCloseTo(102, 6);                       // RIR mancante = 0; la serie cancellata da 300 kg non c'è
    expect(pts[0].sets.map((s) => s.id)).toEqual(['x2', 'x3']);    // serie del giorno mostrate al tocco: senza riscaldamento
  });

  it('macchine diverse non si mischiano; senza macchina = null', () => {
    expect(e1rmPoints(idx, 'bench', 'm2').map((p) => p.date)).toEqual(['2026-11-05']);
    expect(e1rmPoints(idx, 'row', null).map((p) => p.date)).toEqual(['2026-10-20', '2026-11-01']);
    expect(e1rmPoints(idx, 'row', 'm1')).toEqual([]);
    expect(e1rmPoints(indexRows([]), 'bench', 'm1')).toEqual([]);
  });

  it('scelte del grafico: una per esercizio + macchina, la più recente per prima, "multi" se più macchine', () => {
    const c = chartChoices(list);
    expect(c.map((x) => x.key)).toEqual(['bench|m1', 'bench|m2', 'squat|', 'row|']);
    expect(c.find((x) => x.key === 'bench|m1')).toMatchObject({ count: 3, multi: true, machine: M1 });
    expect(c.find((x) => x.key === 'bench|m2')).toMatchObject({ count: 1, multi: true, machine: null, machineId: 'm2' });
    expect(c.find((x) => x.key === 'row|')).toMatchObject({ count: 2, multi: false });
  });
});

describe('Storico con filtri', () => {
  it('scelte dei filtri: workout nell\'ordine del piano (poi quelli fuori piano), esercizi una volta sola', () => {
    const o = historyFilterOptions(list, PLAN);
    expect(o.days.map((d) => d.key)).toEqual(['d:dA', 'd:dB', 'n:Vecchio']);
    expect(o.days.map((d) => d.name)).toEqual(['Upper A', 'Lower A', 'Vecchio']);
    expect(o.exercises.map((e) => e.id).sort()).toEqual(['bench', 'row', 'squat']);
    expect(o.exercises.find((e) => e.id === 'bench').name.it).toBe('Panca');
  });

  it('senza filtri: tutto come prima', () => {
    expect(filterHistory(list, {})).toEqual(list);
    expect(filterHistory(list, { day: '', exercise: '' }).map((s) => s.id)).toEqual(['s4', 's3', 's2', 's1', 's0']);
  });

  it('filtro per workout', () => {
    expect(filterHistory(list, { day: 'd:dA' }).map((s) => s.id)).toEqual(['s4', 's3', 's1']);
    expect(filterHistory(list, { day: 'n:Vecchio' }).map((s) => s.id)).toEqual(['s0']);
  });

  it('filtro per esercizio: cronologia di quell\'esercizio dalla più recente, con macchina e serie; conteggio delle serie rifatto', () => {
    const h = filterHistory(list, { exercise: 'bench' });
    expect(h.map((s) => s.id)).toEqual(['s4', 's3', 's1']);
    expect(h[1].exercises.map((e) => e.machineId)).toEqual(['m1', 'm2']);
    expect(h[1].exercises[0].machine).toEqual(M1);
    expect(h[2].exercises.map((e) => e.exerciseId)).toEqual(['bench']);
    expect(h[2].setCount).toBe(3);
    expect(h[2].exercises[0].sets.map((x) => [x.weight_kg, x.reps, x.rir])).toEqual([[40, 12, null], [80, 8, 2], [80, 7, 1]]);
  });

  it('i due filtri insieme', () => {
    expect(filterHistory(list, { day: 'd:dA', exercise: 'row' }).map((s) => s.id)).toEqual(['s1']);
    expect(filterHistory(list, { day: 'd:dB', exercise: 'bench' })).toEqual([]);
  });

  it('non cambia le righe né la lista', () => {
    const r = JSON.stringify(rows), l = JSON.stringify(list);
    filterHistory(list, { day: 'd:dA', exercise: 'bench' }); historyFilterOptions(list, PLAN); chartChoices(list); e1rmPoints(idx, 'bench', 'm1');
    expect(JSON.stringify(rows)).toBe(r);
    expect(JSON.stringify(list)).toBe(l);
  });
});

describe('tasto "Storico": ultime 3 volte', () => {
  const pe1 = PLAN.days[0].exercises[0], pe2 = PLAN.days[0].exercises[1];

  it('dalla più recente, al massimo 3, stessa macchina del piano, senza la seduta in corso', () => {
    const all = lastPerformances(idx, pe1, {}, 3);
    expect(all.map((p) => p.date)).toEqual(['2026-11-08', '2026-11-05', '2026-11-01']);
    const excl = lastPerformances(idx, pe1, { excludeSessionId: ['s4'] }, 3);
    expect(excl.map((p) => p.date)).toEqual(['2026-11-05', '2026-11-01']);
    expect(excl[0].sets.map((s) => s.kg)).toEqual([82.5, 82.5, null]);   // le serie di m2 (200 kg) non ci sono
    expect(lastPerformances(idx, pe1, { onOrBefore: '2026-11-04' }, 3).map((p) => p.date)).toEqual(['2026-11-01']);
    expect(lastPerformances(idx, pe1, {}, 2)).toHaveLength(2);
  });

  it('senza riscaldamento; esercizio senza macchina: qualsiasi macchina', () => {
    expect(lastPerformances(idx, pe1, {}, 3)[2].sets.map((s) => s.reps)).toEqual([8, 7]);
    expect(lastPerformances(idx, pe2, {}, 3).map((p) => p.date)).toEqual(['2026-11-01', '2026-10-20']);
  });

  it('lastPerformance ("Volta scorsa") = la prima delle ultime volte, come prima', () => {
    const one = lastPerformance(idx, pe1, { excludeSessionId: 's4' });
    expect(one).toEqual(lastPerformances(idx, pe1, { excludeSessionId: 's4' }, 3)[0]);
    expect(one.date).toBe('2026-11-05');
    expect(lastPerformance(indexRows([]), pe1)).toBeNull();
    expect(lastPerformances(indexRows([]), pe1)).toEqual([]);
  });
});

describe('testi e codice', () => {
  it('testi nuovi nelle due lingue', () => {
    for (const k of ['histTab', 'chartTab', 'histBtn', 'fWorkout', 'fExercise', 'allWorkouts', 'allExercises', 'noMatch', 'otherMachine', 'noMachine',
      'chartNone', 'chartFew', 'e1rm', 'chartHint', 'pointAria', 'best', 'histTitle', 'histNone']) {
      expect(LANGS.it[k], 'it.' + k).toBeTruthy();
      expect(LANGS.en[k], 'en.' + k).toBeTruthy();
    }
    expect(LANGS.en.histBtn).toBe('History');
  });

  it('Storico e Grafico non scrivono: niente salvataggio né rete nelle funzioni nuove di main.js', () => {
    const src = read('src/main.js');
    for (const fn of ['renderProgress', 'historyView', 'chartView', 'pointCard', 'openHist']) {
      const start = src.indexOf('function ' + fn + '(');
      expect(start, fn).toBeGreaterThan(-1);
      const end = src.slice(start).search(/\r?\n\}\r?\n/);
      expect(end, fn).toBeGreaterThan(0);
      const body = src.slice(start, start + end);
      expect(body, fn).not.toMatch(/\.write\(|saveSet|updateSet|deleteSet|syncNow|refresh\(|api\.|setKv|localStorage|ls\.set/);
    }
  });
});
