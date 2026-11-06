// CHOOSE YOUR STARTER: la scelta dello starter (gorilla, lion, tiger), una sola volta.
//
// Sul telefono (IndexedDB, chiave "starter:<id utente>") c'è un piccolo record:
//   { known, value, pending }
//   * known   = il server ha risposto almeno una volta (o la scelta è stata fatta dopo una sua risposta).
//               Senza questo la schermata NON compare: una copia vecchia del telefono, o un telefono che
//               non ha mai parlato con il server, non deve chiedere la scelta.
//   * value   = starter scelto, oppure null (non ancora scelto).
//   * pending = scelta fatta sul telefono e non ancora confermata dal server.
//
// Il blocco "una sola volta" è solo nell'app: nel database non c'è nessuna regola.
// Nessun doppione: c'è una sola riga di profilo per utente e l'invio scrive solo se lì è ancora vuoto
// ("starter is null"). Se la scelta è già stata fatta da un altro telefono, vince quella del server.
// Rimettere a mano null nel database fa ricomparire la schermata al prossimo aggiornamento.
import { getKv, setKv } from './store.js';
import { isOffline } from './sync.js';

export const STARTERS = ['gorilla', 'lion', 'tiger'];
export const isStarter = (v) => STARTERS.includes(v);

const key = (userId) => 'starter:' + userId;
const EMPTY = Object.freeze({ known: false, value: null, pending: false, error: null });

export async function loadStarter(db, userId) {
  const r = await getKv(db, key(userId));
  return r && typeof r === 'object' ? { ...EMPTY, ...r } : { ...EMPTY };
}

async function put(db, userId, rec) {
  const r = { ...EMPTY, ...rec };
  await setKv(db, key(userId), r);
  return r;
}

/** La schermata si mostra solo se il server ha detto "vuoto" e sul telefono non c'è una scelta. */
export function needsStarter(rec) {
  return !!(rec && rec.known && !rec.value && !rec.pending);
}

/** Scelta fatta ora sul telefono: salvata subito (anche senza rete), poi inviata. Una sola volta. */
export async function chooseStarter(db, userId, value) {
  if (!isStarter(value)) throw new Error('starter-invalid');
  const cur = await loadStarter(db, userId);
  if (cur.value) return cur;                       // già scelto: non si cambia dall'app
  return put(db, userId, { known: true, value, pending: true });
}

/**
 * Valore letto dal server (richiesta separata da quella del piano).
 * - Scelta in sospeso sul telefono e server vuoto: resta in sospeso (si invierà).
 * - Scelta in sospeso e server già pieno: vince il server (scelta fatta prima su un altro telefono).
 * - Niente in sospeso: il telefono prende il valore del server (anche null, se è stato azzerato a mano).
 */
export async function mergeServerStarter(db, userId, serverValue) {
  const sv = isStarter(serverValue) ? serverValue : null;
  const cur = await loadStarter(db, userId);
  if (cur.pending && !sv) return cur.known ? cur : put(db, userId, { ...cur, known: true });
  return put(db, userId, { known: true, value: sv, pending: false });
}

let running = null;

/** Invia la scelta in sospeso. Una sola esecuzione per volta; ripeterla non crea niente di nuovo. */
export function flushStarter(db, userId, api) {
  if (running) return running;
  running = doFlush(db, userId, api).finally(() => { running = null; });
  return running;
}

async function doFlush(db, userId, api) {
  const cur = await loadStarter(db, userId);
  if (!cur.pending || !cur.value) return { sent: false };
  const r = await api.setStarter(userId, cur.value);
  if (r.error) {
    if (isOffline(r.error)) return { sent: false, offline: true };
    await put(db, userId, { ...cur, error: String((r.error.code || '') + ' ' + (r.error.message || '')).trim().slice(0, 300) });
    return { sent: false, failed: true };
  }
  if (r.data && r.data.length) {
    // Scritto ora. Si toglie il segno solo se nel frattempo non è cambiato niente.
    const now = await loadStarter(db, userId);
    if (now.pending && now.value === cur.value) await put(db, userId, { known: true, value: cur.value, pending: false });
    return { sent: true };
  }
  // Nessuna riga scritta: sul server c'è già uno starter (altro telefono, o risposta persa al primo invio).
  const g = await api.getStarter(userId);
  if (g.error) return { sent: false, offline: isOffline(g.error) };
  if (isStarter(g.data)) {
    await put(db, userId, { known: true, value: g.data, pending: false });
    return { sent: true, adopted: g.data !== cur.value ? g.data : null };
  }
  await put(db, userId, { ...cur, error: 'profile-not-updated' });
  return { sent: false, failed: true };
}
