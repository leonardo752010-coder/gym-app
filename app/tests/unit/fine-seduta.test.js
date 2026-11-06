// Tasto "Fine seduta": scrive ended_at, non cancella niente; "Riapri" lo toglie; offline va in coda.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, Local } from '../../src/store.js';
import { flush } from '../../src/sync.js';
import { saveSet, closeSession, reopenSession } from '../../src/session.js';
import { indexRows, openSessions, reopenable, lastPerformance, defaultDay, addDays } from '../../src/logic.js';

const at = (date, hh, mm = 0) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, hh, mm); };
const D0 = '2026-11-06', D1 = addDays(D0, 1);
const UA = { id: 'dUA', name: 'Upper A' }, LA = { id: 'dLA', name: 'Lower A' };
const peP = { id: 'pP', exercise_id: 'panca', sets: 2, reps_min: 6, reps_max: 10, machine: null };
UA.exercises = [peP]; LA.exercises = [];
const PLAN = { id: 'plan', days: [UA, LA] };
const U = 'user-1';
const ctx = (date) => ({ userId: U, date, day: UA, plan: { id: 'plan' }, clubId: 'c1' });
const kg = (w, reps) => ({ weight: w, unit: 'kg', reps, rir: 1 });

/** Finto Supabase con upsert sull'id (come la coda vera) e registro delle chiamate. */
function fakeApi() {
  const db = { sessions: new Map(), session_exercises: new Map(), sets: new Map() };
  const api = {
    db, calls: [], mode: 'ok',
    async upsert(table, rows) {
      api.calls.push({ table, rows: rows.map((r) => ({ ...r })) });
      if (api.mode === 'offline') return { error: { code: '', message: 'TypeError: Failed to fetch', offline: true } };
      for (const r of rows) {
        if (table === 'sessions' && r.ended_at && r.started_at && r.ended_at < r.started_at) return { error: { code: '23514', message: 'sessions_times' } };
        if (table === 'session_exercises' && !db.sessions.has(r.session_id)) return { error: { code: '23503', message: 'fk session' } };
        db[table].set(r.id, { ...(db[table].get(r.id) || {}), ...r });
      }
      return {};
    },
    async setNumbers() { return []; },
    rows() { const out = []; for (const t of ['sessions', 'session_exercises', 'sets']) for (const d of db[t].values()) out.push({ table: t, data: { ...d } }); return out; },
  };
  return api;
}

let n = 0, store;
beforeEach(async () => { store = await openStore('fine-' + (++n)); });
const open = (local, date = D0, now = at(D0, 19)) => openSessions(indexRows(local.list()), { date, day: UA, now });

describe('Fine seduta', () => {
  it('chiusura online: ended_at scritto e inviato; le serie restano e diventano la "volta scorsa"', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    const s1 = await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));
    await saveSet(local, ctx(D0), peP, kg(80, 9), at(D0, 18, 4));
    await flush(local, api);
    const closed = await closeSession(local, open(local), at(D0, 18, 30));
    expect(closed.length).toBe(1);
    expect(closed[0].ended_at).toBe(at(D0, 18, 30).toISOString());
    expect(open(local)).toEqual([]);
    expect(local.dirtyRows().map((r) => r.table)).toEqual(['sessions']);
    await flush(local, api);
    expect(local.dirtyRows().length).toBe(0);
    expect([...api.db.sessions.values()].map((s) => s.ended_at)).toEqual([at(D0, 18, 30).toISOString()]);
    expect([...api.db.sets.values()].every((s) => s.deleted_at === null)).toBe(true);
    expect(local.rows.get(s1.id).data.deleted_at).toBeNull();
    const idx = indexRows(local.list());
    expect(lastPerformance(idx, peP, { excludeSessionId: [], onOrBefore: D0 }).sets.map((s) => s.reps)).toEqual([10, 9]);
  });

  it('chiusura offline: entra nella coda, resta dopo la riapertura dell\'app e arriva ore dopo senza doppioni', async () => {
    const api = fakeApi();
    api.mode = 'offline';
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));   // seduta mai arrivata online
    await closeSession(local, open(local), at(D0, 18, 40));
    expect((await flush(local, api)).offline).toBe(true);
    const later = await new Local(store, U).load();   // app riaperta senza rete
    expect(open(later)).toEqual([]);
    expect(later.dirtyRows().length).toBe(3);
    api.mode = 'ok';
    await flush(later, api);
    // la seduta parte UNA volta, già chiusa, e prima dei suoi esercizi e serie
    const ok = api.calls.filter((c) => api.calls.indexOf(c) > 0);
    expect(ok.map((c) => c.table)).toEqual(['sessions', 'session_exercises', 'sets']);
    expect(ok[0].rows[0].ended_at).toBe(at(D0, 18, 40).toISOString());
    expect(api.db.sessions.size).toBe(1);
    expect(later.dirtyRows().length).toBe(0);
  });

  it('riapri: la seduta torna in corso, con le sue serie; online ended_at torna vuoto', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));
    const [c] = await closeSession(local, open(local), at(D0, 18, 30));
    expect(reopenable(indexRows(local.list()), { date: D0, day: UA, now: at(D0, 18, 31) }).id).toBe(c.id);
    await flush(local, api);
    const r = await reopenSession(local, c.id);
    expect(r.ended_at).toBeNull();
    expect(open(local).map((s) => s.id)).toEqual([c.id]);
    expect(reopenable(indexRows(local.list()), { date: D0, day: UA, now: at(D0, 18, 32) })).toBeNull();
    const b = await saveSet(local, ctx(D0), peP, kg(80, 9), at(D0, 18, 35));
    expect(b.set_number).toBe(2);
    await flush(local, api);
    expect(api.db.sessions.get(c.id).ended_at).toBeNull();
    expect(await reopenSession(local, c.id)).toBeNull();   // già aperta: niente da fare
  });

  it('doppia chiusura: la seconda non scrive niente; due telefoni che chiudono: una sola seduta, chiusa', async () => {
    const api = fakeApi();
    const a = await new Local(store, U).load();
    await saveSet(a, ctx(D0), peP, kg(80, 10), at(D0, 18));
    await flush(a, api);
    const b = await new Local(await openStore('altro-' + n), U).load();
    await b.mergeServer(api.rows());
    const sa = open(a), sb = open(b);
    expect((await closeSession(a, sa, at(D0, 19))).length).toBe(1);
    const rev = a.rows.get(sa[0].id).rev;
    expect(await closeSession(a, sa, at(D0, 19, 5))).toEqual([]);
    expect(a.rows.get(sa[0].id).rev).toBe(rev);
    expect(a.rows.get(sa[0].id).data.ended_at).toBe(at(D0, 19).toISOString());
    await closeSession(b, sb, at(D0, 19, 2));
    await flush(a, api); await flush(b, api);
    expect(api.db.sessions.size).toBe(1);
    expect(api.db.sessions.get(sa[0].id).ended_at).toBeTruthy();
    expect(a.dirtyRows().length + b.dirtyRows().length).toBe(0);
  });

  it('chiusa su un altro telefono: questo la vede chiusa alla sincronizzazione', async () => {
    const api = fakeApi();
    const a = await new Local(store, U).load();
    await saveSet(a, ctx(D0), peP, kg(80, 10), at(D0, 18));
    await flush(a, api);
    const b = await new Local(await openStore('altro2-' + n), U).load();
    await b.mergeServer(api.rows());
    await closeSession(b, open(b), at(D0, 19));
    await flush(b, api);
    expect(open(a).length).toBe(1);          // prima di scaricare: ancora aperta
    await a.mergeServer(api.rows());          // sincronizzazione
    expect(open(a)).toEqual([]);
    expect(reopenable(indexRows(a.list()), { date: D0, day: UA, now: at(D0, 19, 1) })).toBeTruthy();
  });

  it('senza serie non c\'è seduta: Fine seduta non ha niente da chiudere e non scrive niente', async () => {
    const local = await new Local(store, U).load();
    expect(open(local)).toEqual([]);
    expect(await closeSession(local, open(local), at(D0, 19))).toEqual([]);
    expect(local.dirtyRows().length).toBe(0);
    expect(reopenable(indexRows(local.list()), { date: D0, day: UA, now: at(D0, 19) })).toBeNull();
  });

  it('serie dopo la chiusura, stesso giorno del piano: seduta nuova (serie 1); la chiusa resta com\'è e non si riapre più', async () => {
    const local = await new Local(store, U).load();
    const a = await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));
    const [c] = await closeSession(local, open(local), at(D0, 18, 30));
    const b = await saveSet(local, ctx(D0), peP, kg(82.5, 6), at(D0, 20));
    expect(b.set_number).toBe(1);
    expect(b.session_exercise_id).not.toBe(a.session_exercise_id);
    const ses = local.list().filter((r) => r.table === 'sessions').map((r) => r.data);
    expect(ses.length).toBe(2);
    expect(local.rows.get(c.id).data.ended_at).toBe(at(D0, 18, 30).toISOString());
    expect(local.rows.get(a.id).data.deleted_at).toBeNull();
    const idx = indexRows(local.list());
    expect(reopenable(idx, { date: D0, day: UA, now: at(D0, 20, 1) })).toBeNull();
    const cur = openSessions(idx, { date: D0, day: UA, now: at(D0, 20, 1) });
    expect(lastPerformance(idx, peP, { excludeSessionId: cur.map((s) => s.id), onOrBefore: D0 }).sessionId).toBe(c.id);
  });

  it('dopo la chiusura il piano propone il giorno successivo', async () => {
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18));
    expect(defaultDay(PLAN, indexRows(local.list()), D0, at(D0, 18, 5)).id).toBe('dUA');
    await closeSession(local, open(local), at(D0, 18, 30));
    expect(defaultDay(PLAN, indexRows(local.list()), D0, at(D0, 18, 31)).id).toBe('dLA');
  });

  it('ora di chiusura mai prima dell\'ultima serie (orologi diversi tra telefoni)', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 18, 10));
    const [c] = await closeSession(local, open(local), at(D0, 18, 0));   // orologio indietro di 10 minuti
    expect(c.ended_at).toBe(at(D0, 18, 10).toISOString());
    expect((await flush(local, api)).failed).toBe(0);
  });

  it('chiusa e riaperta dopo mezzanotte: si riapre solo entro la regola delle ore (come la seduta in corso)', async () => {
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(D0), peP, kg(80, 10), at(D0, 23, 40));
    const [c] = await closeSession(local, open(local, D0, at(D0, 23, 45)), at(D0, 23, 45));
    const idx = indexRows(local.list());
    expect(reopenable(idx, { date: D1, day: UA, now: at(D1, 0, 30) }).id).toBe(c.id);
    expect(reopenable(idx, { date: D1, day: UA, now: at(D1, 4, 0) })).toBeNull();
    await reopenSession(local, c.id);
    expect(open(local, D1, at(D1, 0, 31)).map((s) => s.id)).toEqual([c.id]);
  });
});
