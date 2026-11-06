// CHOOSE YOUR STARTER: scelta sul telefono, invio senza doppioni, copia vecchia, offline, due telefoni.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, setKv } from '../../src/store.js';
import { STARTERS, loadStarter, needsStarter, chooseStarter, mergeServerStarter, flushStarter } from '../../src/starter.js';

const U = 'user-1';
let n = 0, store;
beforeEach(async () => { store = await openStore('starter-' + (++n)); });

/** Finto Supabase: un solo profilo, l'update scrive solo se lo starter è ancora vuoto (come api.setStarter). */
function fakeServer(value = null) {
  const srv = { value, mode: 'ok', calls: [] };
  srv.api = {
    async setStarter(uid, v) {
      srv.calls.push(['set', v]);
      if (srv.mode === 'offline') return { error: { code: '', message: 'TypeError: Failed to fetch', offline: true } };
      if (srv.mode === 'reject') return { error: { code: '23514', message: 'check violation' } };
      const wrote = srv.value == null;
      if (wrote) srv.value = v;
      if (srv.mode === 'lose') { srv.mode = 'ok'; return { error: { code: '', message: 'TypeError: Load failed', offline: true } }; }
      return { data: wrote ? [{ starter: v }] : [] };
    },
    async getStarter() {
      srv.calls.push(['get']);
      if (srv.mode === 'offline') return { error: { code: '', message: 'TypeError: Failed to fetch', offline: true } };
      return { data: srv.value };
    },
  };
  return srv;
}

describe('quando compare la schermata', () => {
  it('telefono che non ha mai parlato con il server: niente schermata', async () => {
    const rec = await loadStarter(store, U);
    expect(rec).toMatchObject({ known: false, value: null, pending: false });
    expect(needsStarter(rec)).toBe(false);
  });

  it('copia vecchia sul telefono (piano salvato prima di questa versione, senza starter): niente schermata', async () => {
    await setKv(store, 'snap:' + U, { profile: { locale: 'it', weight_unit: 'kg', time_zone: 'Pacific/Auckland' }, plan: { days: [] } });
    expect(needsStarter(await loadStarter(store, U))).toBe(false);
  });

  it('il server dice "vuoto": schermata sì', async () => {
    const rec = await mergeServerStarter(store, U, null);
    expect(needsStarter(rec)).toBe(true);
  });

  it('il server ha già uno starter: niente schermata, e il telefono lo ricorda', async () => {
    const rec = await mergeServerStarter(store, U, 'lion');
    expect(needsStarter(rec)).toBe(false);
    expect((await loadStarter(store, U)).value).toBe('lion');
  });

  it('valore sconosciuto dal server conta come vuoto', async () => {
    expect(needsStarter(await mergeServerStarter(store, U, 'panda'))).toBe(true);
  });

  it('azzerato a mano nel database: la schermata ricompare al prossimo aggiornamento', async () => {
    await mergeServerStarter(store, U, 'tiger');
    expect(needsStarter(await loadStarter(store, U))).toBe(false);
    expect(needsStarter(await mergeServerStarter(store, U, null))).toBe(true);
  });
});

describe('scelta una sola volta', () => {
  it('accetta solo gorilla, lion, tiger', async () => {
    expect(STARTERS).toEqual(['gorilla', 'lion', 'tiger']);
    await expect(chooseStarter(store, U, 'panda')).rejects.toThrow('starter-invalid');
    await expect(chooseStarter(store, U, '')).rejects.toThrow('starter-invalid');
  });

  it('la scelta si salva subito sul telefono e resta dopo la riapertura', async () => {
    await mergeServerStarter(store, U, null);
    const rec = await chooseStarter(store, U, 'gorilla');
    expect(rec).toMatchObject({ known: true, value: 'gorilla', pending: true });
    expect(needsStarter(rec)).toBe(false);
    const again = await loadStarter(store, U);
    expect(again).toMatchObject({ value: 'gorilla', pending: true });
  });

  it('una seconda scelta dall\'app non cambia la prima', async () => {
    await mergeServerStarter(store, U, null);
    await chooseStarter(store, U, 'lion');
    const rec = await chooseStarter(store, U, 'tiger');
    expect(rec.value).toBe('lion');
  });
});

describe('invio al server', () => {
  it('senza rete: la scelta resta sul telefono; con la rete: un solo invio, poi niente più', async () => {
    const srv = fakeServer(null);
    await mergeServerStarter(store, U, null);
    await chooseStarter(store, U, 'tiger');
    srv.mode = 'offline';
    const r1 = await flushStarter(store, U, srv.api);
    expect(r1.offline).toBe(true);
    expect(srv.value).toBeNull();
    expect((await loadStarter(store, U)).pending).toBe(true);
    // Mentre è offline, un aggiornamento con il server vuoto non toglie la scelta.
    expect(await mergeServerStarter(store, U, null)).toMatchObject({ value: 'tiger', pending: true });
    srv.mode = 'ok';
    const r2 = await flushStarter(store, U, srv.api);
    expect(r2.sent).toBe(true);
    expect(srv.value).toBe('tiger');
    expect(await loadStarter(store, U)).toMatchObject({ value: 'tiger', pending: false, known: true });
    const before = srv.calls.length;
    expect((await flushStarter(store, U, srv.api)).sent).toBe(false);
    expect(srv.calls.length).toBe(before);
  });

  it('risposta persa dopo che il server ha già scritto: il reinvio non scrive di nuovo', async () => {
    const srv = fakeServer(null);
    await mergeServerStarter(store, U, null);
    await chooseStarter(store, U, 'lion');
    srv.mode = 'lose';
    expect((await flushStarter(store, U, srv.api)).offline).toBe(true);
    expect(srv.value).toBe('lion');
    expect((await loadStarter(store, U)).pending).toBe(true);
    const r = await flushStarter(store, U, srv.api);
    expect(r).toMatchObject({ sent: true, adopted: null });
    expect(srv.value).toBe('lion');
    expect((await loadStarter(store, U)).pending).toBe(false);
  });

  it('due telefoni offline scelgono cose diverse: vince il primo che arriva, l\'altro lo prende', async () => {
    const srv = fakeServer(null);
    const storeB = await openStore('starter-b-' + n);
    await mergeServerStarter(store, U, null);
    await mergeServerStarter(storeB, U, null);
    await chooseStarter(store, U, 'lion');      // telefono A
    await chooseStarter(storeB, U, 'gorilla');  // telefono B
    expect((await flushStarter(storeB, U, srv.api)).sent).toBe(true);
    const rA = await flushStarter(store, U, srv.api);
    expect(rA).toMatchObject({ sent: true, adopted: 'gorilla' });
    expect(srv.value).toBe('gorilla');
    expect(await loadStarter(store, U)).toMatchObject({ value: 'gorilla', pending: false });
  });

  it('scelta in sospeso ma il server è già pieno (altro telefono): vince il server', async () => {
    await mergeServerStarter(store, U, null);
    await chooseStarter(store, U, 'lion');
    expect(await mergeServerStarter(store, U, 'tiger')).toMatchObject({ value: 'tiger', pending: false });
  });

  it('rifiuto del server (non di rete): la scelta resta in coda con l\'errore scritto', async () => {
    const srv = fakeServer(null);
    await mergeServerStarter(store, U, null);
    await chooseStarter(store, U, 'gorilla');
    srv.mode = 'reject';
    expect((await flushStarter(store, U, srv.api)).failed).toBe(true);
    const rec = await loadStarter(store, U);
    expect(rec.pending).toBe(true);
    expect(rec.error).toMatch(/23514/);
    srv.mode = 'ok';
    expect((await flushStarter(store, U, srv.api)).sent).toBe(true);
    expect((await loadStarter(store, U)).error).toBeNull();
  });
});
