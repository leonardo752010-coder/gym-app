// Prove sul database LOCALE (Docker) con supabase-js vero, regole di accesso vere e dati finti.
// Serve: npx supabase start (nella cartella del progetto). Non tocca mai il progetto online.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { localStatus } from '../../scripts/locale.mjs';
import { adminClient, createFakeAthlete, deleteFakeAthlete, randomPassword } from '../../scripts/finti-lib.mjs';
import { makeApi, HISTORY_DAYS } from '../../src/api.js';
import { openStore, Local } from '../../src/store.js';
import { flush } from '../../src/sync.js';
import { saveSet, updateSet, deleteSet, closeSession, reopenSession } from '../../src/session.js';
import { localDate, addDays, indexRows, lastPerformance, suggest, findSession, openSessions } from '../../src/logic.js';
import { historyList } from '../../src/pages.js';
import { validatePlanEdit, applyPlanEdit, findPlanExercise, moveInDay, orderForDay, planMoveRows, applyPlanMove } from '../../src/modifica.js';
import { loadStarter, needsStarter, chooseStarter, mergeServerStarter, flushStarter } from '../../src/starter.js';

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
    if (n.mode === 'losePatch' && /\/rest\/v1\//.test(String(url)) && opts && opts.method === 'PATCH') { n.mode = 'on'; throw new TypeError('Load failed'); }
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

  it('panca: ultima seduta, serie cancellata esclusa, top (RIR 0) al massimo → +2,5 kg; serie dopo a RIR 2 con 10 rep → sale anche lei', () => {
    const p = pe(snap, 'Upper A', 0);
    const last = lastPerformance(idx, p, { onOrBefore: today });
    expect(last.date).toBe(addDays(today, -2));
    expect(last.sets.map((s) => [s.kg, s.reps, s.rir])).toEqual([[80, 10, 0], [80, 10, 2]]);
    expect(suggest(p, last, 'kg').sets).toEqual([{ n: 1, weight: 82.5, reps: 6, why: 'up' }, { n: 2, weight: 82.5, reps: 6, why: 'up' }]);
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

describe('Fine seduta sul database locale (regole di accesso vere)', () => {
  const openOf = (d, snap, dayName) => openSessions(indexRows(d.local.list()), { date: today, day: snap.plan.days.find((x) => x.name === dayName), now: new Date() });

  it('l\'atleta chiude la sua seduta (anche offline) e la riapre: ended_at scritto e tolto, serie intatte', async () => {
    const d = await device(A.email, passA);
    const snap = await pull(d);
    const s = await saveSet(d.local, ctxFor(d, snap, 'Lower B'), pe(snap, 'Lower B', 0), { weight: 45, unit: 'kg', reps: 12, rir: 0 });
    d.net.mode = 'off';
    const [c] = await closeSession(d.local, openOf(d, snap, 'Lower B'));
    expect((await flush(d.local, d.api)).offline).toBe(true);
    d.net.mode = 'on';
    expect((await flush(d.local, d.api)).failed).toBe(0);
    let { data } = await admin.from('sessions').select('id, ended_at').eq('id', c.id);
    expect(data.length).toBe(1);
    expect(data[0].ended_at).toBeTruthy();
    expect((await admin.from('sets').select('deleted_at').eq('id', s.id)).data[0].deleted_at).toBeNull();
    await reopenSession(d.local, c.id);
    expect((await flush(d.local, d.api)).failed).toBe(0);
    ({ data } = await admin.from('sessions').select('ended_at').eq('id', c.id));
    expect(data[0].ended_at).toBeNull();
  });

  it('un altro atleta non può chiudere la seduta di A', async () => {
    const { data: ses } = await admin.from('sessions').select('*').eq('user_id', A.userId).eq('session_date', today).is('ended_at', null).limit(1);
    expect(ses.length).toBe(1);
    const b = await device(B.email, passB);
    const upd = await b.api.sb.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', ses[0].id).select('id');
    expect(upd.data || []).toEqual([]);   // la riga di A per B non esiste
    const ups = await b.api.upsert('sessions', [{ ...ses[0], ended_at: new Date().toISOString(), created_at: undefined, updated_at: undefined }]);
    expect(ups.error).toBeTruthy();
    const { data } = await admin.from('sessions').select('ended_at').eq('id', ses[0].id);
    expect(data[0].ended_at).toBeNull();
  });

  it('il database rifiuta una fine prima dell\'inizio (per questo l\'app non la scrive mai)', async () => {
    const d = await device(A.email, passA);
    const { data: ses } = await admin.from('sessions').select('id, started_at').eq('user_id', A.userId).not('started_at', 'is', null).limit(1);
    const r = await d.api.sb.from('sessions').update({ ended_at: new Date(Date.parse(ses[0].started_at) - 60000).toISOString() }).eq('id', ses[0].id);
    expect(r.error && r.error.code).toBe('23514');
  });
});

describe('CHOOSE YOUR STARTER sul database locale (regole di accesso vere)', () => {
  const starterOf = async (id) => (await admin.from('profiles').select('starter').eq('id', id).single()).data.starter;
  const profileRows = async (id) => (await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', id)).count;

  it('atleta nuovo: starter vuoto; il telefono mostra la schermata solo dopo la risposta del server', async () => {
    const d = await device(A.email, passA);
    expect(needsStarter(await loadStarter(d.local.db, A.userId))).toBe(false);   // prima della risposta: no
    const g = await d.api.getStarter(A.userId);
    expect(g).toEqual({ data: null });
    expect(needsStarter(await mergeServerStarter(d.local.db, A.userId, g.data))).toBe(true);
  });

  it('il database accetta solo gorilla, lion, tiger', async () => {
    const d = await device(B.email, passB);
    const r = await d.api.sb.from('profiles').update({ starter: 'panda' }).eq('id', B.userId);
    expect(r.error && r.error.code).toBe('23514');
    expect(await starterOf(B.userId)).toBeNull();
  });

  it('offline: scelta sul telefono; con la rete: scritta una volta, una sola riga di profilo', async () => {
    const d = await device(A.email, passA);
    const db = d.local.db;
    await mergeServerStarter(db, A.userId, (await d.api.getStarter(A.userId)).data);
    await chooseStarter(db, A.userId, 'lion');
    d.net.mode = 'off';
    expect((await flushStarter(db, A.userId, d.api)).offline).toBe(true);
    expect(await starterOf(A.userId)).toBeNull();
    d.net.mode = 'on';
    expect((await flushStarter(db, A.userId, d.api)).sent).toBe(true);
    expect(await starterOf(A.userId)).toBe('lion');
    expect(await profileRows(A.userId)).toBe(1);
    expect(await loadStarter(db, A.userId)).toMatchObject({ value: 'lion', pending: false });
  });

  it('a starter già scelto, un altro invio (altro telefono) non lo cambia', async () => {
    const d2 = await device(A.email, passA);
    const w = await d2.api.setStarter(A.userId, 'tiger');
    expect(w.error).toBeUndefined();
    expect(w.data).toEqual([]);
    await mergeServerStarter(d2.local.db, A.userId, null);
    await chooseStarter(d2.local.db, A.userId, 'tiger');
    expect(await flushStarter(d2.local.db, A.userId, d2.api)).toMatchObject({ sent: true, adopted: 'lion' });
    expect(await starterOf(A.userId)).toBe('lion');
  });

  it('un altro atleta non può scrivere né leggere lo starter di A', async () => {
    await admin.from('profiles').update({ starter: null }).eq('id', A.userId);
    const b = await device(B.email, passB);
    const r = await b.api.setStarter(A.userId, 'gorilla');
    expect(r.data || []).toEqual([]);
    expect(await starterOf(A.userId)).toBeNull();
    const g = await b.api.getStarter(A.userId);
    expect(g.error && g.error.code).toBe('no-profile');   // per B il profilo di A non esiste
  });

  it('risposta persa al primo invio: il reinvio non scrive di nuovo e il telefono si allinea', async () => {
    await admin.from('profiles').update({ starter: null }).eq('id', A.userId);
    const d = await device(A.email, passA);
    await mergeServerStarter(d.local.db, A.userId, null);
    await chooseStarter(d.local.db, A.userId, 'gorilla');
    d.net.mode = 'losePatch';
    expect((await flushStarter(d.local.db, A.userId, d.api)).offline).toBe(true);
    expect(await starterOf(A.userId)).toBe('gorilla');
    expect((await loadStarter(d.local.db, A.userId)).pending).toBe(true);
    expect(await flushStarter(d.local.db, A.userId, d.api)).toMatchObject({ sent: true, adopted: null });
    expect(await loadStarter(d.local.db, A.userId)).toMatchObject({ value: 'gorilla', pending: false });
  });

  it('azzerato a mano nel database (null): al prossimo aggiornamento la schermata ricompare', async () => {
    const d = await device(A.email, passA);
    await mergeServerStarter(d.local.db, A.userId, 'gorilla');
    await admin.from('profiles').update({ starter: null }).eq('id', A.userId);
    const g = await d.api.getStarter(A.userId);
    expect(needsStarter(await mergeServerStarter(d.local.db, A.userId, g.data))).toBe(true);
  });

  it('la lettura di piano e profilo (snapshot) non dipende dallo starter', async () => {
    const d = await device(A.email, passA);
    const snap = await d.api.snapshot(A.userId);
    expect(snap.error).toBeUndefined();
    expect(snap.data.profile).not.toHaveProperty('starter');
  });
});

describe('nomi dello storico dalla libreria esercizi (database locale)', () => {
  // Scarica piano e storico come fa l'app e rifà la lista di Progressi con i nomi della libreria.
  const progress = async () => {
    const d = await device(A.email, passA);
    const snap = await d.api.snapshot(A.userId);
    const hist = await d.api.history(A.userId, addDays(today, -HISTORY_DAYS));
    expect(snap.error).toBeUndefined();
    expect(hist.error).toBeUndefined();
    await d.local.mergeServer(hist.data, addDays(today, -HISTORY_DAYS));
    return { snap: snap.data, names: hist.exerciseNames, list: historyList(indexRows(d.local.list()), snap.data.plan, hist.exerciseNames) };
  };
  const curlOf = (list) => list.flatMap((s) => s.exercises.filter((e) => e.exerciseId === A.E.curl).map((e) => ({ date: s.date, name: e.name })));

  it('lo storico scarica i nomi della libreria; le righe non cambiano forma', async () => {
    const { names } = await progress();
    expect(names[A.E.curl]).toEqual({ it: 'Leg curl seduto', en: 'Seated leg curl' });
    const r = await (await device(A.email, passA)).api.history(A.userId, addDays(today, -HISTORY_DAYS));
    expect(r.data.find((x) => x.table === 'session_exercises').data).not.toHaveProperty('exercise');
  });

  it('a) esercizio archiviato nel piano: le sue sedute vecchie mostrano il nome vero', async () => {
    const before = curlOf((await progress()).list);
    expect(before.length).toBeGreaterThan(0);
    await admin.from('plan_exercises').update({ archived_at: new Date().toISOString() }).eq('id', A.pe.lb_curl).throwOnError();
    const { snap, list } = await progress();
    expect(snap.plan.days.flatMap((d) => d.exercises).some((p) => p.exercise_id === A.E.curl)).toBe(false);   // fuori dal piano
    const after = curlOf(list);
    expect(after).toEqual(before);
    expect(after.every((e) => e.name && e.name.it === 'Leg curl seduto')).toBe(true);
    // senza i nomi della libreria (com'era prima) sarebbe "—"
    const d = await device(A.email, passA); await pull(d);
    expect(curlOf(historyList(indexRows(d.local.list()), snap.plan)).every((e) => e.name === null)).toBe(true);
  });

  it('b) esercizio spostato in un altro giorno: storico invariato', async () => {
    const before = (await progress()).list;
    await admin.from('plan_exercises').update({ plan_day_id: A.days.UA, position: 4 }).eq('id', A.pe.lb_hack).throwOnError();
    const { snap, list } = await progress();
    expect(snap.plan.days.find((d) => d.name === 'Upper A').exercises.some((p) => p.id === A.pe.lb_hack)).toBe(true);
    expect(list).toEqual(before);
  });
});

describe('macchine dello storico dalla libreria macchine (database locale)', () => {
  const progress = async () => {
    const d = await device(A.email, passA);
    const snap = await d.api.snapshot(A.userId);
    const hist = await d.api.history(A.userId, addDays(today, -HISTORY_DAYS));
    expect(snap.error).toBeUndefined();
    expect(hist.error).toBeUndefined();
    await d.local.mergeServer(hist.data, addDays(today, -HISTORY_DAYS));
    const idx = indexRows(d.local.list());
    return { snap: snap.data, hist, idx, list: historyList(idx, snap.data.plan, hist.exerciseNames, hist.machineInfo), old: historyList(idx, snap.data.plan, hist.exerciseNames) };
  };
  const rowsOf = (list, exId) => list.flatMap((s) => s.exercises.filter((e) => e.exerciseId === exId).map((e) => ({ date: s.date, machineId: e.machineId, machine: e.machine })));
  const planMachines = (snap) => snap.plan.days.flatMap((d) => d.exercises).map((p) => p.machine && p.machine.id).filter(Boolean);

  it('lo storico scarica le macchine della libreria; le righe non cambiano forma', async () => {
    const { hist } = await progress();
    expect(hist.machineInfo[A.M.lat]).toMatchObject({ code: 'prova-app-m-lat', brand: 'Marca Finta', model: 'Lat Pulldown', brand_code: 'MF-20' });
    expect(hist.data.find((x) => x.table === 'session_exercises').data).not.toHaveProperty('machine');
  });

  it('a) macchina tolta dal piano: le vecchie sedute mostrano la macchina vera', async () => {
    const before = rowsOf((await progress()).list, A.E.lat);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((e) => e.machineId === A.M.lat && e.machine.brand_code === 'MF-20')).toBe(true);
    await admin.from('plan_exercise_machines').update({ machine_id: null }).in('plan_exercise_id', [A.pe.ua_lat, A.pe.ub_lat]).throwOnError();
    const { snap, list, old } = await progress();
    expect(planMachines(snap)).not.toContain(A.M.lat);   // la macchina non è più nel piano
    expect(rowsOf(list, A.E.lat)).toEqual(before);
    expect(rowsOf(old, A.E.lat).every((e) => e.machine === null)).toBe(true);   // com'era prima: "altra macchina"
  });

  it('b) macchina cambiata nella riga del piano: le vecchie sedute mostrano la macchina con cui sono state fatte', async () => {
    const before = rowsOf((await progress()).list, A.E.legext).filter((e) => e.machineId === A.M['legext-a']);
    expect(before.length).toBe(2);   // -7 (importata) e -1
    await admin.from('plan_exercise_machines').update({ machine_id: A.M['legext-b'] }).eq('plan_exercise_id', A.pe.la_legext_a).throwOnError();
    const { snap, list, old, idx } = await progress();
    expect(snap.plan.days.find((d) => d.name === 'Lower A').exercises.find((p) => p.id === A.pe.la_legext_a).machine.id).toBe(A.M['legext-b']);
    const after = rowsOf(list, A.E.legext).filter((e) => e.machineId === A.M['legext-a']);
    expect(after).toEqual(before);
    expect(after.every((e) => e.machine.model === 'Leg Extension' && e.machine.brand_code === 'MF-50')).toBe(true);
    expect(rowsOf(old, A.E.legext).filter((e) => e.machineId === A.M['legext-a']).every((e) => e.machine === null)).toBe(true);
    // come deciso: con la macchina nuova la "Volta scorsa" riparte (quella sulla macchina vecchia non conta)
    const last = lastPerformance(idx, snap.plan.days.find((d) => d.name === 'Lower A').exercises.find((p) => p.id === A.pe.la_legext_a), { onOrBefore: today });
    expect(last && last.machineId).toBe(A.M['legext-b']);
  });
});

describe('Programma → Modifica: serie, rep e RIR di un esercizio (database locale, regole di accesso vere)', () => {
  const peRows = async () => (await admin.from('plan_exercises').select('*').eq('user_id', A.userId).order('id')).data;
  const targets = async (peId) => (await admin.from('session_exercises')
    .select('id, target_sets, target_reps_min, target_reps_max, target_rir_min, target_rir_max, rest_seconds').eq('plan_exercise_id', peId).order('id')).data;
  const NEW = { sets: 3, sets_max: 4, reps_min: 8, reps_max: 12, rir_min: 1, rir_max: 2, rest_seconds: 120, notes: 'Nota cambiata dalla prova' };
  let before, oldTargets;

  beforeAll(async () => { before = await peRows(); oldTargets = await targets(A.pe.ua_panca); });

  it('a) modifica di serie, rep e RIR: il piano cambia, solo quella riga', async () => {
    const d = await device(A.email, passA);
    const old = (await d.api.snapshot(A.userId)).data.plan;
    expect(findPlanExercise(old, A.pe.ua_panca)).toMatchObject({ sets: 2, reps_min: 6, reps_max: 10, rir_min: 2, rir_max: 3 });
    const { values, errors } = validatePlanEdit({ sets: '3', sets_max: '4', reps_min: '8', reps_max: '12', rir_min: '1', rir_max: '2', rest_seconds: '120', notes: NEW.notes });
    expect(errors).toEqual([]);
    expect(values).toEqual(NEW);
    const r = await d.api.updatePlanExercise(A.pe.ua_panca, values);
    expect(r.error).toBeUndefined();
    // la copia sul telefono aggiornata con la risposta è uguale al piano scaricato di nuovo
    const local = findPlanExercise(applyPlanEdit(old, A.pe.ua_panca, r.data), A.pe.ua_panca);
    const fresh = findPlanExercise((await d.api.snapshot(A.userId)).data.plan, A.pe.ua_panca);
    expect(fresh).toMatchObject(NEW);
    expect(local).toEqual(fresh);
    // nel database cambia solo la riga di quell'esercizio
    const after = await peRows();
    expect(after.filter((x) => x.id !== A.pe.ua_panca)).toEqual(before.filter((x) => x.id !== A.pe.ua_panca));
    expect(after.find((x) => x.id === A.pe.ua_panca)).toMatchObject({ ...NEW, rir_min: 1, rir_max: 2, exercise_id: A.E.panca, plan_day_id: A.days.UA });
  });

  it('b) le sedute vecchie di quell\'esercizio hanno ancora il loro obiettivo originale', async () => {
    expect(oldTargets.length).toBeGreaterThan(0);
    expect(oldTargets.every((t) => t.target_sets === 2 && t.target_reps_min === 6 && t.target_reps_max === 10)).toBe(true);
    expect(await targets(A.pe.ua_panca)).toEqual(oldTargets);
  });

  it('c) valori non validi: rifiutati dall\'app prima di partire, e dal database se arrivassero', async () => {
    for (const bad of [{ reps_min: '12', reps_max: '8' }, { rir_min: '3', rir_max: '1' }, { sets: '3', sets_max: '2' }, { sets: '-1' }]) {
      expect(validatePlanEdit({ sets: '3', sets_max: '', reps_min: '8', reps_max: '12', rir_min: '1', rir_max: '2', rest_seconds: '', notes: '', ...bad }).errors.length).toBeGreaterThan(0);
    }
    const d = await device(A.email, passA);
    const now = await peRows();
    for (const bad of [{ reps_min: 12, reps_max: 8 }, { rir_min: 3, rir_max: 1 }, { sets: 3, sets_max: 2 }, { sets: -1 }]) {
      const r = await d.api.updatePlanExercise(A.pe.ua_panca, { ...NEW, ...bad });
      expect(r.error && r.error.code, JSON.stringify(bad)).toBe('23514');
    }
    expect(await peRows()).toEqual(now);
  });

  it('d) un atleta non può modificare il piano di un altro atleta', async () => {
    const b = await device(B.email, passB);
    const now = await peRows();
    const r = await b.api.updatePlanExercise(A.pe.ua_panca, { ...NEW, sets: 9 });
    expect(r.error && r.error.code).toBe('not-allowed');
    expect(await peRows()).toEqual(now);
  });
});

describe('Programma → Modifica: spostare un esercizio (giorno, Su / Giù) sul database locale', () => {
  const allRows = async () => (await admin.from('plan_exercises').select('*').eq('user_id', A.userId).order('id')).data;
  const dayPositions = (rows, dayId) => rows.filter((r) => r.plan_day_id === dayId).map((r) => r.position).sort((a, b) => a - b);
  const gapless = (rows) => Object.values(A.days).every((d) => { const p = dayPositions(rows, d); return p.every((x, i) => x === i + 1); });
  const NOVALS = (pe) => ({ sets: pe.sets, sets_max: pe.sets_max, reps_min: pe.reps_min, reps_max: pe.reps_max, rir_min: pe.rir_min, rir_max: pe.rir_max, rest_seconds: pe.rest_seconds, notes: pe.notes });
  // fa quello che fa l'app quando si tocca Salva dopo aver scelto giorno / Su / Giù
  const move = async (d, plan, peId, toDayId, order) => {
    const fromDay = plan.days.find((x) => x.exercises.some((p) => p.id === peId)).id;
    const r = await d.api.planDayRows([...new Set([fromDay, toDayId])]);
    expect(r.error).toBeUndefined();
    const mv = planMoveRows(r.data, peId, toDayId, order.map((x) => x.id), NOVALS(findPlanExercise(plan, peId)));
    expect(mv.error).toBeUndefined();
    return { rows: mv.rows, saved: await d.api.savePlanRows(mv.rows) };
  };
  const latHistory = async (d) => {
    const hist = await d.api.history(A.userId, addDays(today, -HISTORY_DAYS));
    await d.local.mergeServer(hist.data, addDays(today, -HISTORY_DAYS));
    const snap = (await d.api.snapshot(A.userId)).data;
    const list = historyList(indexRows(d.local.list()), snap.plan, hist.exerciseNames, hist.machineInfo);
    const ses = (await admin.from('session_exercises').select('*').eq('plan_exercise_id', A.pe.ua_lat).order('id')).data;
    return { lat: list.flatMap((s) => s.exercises.filter((e) => e.exerciseId === A.E.lat).map((e) => ({ date: s.date, day: s.dayName, name: e.name, machine: e.machine, sets: e.sets }))), ses };
  };

  it('a) e b) sposto un esercizio in un altro giorno: in fondo al giorno nuovo, giorno vecchio senza buchi, stesso id, storico identico', async () => {
    const d = await device(A.email, passA);
    const plan = (await d.api.snapshot(A.userId)).data.plan;
    const before = await latHistory(d);
    const la = plan.days.find((x) => x.name === 'Lower A');
    const { saved } = await move(d, plan, A.pe.ua_lat, A.days.LA, orderForDay(plan, A.pe.ua_lat, A.days.LA));
    expect(saved.error).toBeUndefined();
    const rows = await allRows();
    const lat = rows.find((r) => r.id === A.pe.ua_lat);
    expect(lat).toMatchObject({ id: A.pe.ua_lat, plan_day_id: A.days.LA, position: Math.max(...dayPositions(rows, A.days.LA)), exercise_id: A.E.lat });
    expect(dayPositions(rows, A.days.LA).length).toBe(la.exercises.length + 1);
    expect(gapless(rows)).toBe(true);
    // la copia sul telefono è uguale al piano scaricato di nuovo (giorni e ordine)
    const fresh = (await d.api.snapshot(A.userId)).data.plan;
    const local = applyPlanMove(plan, A.pe.ua_lat, saved.data);
    expect(local.days.map((x) => x.exercises.map((p) => p.id))).toEqual(fresh.days.map((x) => x.exercises.map((p) => p.id)));
    expect(fresh.days.find((x) => x.name === 'Lower A').exercises.at(-1).id).toBe(A.pe.ua_lat);
    // b) storico dell'esercizio spostato identico (lista di Progressi e righe delle sedute)
    const after = await latHistory(d);
    expect(after.lat.length).toBeGreaterThan(0);
    expect(after.ses.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  it('c) Su e Giù cambiano l’ordine senza errori sul vincolo (anche scavalcando una superserie)', async () => {
    const d = await device(A.email, passA);
    let plan = (await d.api.snapshot(A.userId)).data.plan;
    const ua = () => plan.days.find((x) => x.name === 'Upper A').exercises.map((p) => p.id);
    const startUA = ua();
    const second = startUA[1];
    let o = moveInDay(orderForDay(plan, second, A.days.UA), second, -1);   // il secondo sale al primo posto (scambio di posizioni)
    let r = await move(d, plan, second, A.days.UA, o);
    expect(r.saved.error).toBeUndefined();
    plan = (await d.api.snapshot(A.userId)).data.plan;
    expect(ua()).toEqual([second, startUA[0], ...startUA.slice(2)]);
    o = moveInDay(orderForDay(plan, second, A.days.UA), second, 1);        // e torna giù
    r = await move(d, plan, second, A.days.UA, o);
    expect(r.saved.error).toBeUndefined();
    plan = (await d.api.snapshot(A.userId)).data.plan;
    expect(ua()).toEqual(startUA);
    // Upper B: superserie (alzate + lat) poi panca; la panca sale e scavalca tutta la superserie
    expect(plan.days.find((x) => x.name === 'Upper B').exercises.map((p) => p.id)).toEqual([A.pe.ub_alzate, A.pe.ub_lat, A.pe.ub_panca]);
    o = moveInDay(orderForDay(plan, A.pe.ub_panca, A.days.UB), A.pe.ub_panca, -1);
    r = await move(d, plan, A.pe.ub_panca, A.days.UB, o);
    expect(r.saved.error).toBeUndefined();
    plan = (await d.api.snapshot(A.userId)).data.plan;
    expect(plan.days.find((x) => x.name === 'Upper B').exercises.map((p) => p.id)).toEqual([A.pe.ub_panca, A.pe.ub_alzate, A.pe.ub_lat]);
    expect(gapless(await allRows())).toBe(true);
  });

  it('se lo spostamento fallisce a metà, il piano torna com’era (una sola richiesta, tutto o niente)', async () => {
    const d = await device(A.email, passA);
    const plan = (await d.api.snapshot(A.userId)).data.plan;
    const now = await allRows();
    const r = await d.api.planDayRows([A.days.UA, A.days.LB]);
    const mv = planMoveRows(r.data, A.pe.ua_alzate, A.days.LB, orderForDay(plan, A.pe.ua_alzate, A.days.LB).map((x) => x.id), NOVALS(findPlanExercise(plan, A.pe.ua_alzate)));
    expect(mv.rows.length).toBeGreaterThan(1);
    const bad = mv.rows.map((x, i) => (i === mv.rows.length - 1 ? { ...x, reps_min: 20, reps_max: 5 } : x));   // l'ultima riga non va bene
    const s = await d.api.savePlanRows(bad);
    expect(s.error).toBeTruthy();
    expect(await allRows()).toEqual(now);
    // e un esercizio in superserie non può cambiare giorno
    const r2 = await d.api.planDayRows([A.days.UB, A.days.LB]);
    expect(planMoveRows(r2.data, A.pe.ub_lat, A.days.LB, [A.pe.ub_lat]).error).toBe('superset');
  });

  it('d) un altro atleta non può spostare gli esercizi del piano di A', async () => {
    const a = await device(A.email, passA);
    const plan = (await a.api.snapshot(A.userId)).data.plan;
    const r = await a.api.planDayRows([A.days.UA, A.days.LB]);
    const mv = planMoveRows(r.data, A.pe.ua_alzate, A.days.LB, [A.pe.ua_alzate], NOVALS(findPlanExercise(plan, A.pe.ua_alzate)));
    const now = await allRows();
    const b = await device(B.email, passB);
    expect((await b.api.planDayRows([A.days.UA, A.days.LB])).data).toEqual([]);   // B non vede le righe di A
    const s1 = await b.api.savePlanRows(mv.rows);                                     // righe di A così come sono
    expect(s1.error).toBeTruthy();
    const s2 = await b.api.savePlanRows(mv.rows.map((x) => ({ ...x, user_id: B.userId })));   // provando a prenderle
    expect(s2.error).toBeTruthy();
    expect(await allRows()).toEqual(now);
  });
});
