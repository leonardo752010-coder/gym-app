import { describe, it, expect } from 'vitest';
import { indexRows, findSession, findSessionExercise, lastPerformance, suggest, stepWeight, defaultDay, restFor, looksWrong, kgToUnit, setWeightIn, addDays } from '../../src/logic.js';

const S = (id, date, extra = {}) => ({ table: 'sessions', data: { id, session_date: date, deleted_at: null, ...extra } });
const SE = (id, sid, ex, extra = {}) => ({ table: 'session_exercises', data: { id, session_id: sid, exercise_id: ex, machine_id: null, plan_exercise_id: null, deleted_at: null, ...extra } });
const ST = (id, se, n, kg, reps, extra = {}) => ({ table: 'sets', data: { id, session_exercise_id: se, set_number: n, weight_kg: kg, reps, rir: 1, set_type: 'normal', deleted_at: null, performed_at: '2026-11-01T10:0' + n + ':00Z', ...extra } });

const MAC_A = { id: 'mA', weight_unit: 'kg', weight_step: 5 };
const MAC_B = { id: 'mB', weight_unit: 'kg', weight_list: [10, 15, 22.5, 30] };
const pe = (extra = {}) => ({ id: 'pe1', exercise_id: 'ex1', sets: 2, reps_min: 6, reps_max: 10, machine: null, ...extra });

describe('volta scorsa', () => {
  const rows = [
    S('s1', '2026-10-28'), SE('se1', 's1', 'ex1'), ST('a', 'se1', 1, 80, 8), ST('b', 'se1', 2, 80, 7),
    S('s2', '2026-11-01'), SE('se2', 's2', 'ex1'), ST('c', 'se2', 1, 82.5, 6), ST('d', 'se2', 2, 82.5, 6, { deleted_at: '2026-11-01T11:00:00Z' }),
    ST('w', 'se2', 3, 40, 10, { set_type: 'warmup' }),
    S('s3', '2026-11-03', { deleted_at: '2026-11-03T12:00:00Z' }), SE('se3', 's3', 'ex1'), ST('e', 'se3', 1, 999, 1),
    S('today', '2026-11-06'), SE('se4', 'today', 'ex1', { plan_exercise_id: 'pe1' }), ST('f', 'se4', 1, 85, 6),
  ];
  const idx = indexRows(rows);

  it('prende la seduta più recente, senza serie cancellate, riscaldamento e sedute cancellate, esclusa quella di oggi', () => {
    const l = lastPerformance(idx, pe(), { excludeSessionId: 'today' });
    expect(l.date).toBe('2026-11-01');
    expect(l.sets.map((s) => [s.kg, s.reps])).toEqual([[82.5, 6]]);
  });

  it('senza escludere oggi, prende oggi', () => {
    expect(lastPerformance(idx, pe()).sessionId).toBe('today');
  });

  it('rispetta la macchina: stesso esercizio su un\'altra macchina non conta', () => {
    const idx2 = indexRows([
      S('s1', '2026-10-30'), SE('x1', 's1', 'ex1', { machine_id: 'mA' }), ST('a', 'x1', 1, 50, 10),
      S('s2', '2026-11-02'), SE('x2', 's2', 'ex1', { machine_id: 'mB' }), ST('b', 'x2', 1, 30, 12),
    ]);
    expect(lastPerformance(idx2, pe({ machine: MAC_A })).sets[0].kg).toBe(50);
    expect(lastPerformance(idx2, pe({ machine: MAC_B })).sets[0].kg).toBe(30);
    expect(lastPerformance(idx2, pe()).sets[0].kg).toBe(30); // senza macchina nel piano: la più recente
    expect(lastPerformance(idx2, pe({ exercise_id: 'altro' }))).toBeNull();
  });

  it('trova la seduta di oggi per giorno (anche importata, per nome) e l\'esercizio giusto', () => {
    const day = { id: 'd1', name: 'Upper A' };
    const idx3 = indexRows([S('t1', '2026-11-06', { plan_day_id: null, day_name: 'Upper A' }), SE('k', 't1', 'ex1', { plan_exercise_id: 'pe1' })]);
    expect(findSession(idx3, { date: '2026-11-06', day }).id).toBe('t1');
    expect(findSession(idx3, { date: '2026-11-05', day })).toBeNull();
    expect(findSessionExercise(idx3, 't1', pe()).id).toBe('k');
    expect(findSessionExercise(idx3, 't1', pe({ id: 'pe2' }))).toBeNull();
  });
});

describe('suggerimento (doppia progressione)', () => {
  const last = (sets) => ({ date: '2026-11-01', sets: sets.map(([kg, reps], i) => ({ n: i + 1, kg, reps })) });

  it('range chiuso in tutte le serie: un salto di peso in più, reps al minimo', () => {
    const s = suggest(pe({ machine: MAC_A }), last([[80, 10], [80, 10]]), 'kg');
    expect(s.topped).toBe(true);
    expect(s.sets).toEqual([{ n: 1, weight: 85, reps: 6, why: 'up' }, { n: 2, weight: 85, reps: 6, why: 'up' }]);
  });
  it('range non chiuso: stesso peso, una rep in più', () => {
    const s = suggest(pe(), last([[80, 8], [80, 10]]), 'kg');
    expect(s.topped).toBe(false);
    expect(s.sets[0]).toEqual({ n: 1, weight: 80, reps: 9, why: 'reps' });
    expect(s.sets[1]).toEqual({ n: 2, weight: 80, reps: 10, why: 'hold' });
  });
  it('sotto il minimo: punta al minimo', () => {
    expect(suggest(pe(), last([[80, 4]]), 'kg').sets[0].reps).toBe(6);
  });
  it('usa la lista dei pesi della macchina', () => {
    expect(suggest(pe({ machine: MAC_B, sets: 1 }), last([[15, 10]]), 'kg').sets[0].weight).toBe(22.5);
  });
  it('senza volta scorsa: nessun suggerimento', () => {
    expect(suggest(pe(), null, 'kg')).toBeNull();
  });
  it('in libbre usa il peso scritto in libbre', () => {
    const l = { sets: [{ n: 1, kg: 9.072, reps: 10, input_weight: 20, input_unit: 'lb' }] };
    expect(suggest(pe({ sets: 1 }), l, 'lb').sets[0].weight).toBe(25);
  });
});

describe('salti di peso', () => {
  it('passo della macchina, limiti min/max', () => {
    expect(stepWeight(40, { weight_unit: 'kg', weight_step: 5, weight_min: 5, weight_max: 45 }, 'kg', 1)).toBe(45);
    expect(stepWeight(45, { weight_unit: 'kg', weight_step: 5, weight_min: 5, weight_max: 45 }, 'kg', 1)).toBe(45);
    expect(stepWeight(5, { weight_unit: 'kg', weight_step: 5, weight_min: 5 }, 'kg', -1)).toBe(5);
  });
  it('senza dati sulla macchina: 2,5 kg o 5 lb', () => {
    expect(stepWeight(20, null, 'kg', 1)).toBe(22.5);
    expect(stepWeight(20, null, 'lb', -1)).toBe(15);
    expect(stepWeight(0, null, 'kg', -1)).toBe(0);
  });
  it('lista dei pesi: valore successivo e precedente, anche partendo da un peso fuori lista', () => {
    expect(stepWeight(16, MAC_B, 'kg', 1)).toBe(22.5);
    expect(stepWeight(16, MAC_B, 'kg', -1)).toBe(15);
    expect(stepWeight(30, MAC_B, 'kg', 1)).toBe(30);
  });
  it('macchina in libbre ma app in kg: passo normale', () => {
    expect(stepWeight(20, { weight_unit: 'lb', weight_step: 10 }, 'kg', 1)).toBe(22.5);
  });
  it('conversioni', () => {
    expect(kgToUnit(100, 'lb')).toBe(220.5);
    expect(setWeightIn({ weight_kg: 9.072, input_weight: 20, input_unit: 'lb' }, 'lb')).toBe(20);
    expect(setWeightIn({ weight_kg: 9.072, input_weight: 20, input_unit: 'lb' }, 'kg')).toBe(9.07);
  });
});

describe('giorno proposto, recupero, controllo del peso', () => {
  const plan = { days: [{ id: 'd1', name: 'Upper A' }, { id: 'd2', name: 'Lower A' }, { id: 'd3', name: 'Upper B' }] };
  it('il giorno dopo l\'ultimo fatto, anche da sedute importate (per nome)', () => {
    const idx = indexRows([S('s1', '2026-11-04', { day_name: 'Lower A' }), SE('a', 's1', 'ex'), ST('x', 'a', 1, 10, 10)]);
    expect(defaultDay(plan, idx, '2026-11-06').id).toBe('d3');
  });
  it('rotazione: dopo l\'ultimo giorno torna al primo; seduta di oggi già iniziata vince', () => {
    const idx = indexRows([S('s1', '2026-11-04', { plan_day_id: 'd3' }), SE('a', 's1', 'ex'), ST('x', 'a', 1, 10, 10)]);
    expect(defaultDay(plan, idx, '2026-11-06').id).toBe('d1');
    const idx2 = indexRows([S('s1', '2026-11-06', { plan_day_id: 'd2' }), SE('a', 's1', 'ex'), ST('x', 'a', 1, 10, 10),
      S('s0', '2026-11-05', { plan_day_id: 'd3' }), SE('b', 's0', 'ex'), ST('y', 'b', 1, 10, 10)]);
    expect(defaultDay(plan, idx2, '2026-11-06').id).toBe('d2');
    expect(defaultDay(plan, indexRows([]), '2026-11-06').id).toBe('d1');
  });
  it('recupero', () => {
    expect(restFor({ reps_max: 10 })).toBe(150);
    expect(restFor({ reps_max: 15 })).toBe(120);
    expect(restFor({ reps_max: 20 })).toBe(90);
    expect(restFor({ reps_max: 10, rest_seconds: 200 })).toBe(200);
    expect(restFor({ reps_max: 10, rest_seconds: 200, superset_rest: 60 })).toBe(60);
  });
  it('peso sospetto', () => {
    expect(looksWrong(200, { sets: [{ kg: 80 }] })).toBe(true);
    expect(looksWrong(90, { sets: [{ kg: 80 }] })).toBe(false);
    expect(looksWrong(350, null)).toBe(true);
  });
  it('date', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
