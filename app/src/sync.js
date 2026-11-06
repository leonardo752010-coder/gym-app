// Invio della coda a Supabase.
//
// * Ordine: prima le sedute, poi gli esercizi della seduta, poi le serie (i genitori prima dei figli).
// * Ogni riga si invia con "upsert" sull'id creato dal telefono: inviarla due volte (per esempio se
//   la risposta si è persa) aggiorna la stessa riga, non ne crea un'altra.
// * Se manca la rete ci si ferma e si riprova più tardi: la coda resta sul telefono.
// * Se Supabase rifiuta una riga, l'errore resta scritto sulla riga, la riga resta in coda e le altre
//   proseguono.
import { TABLES, payload } from './store.js';

const CHUNK = 200;

export function isOffline(error) {
  if (!error) return false;
  if (error.offline) return true;
  const msg = String(error.message || error);
  return !error.code && /fetch|network|load failed|timeout|abort|offline|ECONN|ENOTFOUND|socket/i.test(msg);
}

let running = null, again = false;

/**
 * Invia la coda. Una sola esecuzione per volta. Chi chiama durante un invio (per esempio perché la rete
 * è appena tornata mentre una richiesta era appesa) ottiene un secondo giro subito dopo il primo.
 */
export function flush(local, api) {
  if (running) { again = true; return running; }
  running = (async () => {
    let r = await doFlush(local, api);
    while (again) { again = false; r = await doFlush(local, api); }
    return r;
  })().finally(() => { running = null; });
  return running;
}

async function doFlush(local, api) {
  const res = { sent: 0, failed: 0, offline: false, renumbered: 0 };
  const dirty = local.dirtyRows();
  if (!dirty.length) return res;
  for (const table of TABLES) {
    const rows = dirty.filter((r) => r.table === table);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const sent = part.map((r) => ({ id: r.id, rev: r.rev }));
      const r = await api.upsert(table, part.map(payload));
      if (!r.error) { await local.markSent(sent); res.sent += part.length; continue; }
      if (isOffline(r.error)) { res.offline = true; return res; }
      // Una riga rifiutata non deve bloccare le altre: si riprova una riga per volta.
      for (const row of part) {
        const one = await api.upsert(table, [payload(row)]);
        if (!one.error) { await local.markSent([{ id: row.id, rev: row.rev }]); res.sent++; continue; }
        if (isOffline(one.error)) { res.offline = true; return res; }
        if (table === 'sets' && one.error.code === '23505') {
          // Esiste già (da un altro telefono) una serie con lo stesso numero: questa diventa la successiva.
          const fixed = await renumber(local, api, row);
          if (fixed) { res.sent++; res.renumbered++; continue; }
        }
        await local.markError(row.id, row.rev, (one.error.code || '') + ' ' + (one.error.message || ''));
        res.failed++;
      }
    }
  }
  return res;
}

async function renumber(local, api, row) {
  const nums = await api.setNumbers(row.data.session_exercise_id);
  if (!nums) return false;
  const localNums = local.list()
    .filter((r) => r.table === 'sets' && r.id !== row.id && !r.data.deleted_at && r.data.session_exercise_id === row.data.session_exercise_id)
    .map((r) => r.data.set_number);
  const n = Math.max(0, ...nums, ...localNums) + 1;
  const [nw] = await local.write([{ table: 'sets', data: { id: row.id, set_number: n } }]);
  const again = await api.upsert('sets', [payload(nw)]);
  if (again.error) return false;
  await local.markSent([{ id: nw.id, rev: nw.rev }]);
  return true;
}
