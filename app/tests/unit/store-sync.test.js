import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, Local, payload } from '../../src/store.js';
import { flush } from '../../src/sync.js';
import { saveSet, updateSet, deleteSet } from '../../src/session.js';
import { indexRows, findSession, setsOf, findSessionExercise } from '../../src/logic.js';

let n = 0;
const U = 'user-1';
const day = { id: 'd1', name: 'Upper A' };
const pe = { id: 'pe1', exercise_id: 'ex1', sets: 2, reps_min: 6, reps_max: 10, rir_min: 1, rir_max: 2, rest_seconds: null, machine: { id: 'm1' } };
const ctx = () => ({ userId: U, date: '2026-11-06', day, plan: { id: 'p1' }, clubId: 'c1' });

/** Finto Supabase: tabelle in memoria con le stesse regole che contano qui (upsert su id, una serie N per esercizio). */
function fakeApi() {
  const db = { sessions: new Map(), session_exercises: new Map(), sets: new Map() };
  const api = {
    db, calls: [], mode: 'ok',
    async upsert(table, rows) {
      api.calls.push({ table, ids: rows.map((r) => r.id) });
      if (api.mode === 'offline') return { error: { code: '', message: 'TypeError: Failed to fetch', offline: true } };
      // Come Postgres: righe applicate in ordine, tutto o niente.
      const copy = new Map(db[table]);
      for (const r of rows) {
        if (table === 'sets') {
          if (r.reps < 0) return { error: { code: '23514', message: 'check violation' } };
          const clash = [...copy.values()].find((x) => x.id !== r.id && !x.deleted_at && !r.deleted_at &&
            x.session_exercise_id === r.session_exercise_id && x.set_number === r.set_number);
          if (clash) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "sets_one_per_number"' } };
        }
        copy.set(r.id, { ...(copy.get(r.id) || {}), ...r });
      }
      db[table] = copy;
      if (api.mode === 'lose-response') { api.mode = 'ok'; return { error: { code: '', message: 'TypeError: Load failed', offline: true } }; }
      return {};
    },
    async setNumbers(seId) { return [...db.sets.values()].filter((s) => s.session_exercise_id === seId && !s.deleted_at).map((s) => s.set_number); },
  };
  return api;
}

let store;
beforeEach(async () => { store = await openStore('test-' + (++n)); });

describe('salvare sul telefono', () => {
  it('una serie crea seduta, esercizio e serie, tutti in coda, e restano dopo la riapertura', async () => {
    const local = await new Local(store, U).load();
    const s = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    expect(local.dirtyRows().map((r) => r.table)).toEqual(['sessions', 'session_exercises', 'sets']);
    const again = await new Local(store, U).load();
    expect(again.rows.get(s.id).data).toMatchObject({ weight_kg: 80, reps: 8, rir: 1, set_number: 1, input_unit: 'kg' });
    expect(again.dirtyRows().length).toBe(3);
  });

  it('la seconda serie usa la stessa seduta e lo stesso esercizio, numero 2', async () => {
    const local = await new Local(store, U).load();
    const a = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    const b = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 7, rir: 0 });
    expect(b.session_exercise_id).toBe(a.session_exercise_id);
    expect(b.set_number).toBe(2);
    expect(local.list().filter((r) => r.table === 'sessions').length).toBe(1);
  });

  it('libbre: peso in kg e peso scritto conservati', async () => {
    const local = await new Local(store, U).load();
    const s = await saveSet(local, ctx(), pe, { weight: 100, unit: 'lb', reps: 8, rir: 1 });
    expect(s.weight_kg).toBeCloseTo(45.359, 3);
    expect([s.input_weight, s.input_unit]).toEqual([100, 'lb']);
  });

  it('gli utenti non si mescolano sullo stesso telefono', async () => {
    const a = await new Local(store, U).load();
    await saveSet(a, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    const b = await new Local(store, 'user-2').load();
    expect(b.list().length).toBe(0);
  });
});

describe('sincronizzare senza perdere e senza doppioni', () => {
  it('offline: niente si perde; appena c\'è rete parte tutto, nell\'ordine giusto', async () => {
    const api = fakeApi(); api.mode = 'offline';
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 7, rir: 0 });
    const r1 = await flush(local, api);
    expect(r1.offline).toBe(true);
    expect(local.dirtyRows().length).toBe(4);
    api.mode = 'ok';
    const r2 = await flush(local, api);
    expect(r2).toMatchObject({ sent: 4, offline: false, failed: 0 });
    expect(api.calls.slice(-3).map((c) => c.table)).toEqual(['sessions', 'session_exercises', 'sets']);
    expect(local.dirtyRows().length).toBe(0);
    expect(api.db.sets.size).toBe(2);
  });

  it('risposta persa: la riga si reinvia ma online resta una sola', async () => {
    const api = fakeApi(); api.mode = 'lose-response';
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await flush(local, api);                      // il server ha salvato, il telefono non lo sa
    expect(local.dirtyRows().length).toBeGreaterThan(0);
    await flush(local, api);
    expect(local.dirtyRows().length).toBe(0);
    expect(api.db.sessions.size).toBe(1);
    expect(api.db.sets.size).toBe(1);
  });

  it('modifica e cancellazione: stessa riga online, cancellazione morbida', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    const s = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await flush(local, api);
    await updateSet(local, s.id, { weight: 82.5, unit: 'kg', reps: 6, rir: 0 });
    await flush(local, api);
    expect(api.db.sets.size).toBe(1);
    expect(api.db.sets.get(s.id)).toMatchObject({ weight_kg: 82.5, reps: 6, rir: 0, set_number: 1 });
    await deleteSet(local, s.id);
    await flush(local, api);
    expect(api.db.sets.get(s.id).deleted_at).toBeTruthy();
    const idx = indexRows(local.list());
    const sess = findSession(idx, { date: '2026-11-06', day });
    expect(setsOf(idx, findSessionExercise(idx, sess.id, pe).id)).toEqual([]);
  });

  it('una modifica fatta mentre si invia non viene persa', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    const s = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    const orig = api.upsert;
    api.upsert = async (t, rows) => { const r = await orig(t, rows); if (t === 'sets') await updateSet(local, s.id, { weight: 90, unit: 'kg', reps: 5, rir: 0 }); return r; };
    await flush(local, api);
    expect(local.rows.get(s.id).dirty).toBe(1);   // la versione nuova è ancora da inviare
    api.upsert = orig;
    await flush(local, api);
    expect(api.db.sets.get(s.id).weight_kg).toBe(90);
  });

  it('cancello la serie 2 e ne registro un\'altra: nessun conflitto online', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    const b = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 7, rir: 1 });
    await flush(local, api);
    await deleteSet(local, b.id);
    const c = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 6, rir: 1 });
    expect(c.set_number).toBe(2);
    const r = await flush(local, api);
    expect(r).toMatchObject({ failed: 0, offline: false, renumbered: 0 });
    expect([...api.db.sets.values()].filter((x) => !x.deleted_at).length).toBe(2);
  });

  it('stesso numero di serie già online (altro telefono): la serie diventa la successiva, nessuna persa', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    const a = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await flush(local, api);
    api.db.sets.set('other', { id: 'other', session_exercise_id: a.session_exercise_id, set_number: 2, reps: 5, deleted_at: null });
    const b = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 7, rir: 1 });
    expect(b.set_number).toBe(2);
    const r = await flush(local, api);
    expect(r).toMatchObject({ renumbered: 1, failed: 0 });
    expect(api.db.sets.get(b.id).set_number).toBe(3);
    expect(local.dirtyRows().length).toBe(0);
  });

  it('una riga rifiutata resta in coda con l\'errore e non blocca le altre', async () => {
    const api = fakeApi();
    const local = await new Local(store, U).load();
    const bad = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await local.write([{ table: 'sets', data: { id: bad.id, reps: -1 } }]);
    const good = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 9, rir: 1 });
    const r = await flush(local, api);
    expect(r.failed).toBe(1);
    expect(api.db.sets.has(good.id)).toBe(true);
    expect(local.rows.get(bad.id)).toMatchObject({ dirty: 1 });
    expect(local.rows.get(bad.id).error).toMatch(/23514/);
  });

  it('i dati del server non sovrascrivono le modifiche locali non ancora inviate', async () => {
    const local = await new Local(store, U).load();
    const s = await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await local.mergeServer([{ table: 'sets', data: { ...payload(local.rows.get(s.id)), weight_kg: 1 } }]);
    expect(local.rows.get(s.id).data.weight_kg).toBe(80);
  });

  it('uscita dall\'account rifiutata se ci sono serie non inviate', async () => {
    const local = await new Local(store, U).load();
    await saveSet(local, ctx(), pe, { weight: 80, unit: 'kg', reps: 8, rir: 1 });
    await expect(local.clear()).rejects.toThrow('rows-not-synced');
  });
});
