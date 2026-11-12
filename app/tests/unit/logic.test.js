import { describe, it, expect } from 'vitest';
import { indexRows, findSession, findSessionExercise, lastPerformance, suggest, REP_SOPRA_MINIMO_PER_SALIRE, stepWeight, defaultDay, restFor, looksWrong, kgToUnit, setWeightIn, addDays } from '../../src/logic.js';

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

describe('suggerimento (doppia progressione con serie top)', () => {
  // serie della volta scorsa: [kg, rep, rir] (rir assente = dato vecchio senza RIR)
  const last = (sets) => ({ date: '2026-11-01', sets: sets.map(([kg, reps, rir], i) => ({ n: i + 1, kg, reps, rir: rir ?? null })) });
  const wr = (s) => s.sets.map((x) => [x.weight, x.reps, x.why]);
  const SOGLIA = REP_SOPRA_MINIMO_PER_SALIRE;

  it('soglia delle serie dopo: costante, 2 rep', () => {
    expect(REP_SOPRA_MINIMO_PER_SALIRE).toBe(2);
  });
  it('top (RIR 0) al massimo: un salto della macchina e rep al minimo; mai "±0 rep"', () => {
    const s = suggest(pe({ machine: MAC_A, sets: 3 }), last([[80, 10, 0], [80, 9, 2], [80, 8, 2]]), 'kg');
    expect(s.topped).toBe(true);
    expect(s.sets[0]).toEqual({ n: 1, weight: 85, reps: 6, why: 'up' });
  });
  it('top sotto il massimo: stesso peso, una rep in più (anche le serie dopo, col peso vecchio)', () => {
    const s = suggest(pe(), last([[80, 8, 0], [80, 9, 2]]), 'kg');
    expect(s.topped).toBe(false);
    expect(wr(s)).toEqual([[80, 9, 'reps'], [80, 10, 'reps']]);
  });
  it('nessuna serie a RIR 0: stesso peso e una rep in più, niente salita (anche con tutte al massimo)', () => {
    const s = suggest(pe(), last([[80, 10, 2], [80, 10, 1]]), 'kg');
    expect(s.topped).toBe(false);
    expect(wr(s)).toEqual([[80, 10, 'hold'], [80, 10, 'hold']]);
    expect(wr(suggest(pe(), last([[80, 9, 1], [80, 8, 2]]), 'kg'))).toEqual([[80, 10, 'reps'], [80, 9, 'reps']]);
  });
  it('RIR mancante (dati vecchi): come senza serie a RIR 0', () => {
    expect(wr(suggest(pe({ machine: MAC_A }), last([[80, 10], [80, 8]]), 'kg'))).toEqual([[80, 10, 'hold'], [80, 9, 'reps']]);
  });
  it('serie dopo, 2+ rep sopra il minimo a RIR 1-2: salgono anche loro (un salto dal loro peso), rep al minimo', () => {
    const s = suggest(pe({ machine: MAC_A, sets: 3 }), last([[80, 10, 0], [80, 6 + SOGLIA, 2], [80, 6, 1]]), 'kg');
    expect(wr(s)).toEqual([[85, 6, 'up'], [85, 6, 'up'], [85, 6, 'up']]);
    // serie dopo più leggera della top: sale dal suo peso, non da quello della top
    expect(wr(suggest(pe(), last([[80, 10, 0], [75, 9, 1]]), 'kg'))).toEqual([[82.5, 6, 'up'], [77.5, 6, 'up']]);
  });
  it('serie dopo vicino al minimo: peso vecchio, una rep in più', () => {
    const s = suggest(pe({ sets: 3 }), last([[80, 10, 0], [80, 6 + SOGLIA - 1, 2], [80, 6, 2]]), 'kg');
    expect(wr(s)).toEqual([[82.5, 6, 'up'], [80, 8, 'reps'], [80, 8, 'reps']]);
  });
  it('si guarda la PRIMA serie a RIR 1-2 (RIR 3 o più non conta)', () => {
    const s = suggest(pe({ sets: 3 }), last([[80, 10, 0], [80, 9, 3], [80, 7, 1], [80, 10, 2]]), 'kg');
    expect(wr(s)).toEqual([[82.5, 6, 'up'], [80, 8, 'reps'], [80, 8, 'reps']]);
  });
  it('nessuna serie a RIR 1-2: le serie dopo restano col loro peso vecchio, una rep in più', () => {
    const s = suggest(pe({ sets: 3 }), last([[80, 10, 0], [80, 9, 3], [77.5, 8, 0]]), 'kg');
    expect(wr(s)).toEqual([[82.5, 6, 'up'], [80, 10, 'reps'], [77.5, 9, 'reps']]);
  });
  it('la top è la prima a RIR 0 anche se non è la serie 1', () => {
    const s = suggest(pe(), last([[80, 7, 1], [80, 10, 0]]), 'kg');
    expect(s.topped).toBe(true);
    expect(wr(s)).toEqual([[80, 8, 'reps'], [82.5, 6, 'up']]);
  });
  it('riscaldamento fuori dalla regola: una serie di riscaldamento a RIR 0 non è la top', () => {
    const idx = indexRows([S('s1', '2026-11-01'), SE('se1', 's1', 'ex1'),
      ST('w', 'se1', 1, 40, 12, { set_type: 'warmup', rir: 0 }), ST('a', 'se1', 2, 80, 10, { rir: 2 }), ST('b', 'se1', 3, 80, 10, { rir: 1 })]);
    expect(wr(suggest(pe(), lastPerformance(idx, pe()), 'kg'))).toEqual([[80, 10, 'hold'], [80, 10, 'hold']]);
  });
  it('macchina già al peso più alto: la top tiene peso e rep', () => {
    expect(wr(suggest(pe({ machine: MAC_B, sets: 1 }), last([[30, 10, 0]]), 'kg'))).toEqual([[30, 10, 'hold']]);
  });
  it('sotto il minimo: punta al minimo', () => {
    expect(suggest(pe(), last([[80, 4, 0]]), 'kg').sets[0].reps).toBe(6);
  });
  it('usa la lista dei pesi della macchina', () => {
    expect(suggest(pe({ machine: MAC_B, sets: 1 }), last([[15, 10, 0]]), 'kg').sets[0].weight).toBe(22.5);
  });
  it('senza volta scorsa: nessun suggerimento', () => {
    expect(suggest(pe(), null, 'kg')).toBeNull();
  });
  it('in libbre usa il peso scritto in libbre', () => {
    const l = { sets: [{ n: 1, kg: 9.072, reps: 10, rir: 0, input_weight: 20, input_unit: 'lb' }] };
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
