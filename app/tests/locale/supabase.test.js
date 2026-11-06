// Prove sul database LOCALE (Docker) con supabase-js vero, regole di accesso vere e dati finti.
// Serve: npx supabase start (nella cartella del progetto). Non tocca mai il progetto online.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { localStatus } from '../../scripts/locale.mjs';
import { adminClient, createFakeAthlete, deleteFakeAthlete, randomPassword } from '../../scripts/finti-lib.mjs';
import { makeApi, HISTORY_DAYS } from '../../src/api.js';
import { openStore, Local } from '../../src/store.js';
import { flush } from '../../src/sync.js';
import { saveSet, updateSet, deleteSet } from '../../src/session.js';
import { localDate, addDays, indexRows, lastPerformance, suggest, findSession } from '../../src/logic.js';

const S = localStatus();
const admin = adminClient(S);
const today = localDate();
const tag = Date.now().toString(36);
let A, B, passA, passB;

/** Rete finta che si può spegnere, o che "perde" la risposta dopo che il server ha già salvato. */
function net() {
  const n = { mode: 'on' };
  n.fetch = async (url, opts) => {
    if (n.mode === 'off') throw new TypeError('Failed to fetch');
    const res = await fetch(url, opts);
    if (n.mode === 'lose' && /\/rest\/v1\//.test(String(url)) && opts && opts.method === 'POST') { n.mode = 'on'; throw new TypeError('Load failed'); }
    return res;
  };
  return n;
}
function memStorage() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; }

async function device(email, password, n = net()) {
  const api = makeApi({ url: S.url, key: S.anon, fetch: n.fetch, storage: memStorage() });
  const r = await api.signIn(email, password);
  if (r.error) throw new Error(r.error.message);
  const store = await openStore('dev-' + Math.random());
  const local = await new Local(store, r.user.id).load();
  return { api, net: n, local, user: r.user };
}
async function pull(d) {
  const snap = await d.api.snapshot(d.user.id);
  const hist = await d.api.history(d.user.id, addDays(today, -HISTORY_DAYS));
  expect(snap.error).toBeUndefined();
  expect(hist.error).toBeUndefined();
  await d.local.mergeServer(hist.data, addDays(today, -HISTORY_DAYS));
  return snap.data;
}
const count = async (table, userId, extra = (q) => q) => {
  const { count: c, error } = await extra(admin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId));
  if (error) throw error; return c;
};
const pe = (snap, dayName, i) => snap.plan.days.find((d) => d.name === dayName).exercises[i];
const ctxFor = (d, snap, dayName) => ({ userId: d.user.id, date: today, day: snap.plan.days.find((x) => x.name === dayName), plan: snap.plan, clubId: snap.homeClubId });

beforeAll(async () => {
  passA = randomPassword(); passB = randomPassword();
  A = await createFakeAthlete(admin, { email: `prova.a.${tag}@example.test`, password: passA, today });
  B = await createFakeAthlete(admin, { email: `prova.b.${tag}@example.test`, password: passB, today, history: false });
}, 60000);
afterAll(async () => {
  if (A) await deleteFakeAthlete(admin, A.userId);
  if (B) await deleteFakeAthlete(admin, B.userId);
});

describe('accesso', () => {
  it('password sbagliata: rifiutata; giusta: dentro', async () => {
    const api = makeApi({ url: S.url, key: S.anon, storage: memStorage() });
    const bad = await api.signIn(A.email, 'sbagliata-' + tag);
    expect(bad.error).toBeTruthy();
    const ok = await api.signIn(A.email, passA);
    expect(ok.user.id).toBe(A.userId);
  });
  it('senza accesso non si legge niente', async () => {
    const api = makeApi({ url: S.url, key: S.anon, storage: memStorage() });
    const r = await api.history(A.userId, '2000-01-01');
    expect(r.error || r.data.length === 0).toBeTruthy();
  });
  it('iscrizioni nuove chiuse anche in locale', async () => {
    const api = makeApi({ url: S.url, key: S.anon, storage: memStorage() });
    const { error } = await api.sb.auth.signUp({ email: `nuovo.${tag}@example.test`, password: randomPassword() });
    expect(error).toBeTruthy();
  });
  it('un atleta non vede i dati dell\'altro', async () => {
    const b = await device(B.email, passB);
    const r = await b.api.history(A.userId, '2000-01-01');
    expect(r.data.length).toBe(0);
    const snap = await b.api.snapshot(A.userId);
    expect(snap.data.plan).toBeNull();
  });
});

describe('piano e volta scorsa', () => {
  let d, snap, idx;
  beforeAll(async () => { d = await device(A.email, passA); snap = await pull(d); idx = indexRows(d.local.list()); });

  it('piano attivo con giorni, esercizi, macchine della palestra principale', () => {
    expect(snap.plan.days.map((x) => x.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    const p = pe(snap, 'Upper A', 2);
    expect(p.machine.weight_list).toEqual([5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5]);
    expect(p.exercise.name.it).toBe('Alzate laterali');
    expect(pe(snap, 'Upper B', 0)).toMatchObject({ superset_label: 'A', superset_rest: 90 });
    expect(pe(snap, 'Lower A', 3).machine).toBeNull();
    expect(snap.homeClubId).toBe(A.club);
  });

  it('panca: ultima seduta, serie cancellata esclusa, range chiuso → +2,5 kg', () => {
    const p = pe(snap, 'Upper A', 0);
    const last = lastPerformance(idx, p, { onOrBefore: today });
    expect(last.date).toBe(addDays(today, -2));
    expect(last.sets.map((s) => [s.kg, s.reps])).toEqual([[80, 10], [80, 10]]);
    expect(suggest(p, last, 'kg').sets[0]).toEqual({ n: 1, weight: 82.5, reps: 6, why: 'up' });
  });

  it('alzate nel giorno Upper B: la volta scorsa è quella di Upper A (stesso esercizio e macchina)', () => {
    const last = lastPerformance(idx, pe(snap, 'Upper B', 0), { onOrBefore: today });
    expect(last.date).toBe(addDays(today, -2));
    expect(last.sets.map((s) => [s.kg, s.reps])).toEqual([[15, 14], [15, 12]]);
  });

  it('leg extension su due macchine: ognuna ha la sua volta scorsa (anche da seduta importata)', () => {
    expect(lastPerformance(idx, pe(snap, 'Lower A', 1)).sets[0]).toMatchObject({ kg: 65, reps: 12 });
    const b = lastPerformance(idx, pe(snap, 'Lower A', 2));
    expect(b.date).toBe(addDays(today, -7));
    expect(b.sets[0]).toMatchObject({ kg: 40, reps: 12 });
  });

  it('lat: range non chiuso → stesso peso, una rep in più', () => {
    const s = suggest(pe(snap, 'Upper B', 1), lastPerformance(idx, pe(snap, 'Upper B', 1)), 'kg');
    expect(s.sets.map((x) => [x.weight, x.reps])).toEqual([[60, 10], [60, 9]]);
  });
});

describe('registrare offline e sincronizzare senza doppioni', () => {
  it('offline: 2 serie sul telefono; con la rete: 1 seduta, 1 esercizio, 2 serie online', async () => {
    const d = await device(A.email, passA);
    const snap = await pull(d);
    d.net.mode = 'off';
    const p = pe(snap, 'Upper B', 2);
    await saveSet(d.local, ctxFor(d, snap, 'Upper B'), p, { weight: 82.5, unit: 'kg', reps: 7, rir: 2 });
    await saveSet(d.local, ctxFor(d, snap, 'Upper B'), p, { weight: 82.5, unit: 'kg', reps: 6, rir: 2 });
    expect((await flush(d.local, d.api)).offline).toBe(true);
    expect(await count('sessions', A.userId, (q) => q.eq('session_date', today))).toBe(0);
    d.net.mode = 'on';
    expect(await flush(d.local, d.api)).toMatchObject({ sent: 4, failed: 0, offline: false });
    expect(await count('sessions', A.userId, (q) => q.eq('session_date', today))).toBe(1);
    const { data } = await admin.from('sets').select('set_number, weight_kg, reps, rir, input_unit').eq('user_id', A.userId).gte('performed_at', new Date(Date.now() - 60000).toISOString()).order('set_number');
    expect(data.map((x) => [x.set_number, Number(x.weight_kg), x.reps, Number(x.rir), x.input_unit])).toEqual([[1, 82.5, 7, 2, 'kg'], [2, 82.5, 6, 2, 'kg']]);
    expect(d.local.dirtyRows().length).toBe(0);
  });

  it('risposta persa e reinvio: online resta una riga sola', async () => {
    const d = await device(A.email, passA);
    const snap = await pull(d);
    const before = await count('sets', A.userId);
    const s = await saveSet(d.local, ctxFor(d, snap, 'Upper B'), pe(snap, 'Upper B', 1), { weight: 60, unit: 'kg', reps: 10, rir: 1 });
    d.net.mode = 'lose';
    const r1 = await flush(d.local, d.api);
    expect(r1.offline).toBe(true);
    expect(d.local.dirtyRows().length).toBeGreaterThan(0);
    await flush(d.local, d.api);
    await flush(d.local, d.api);
    expect(d.local.dirtyRows().length).toBe(0);
    expect(await count('sets', A.userId)).toBe(before + 1);
    expect(await count('sets', A.userId, (q) => q.eq('id', s.id))).toBe(1);
    expect(await count('sessions', A.userId, (q) => q.eq('session_date', today))).toBe(1);
  });

  it('modifica e cancellazione: stessa riga aggiornata, cancellazione morbida', async () => {
    const d = await device(A.email, passA);
    const snap = await pull(d);
    const s = await saveSet(d.local, ctxFor(d, snap, 'Upper B'), pe(snap, 'Upper B', 0), { weight: 15, unit: 'kg', reps: 15, rir: 0 });
    await flush(d.local, d.api);
    await updateSet(d.local, s.id, { weight: 100, unit: 'lb', reps: 13, rir: 1 });
    await flush(d.local, d.api);
    let { data } = await admin.from('sets').select('*').eq('id', s.id);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ reps: 13, input_unit: 'lb', set_number: 1 });
    expect(Number(data[0].weight_kg)).toBeCloseTo(45.359, 3);
    await deleteSet(d.local, s.id);
    await flush(d.local, d.api);
    ({ data } = await admin.from('sets').select('deleted_at').eq('id', s.id));
    expect(data[0].deleted_at).toBeTruthy();
  });

  it('due telefoni, stesso numero di serie: nessuna persa, la seconda diventa la successiva', async () => {
    const d1 = await device(A.email, passA), d2 = await device(A.email, passA);
    const snap = await pull(d1); await pull(d2);
    const p = pe(snap, 'Upper B', 1);
    const s1 = await saveSet(d1.local, ctxFor(d1, snap, 'Upper B'), p, { weight: 60, unit: 'kg', reps: 9, rir: 1 });
    const s2 = await saveSet(d2.local, ctxFor(d2, snap, 'Upper B'), p, { weight: 60, unit: 'kg', reps: 8, rir: 1 });
    expect(s1.set_number).toBe(s2.set_number);
    expect((await flush(d1.local, d1.api)).failed).toBe(0);
    const r2 = await flush(d2.local, d2.api);
    expect(r2).toMatchObject({ failed: 0, renumbered: 1 });
    const { data } = await admin.from('sets').select('id, set_number').in('id', [s1.id, s2.id]).order('set_number');
    expect(data.map((x) => x.id)).toEqual([s1.id, s2.id]);
    expect(data[1].set_number).toBe(s1.set_number + 1);
  });

  it('un altro telefono scarica la seduta di oggi con le serie giuste', async () => {
    const d = await device(A.email, passA);
    const snap = await pull(d);
    const idx = indexRows(d.local.list());
    const sess = findSession(idx, { date: today, day: snap.plan.days[2] });
    expect(sess).toBeTruthy();
    const serverSets = await count('sets', A.userId, (q) => q.is('deleted_at', null).gte('performed_at', new Date(Date.now() - 3600000).toISOString()));
    const localSets = d.local.list().filter((r) => r.table === 'sets' && !r.data.deleted_at && r.data.performed_at >= new Date(Date.now() - 3600000).toISOString());
    expect(localSets.length).toBe(serverSets);
  });
});
