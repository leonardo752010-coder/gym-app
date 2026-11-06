// Fine seduta e seduta nuova: la schermata riparte vuota e le serie vecchie diventano la "volta scorsa".
// Niente si cancella: le sedute passate restano com'erano.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, Local } from '../../src/store.js';
import { flush } from '../../src/sync.js';
import { saveSet } from '../../src/session.js';
import { indexRows, openSessions, findSession, setsInSessions, lastPerformance, defaultDay, addDays, OPEN_HOURS } from '../../src/logic.js';

// Ore locali del telefono (come le vede l'app).
const at = (date, hh, mm = 0) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, hh, mm); };
const D0 = '2026-11-06';
const D7 = addDays(D0, 7);

const UA = { id: 'dUA', name: 'Upper A' }, LA = { id: 'dLA', name: 'Lower A' };
const peP = { id: 'pP', exercise_id: 'panca', sets: 2, reps_min: 6, reps_max: 10, machine: null };
const peL = { id: 'pL', exercise_id: 'lat', sets: 2, reps_min: 8, reps_max: 12, machine: null };
const peH = { id: 'pH', exercise_id: 'hack', sets: 2, reps_min: 6, reps_max: 10, machine: null };
UA.exercises = [peP, peL]; LA.exercises = [peH];
const PLAN = { id: 'plan', days: [UA, LA] };

// Righe come nel database
const S = (id, date, day, extra = {}) => ({ table: 'sessions', data: { id, session_date: date, plan_day_id: day.id, day_name: day.name, deleted_at: null, ended_at: null, ...extra } });
const SE = (id, sid, pe) => ({ table: 'session_exercises', data: { id, session_id: sid, exercise_id: pe.exercise_id, machine_id: null, plan_exercise_id: pe.id, deleted_at: null } });
const ST = (id, se, n, kg, reps, when) => ({ table: 'sets', data: { id, session_exercise_id: se, set_number: n, weight_kg: kg, reps, rir: 1, set_type: 'normal', deleted_at: null, performed_at: when.toISOString() } });

describe('regola della seduta in corso (logica)', () => {
  // Upper A il 6 novembre: panca 2 serie, lat 1 serie su 2 (seduta lasciata a metà).
  const week1 = [
    S('s0', D0, UA, { started_at: at(D0, 18).toISOString() }),
    SE('se0p', 's0', peP), ST('a', 'se0p', 1, 80, 10, at(D0, 18, 5)), ST('b', 'se0p', 2, 80, 9, at(D0, 18, 9)),
    SE('se0l', 's0', peL), ST('c', 'se0l', 1, 60, 10, at(D0, 18, 20)),
  ];

  it('stesso giorno del piano la settimana dopo: nessuna seduta in corso (schermata vuota), la vecchia è la "volta scorsa"', () => {
    const idx = indexRows(week1);
    const open = openSessions(idx, { date: D7, day: UA, now: at(D7, 18) });
    expect(open).toEqual([]);
    expect(setsInSessions(idx, open, peP)).toEqual([]);
    const last = lastPerformance(idx, peP, { excludeSessionId: [], onOrBefore: D7 });
    expect(last.date).toBe(D0);
    expect(last.sets.map((s) => [s.kg, s.reps])).toEqual([[80, 10], [80, 9]]);
    expect(idx.sessions.get('s0')).toBeTruthy(); // la seduta vecchia è ancora lì
  });

  it('due aperture lo stesso giorno: la stessa seduta, con le sue serie', () => {
    const idx = indexRows(week1);
    const open = openSessions(idx, { date: D0, day: UA, now: at(D0, 21) });
    expect(open.map((s) => s.id)).toEqual(['s0']);
    expect(setsInSessions(idx, open, peP).length).toBe(2);
    expect(defaultDay(PLAN, idx, D0, at(D0, 21)).id).toBe('dUA');
  });

  it('seduta lasciata a metà: il giorno dopo non si riapre; il piano va avanti e le serie fatte sono la "volta scorsa"', () => {
    const idx = indexRows(week1);
    const D1 = addDays(D0, 1);
    expect(openSessions(idx, { date: D1, day: UA, now: at(D1, 18) })).toEqual([]);
    expect(defaultDay(PLAN, idx, D1, at(D1, 18)).id).toBe('dLA');
    const last = lastPerformance(idx, peL, { onOrBefore: D1 });
    expect(last.sets.map((s) => [s.kg, s.reps])).toEqual([[60, 10]]);
  });

  it('cambio di giorno a metà: ogni giorno del piano ha la sua seduta, quella lasciata non si perde', () => {
    const rows = [...week1, S('s1', D0, LA, { started_at: at(D0, 18, 30).toISOString() }), SE('se1h', 's1', peH), ST('h', 'se1h', 1, 100, 8, at(D0, 18, 35))];
    const idx = indexRows(rows);
    expect(findSession(idx, { date: D0, day: UA, now: at(D0, 19) }).id).toBe('s0');
    expect(findSession(idx, { date: D0, day: LA, now: at(D0, 19) }).id).toBe('s1');
    expect(defaultDay(PLAN, idx, D0, at(D0, 19)).id).toBe('dLA'); // l'ultimo toccato
  });

  it('a cavallo della mezzanotte: la seduta continua per ' + OPEN_HOURS + ' ore dopo l\'ultima serie, poi è passata', () => {
    const D1 = addDays(D0, 1);
    const rows = [S('n', D0, UA, { started_at: at(D0, 23, 10).toISOString() }), SE('nse', 'n', peP), ST('x', 'nse', 1, 80, 8, at(D0, 23, 50))];
    const idx = indexRows(rows);
    expect(findSession(idx, { date: D1, day: UA, now: at(D1, 0, 20) }).id).toBe('n');
    expect(defaultDay(PLAN, idx, D1, at(D1, 0, 20)).id).toBe('dUA');
    expect(findSession(idx, { date: D1, day: UA, now: at(D1, 3, 0) })).toBeNull();
    // due giorni dopo non vale mai
    expect(findSession(idx, { date: addDays(D0, 2), day: UA, now: at(addDays(D0, 2), 0, 5) })).toBeNull();
  });

  it('seduta chiusa (ended_at): non si riapre nemmeno lo stesso giorno e diventa la "volta scorsa"', () => {
    const rows = week1.map((r) => (r.data.id === 's0' ? { ...r, data: { ...r.data, ended_at: at(D0, 19).toISOString() } } : r));
    const idx = indexRows(rows);
    expect(findSession(idx, { date: D0, day: UA, now: at(D0, 20) })).toBeNull();
    expect(lastPerformance(idx, peP, { onOrBefore: D0 }).sessionId).toBe('s0');
  });

  it('due telefoni senza rete hanno iniziato la stessa seduta: si vedono le serie di tutti e due, nessuna come "volta scorsa"', () => {
    const rows = [
      S('old', addDays(D0, -7), UA), SE('ose', 'old', peP), ST('o1', 'ose', 1, 75, 8, at(addDays(D0, -7), 18)),
      S('pA', D0, UA, { started_at: at(D0, 18).toISOString() }), SE('aP', 'pA', peP), ST('a1', 'aP', 1, 80, 8, at(D0, 18, 1)),
      S('pB', D0, UA, { started_at: at(D0, 18, 2).toISOString() }), SE('bP', 'pB', peP), ST('b1', 'bP', 1, 80, 7, at(D0, 18, 4)),
    ];
    const idx = indexRows(rows);
    const open = openSessions(idx, { date: D0, day: UA, now: at(D0, 18, 10) });
    expect(open.map((s) => s.id)).toEqual(['pA', 'pB']);
    expect(setsInSessions(idx, open, peP).map((s) => s.id)).toEqual(['a1', 'b1']);
    expect(lastPerformance(idx, peP, { excludeSessionId: open.map((s) => s.id), onOrBefore: D0 }).sessionId).toBe('old');
  });
});

// Prove con il salvataggio vero sul telefono (IndexedDB finto) e la coda di invio.
let n = 0, store;
const U = 'user-1';
const ctx = (date, day = UA) => ({ userId: U, date, day, plan: { id: 'plan' }, clubId: 'c1' });
const kg = (w, reps) => ({ weight: w, unit: 'kg', reps, rir: 1 });
const sessionsOf = (local) => local.list().filter((r) => r.table === 'sessions').map((r) => r.data);
const setsOfAll = (local) => local.list().filter((r) => r.table === 'sets').map((r) => r.data);
beforeEach(async () => { store = await openStore('nuova-' + (++n)); });

function fakeApi() {
  const db = { sessions: new Map(), session_exercises: new Map(), sets: new Map() };
  const api = {
    db, mode: 'ok',
    async upsert(table, rows) {
      if (api.mode === 'offline') return { error: { code: '', message: 'TypeError: Failed to fetch', offline: true } };
      for (const r of rows) db[table].set(r.id, { ...(db[table].get(r.id) || {}), ...r });
      return {};
    },
    async setNumbers(seId) { return [...db.sets.values()].filter((s) => s.session_exercise_id === seId && !s.deleted_at).map((s) => s.set_number); },
  };
  return api;
}

describe('salvare: seduta nuova senza cancellare la vecchia', () => {
  it('stesso giorno del piano la settimana dopo: seduta nuova, serie 1; la vecchia resta identica', async () => {
    const local = await new Local(store, U).load();
    const a = await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));
    await saveSet(local, ctx(D0), peP, kg(80, 9), at(D0, 18, 4));
    const before = JSON.stringify(setsOfAll(local));
    const b = await saveSet(local, ctx(D7), peP, kg(82.5, 6), at(D7, 18));
    expect(b.set_number).toBe(1);
    expect(b.session_exercise_id).not.toBe(a.session_exercise_id);
    const ss = sessionsOf(local);
    expect(ss.map((s) => s.session_date).sort()).toEqual([D0, D7]);
    expect(ss.every((s) => !s.deleted_at)).toBe(true);
    expect(JSON.stringify(setsOfAll(local).filter((s) => s.id !== b.id))).toBe(before); // serie vecchie intatte
    const idx = indexRows(local.list());
    const open = openSessions(idx, { date: D7, day: UA, now: at(D7, 18, 1) });
    expect(lastPerformance(idx, peP, { excludeSessionId: open.map((s) => s.id), onOrBefore: D7 }).sets.map((s) => s.kg)).toEqual([80, 80]);
  });

  it('due aperture lo stesso giorno (app chiusa e riaperta): stessa seduta, serie 2', async () => {
    const first = await new Local(store, U).load();
    const a = await saveSet(first, ctx(D0), peP, kg(80, 10), at(D0, 18));
    const again = await new Local(store, U).load();   // come riaprire l'app
    const b = await saveSet(again, ctx(D0), peP, kg(80, 9), at(D0, 20));
    expect(b.session_exercise_id).toBe(a.session_exercise_id);
    expect(b.set_number).toBe(2);
    expect(sessionsOf(again).length).toBe(1);
  });

  it('seduta lasciata a metà: il giorno dopo si parte da una seduta nuova; le serie fatte restano', async () => {
    const local = await new Local(store, U).load();
    const a = await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));   // 1 serie su 2, poi niente
    const D1 = addDays(D0, 1);
    const b = await saveSet(local, ctx(D1), peP, kg(80, 10), at(D1, 18));
    expect(b.set_number).toBe(1);
    expect(sessionsOf(local).length).toBe(2);
    expect(local.rows.get(a.id).data.deleted_at).toBeNull();
  });

  it('a mezzanotte la seduta continua: serie 2 nella stessa seduta', async () => {
    const local = await new Local(store, U).load();
    const a = await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 23, 50));
    const D1 = addDays(D0, 1);
    const b = await saveSet(local, ctx(D1), peP, kg(80, 9), at(D1, 0, 15));
    expect(b.session_exercise_id).toBe(a.session_exercise_id);
    expect(b.set_number).toBe(2);
    expect(sessionsOf(local).length).toBe(1);
  });

  it('offline per due settimane: tutto resta in coda, poi arriva online senza cancellare niente', async () => {
    const api = fakeApi();
    api.mode = 'offline';
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));
    await flush(local, api);
    const again = await new Local(store, U).load();   // riaperta senza rete la settimana dopo
    const idx = indexRows(again.list());
    expect(openSessions(idx, { date: D7, day: UA, now: at(D7, 18) })).toEqual([]);
    expect(lastPerformance(idx, peP, { onOrBefore: D7 }).date).toBe(D0);
    await saveSet(again, ctx(D7), peP, kg(82.5, 6), at(D7, 18));
    expect(again.dirtyRows().length).toBe(6);
    api.mode = 'ok';
    const r = await flush(again, api);
    expect(r.offline).toBeFalsy();
    expect(again.dirtyRows().length).toBe(0);
    expect([...api.db.sessions.values()].map((s) => s.session_date).sort()).toEqual([D0, D7]);
    expect([...api.db.sets.values()].map((s) => [s.weight_kg, s.set_number, s.deleted_at])).toEqual([[80, 1, null], [82.5, 1, null]]);
  });

  it('due telefoni con la stessa seduta: la serie successiva continua la numerazione', async () => {
    const api = fakeApi();
    const phoneA = await new Local(await openStore('telA-' + n), U).load();
    const phoneB = await new Local(await openStore('telB-' + n), U).load();
    await saveSet(phoneA, ctx(D0), peP, kg(80, 10), at(D0, 18));
    await saveSet(phoneB, ctx(D0), peP, kg(80, 9), at(D0, 18, 3));
    await flush(phoneA, api); await flush(phoneB, api);
    const server = [];
    for (const t of ['sessions', 'session_exercises', 'sets']) for (const d of api.db[t].values()) server.push({ table: t, data: d });
    await phoneA.mergeServer(server);
    const c = await saveSet(phoneA, ctx(D0), peP, kg(80, 8), at(D0, 18, 6));
    expect(c.set_number).toBe(2);
    expect(sessionsOf(phoneA).length).toBe(2);   // nessuna seduta cancellata o unita a forza
  });
});
