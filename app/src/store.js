// Salvataggio sul telefono (IndexedDB) e coda di sincronizzazione.
//
// Ogni seduta, esercizio della seduta e serie è una "riga" con l'id creato dal telefono.
// Una riga modificata qui diventa "dirty" (da inviare). Si toglie il segno solo quando
// Supabase ha confermato quella versione esatta (rev). Niente si cancella dalla coda prima.
import { openDB } from 'idb';

export const TABLES = ['sessions', 'session_exercises', 'sets'];

// Colonne che l'app scrive (tutto il resto lo decide il database).
export const COLUMNS = {
  sessions: ['id', 'user_id', 'session_date', 'started_at', 'ended_at', 'club_id', 'plan_id', 'plan_day_id', 'day_name', 'notes', 'deleted_at'],
  session_exercises: ['id', 'session_id', 'user_id', 'position', 'exercise_id', 'machine_id', 'plan_exercise_id', 'skipped',
    'target_sets', 'target_reps_min', 'target_reps_max', 'target_rir_min', 'target_rir_max', 'rest_seconds', 'notes', 'deleted_at'],
  sets: ['id', 'session_exercise_id', 'user_id', 'set_number', 'set_type', 'weight_kg', 'reps', 'rir', 'input_weight', 'input_unit',
    'performed_at', 'notes', 'deleted_at'],
};

export function openStore(name = 'gym-app') {
  return openDB(name, 1, {
    upgrade(db) {
      const rows = db.createObjectStore('rows', { keyPath: 'id' });
      rows.createIndex('user', 'userId');
      db.createObjectStore('kv');
    },
  });
}

export async function getKv(db, key) { return db.get('kv', key); }
export async function setKv(db, key, value) { return db.put('kv', value, key); }

/** Copia in memoria delle righe di un utente, con scrittura sicura su IndexedDB. */
export class Local {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId;
    this.rows = new Map();
    this.seq = 0;
    this.version = 0; // cambia a ogni modifica (per ridisegnare)
  }

  async load() {
    const all = await this.db.getAllFromIndex('rows', 'user', this.userId);
    this.rows = new Map(all.map((r) => [r.id, r]));
    this.seq = all.reduce((m, r) => Math.max(m, r.seq || 0), 0);
    this.version++;
    return this;
  }

  list() { return [...this.rows.values()]; }

  /**
   * Scrive delle modifiche fatte dall'utente. Ritorna solo quando sono su IndexedDB
   * (prima di questo l'app non dice "salvata").
   */
  async write(changes) {
    const now = [];
    for (const { table, data } of changes) {
      const old = this.rows.get(data.id);
      const row = {
        id: data.id, table, userId: this.userId,
        data: { ...(old ? old.data : {}), ...data },
        dirty: 1, rev: (old ? old.rev || 0 : 0) + 1, seq: ++this.seq, error: null,
      };
      now.push(row);
    }
    const tx = this.db.transaction('rows', 'readwrite');
    for (const r of now) tx.store.put(r);
    await tx.done;
    for (const r of now) this.rows.set(r.id, r);
    this.version++;
    return now;
  }

  dirtyRows() {
    return this.list().filter((r) => r.dirty).sort((a, b) => a.seq - b.seq);
  }

  /** Supabase ha confermato queste versioni: tolgo il segno solo se nel frattempo non sono cambiate. */
  async markSent(sent) {
    const tx = this.db.transaction('rows', 'readwrite');
    const done = [];
    for (const { id, rev } of sent) {
      const cur = this.rows.get(id);
      if (!cur || cur.rev !== rev) continue;
      const r = { ...cur, dirty: 0, error: null };
      tx.store.put(r);
      done.push(r);
    }
    await tx.done;
    for (const r of done) this.rows.set(r.id, r);
    this.version++;
  }

  async markError(id, rev, message) {
    const cur = this.rows.get(id);
    if (!cur || cur.rev !== rev) return;
    const r = { ...cur, error: String(message || 'error').slice(0, 300) };
    await this.db.put('rows', r);
    this.rows.set(id, r);
    this.version++;
  }

  /**
   * Righe arrivate da Supabase. Le righe locali ancora da inviare vincono sempre.
   * Se windowStart è dato, le righe pulite di quel periodo che il server non ha più vengono tolte.
   */
  async mergeServer(serverRows, windowStart = null) {
    const seen = new Set();
    const put = [];
    for (const { table, data } of serverRows) {
      seen.add(data.id);
      const cur = this.rows.get(data.id);
      if (cur && cur.dirty) continue;
      put.push({ id: data.id, table, userId: this.userId, data, dirty: 0, rev: cur ? cur.rev || 0 : 0, seq: cur ? cur.seq || 0 : 0, error: null });
    }
    const remove = [];
    if (windowStart) {
      const sessionDate = new Map();
      for (const r of this.rows.values()) if (r.table === 'sessions') sessionDate.set(r.id, r.data.session_date);
      const seSession = new Map();
      for (const r of this.rows.values()) if (r.table === 'session_exercises') seSession.set(r.id, r.data.session_id);
      const dateOf = (r) => r.table === 'sessions' ? r.data.session_date
        : r.table === 'session_exercises' ? sessionDate.get(r.data.session_id)
          : sessionDate.get(seSession.get(r.data.session_exercise_id));
      for (const r of this.rows.values()) {
        if (r.dirty || seen.has(r.id)) continue;
        const d = dateOf(r);
        if (d && d >= windowStart) remove.push(r.id);
      }
    }
    const tx = this.db.transaction('rows', 'readwrite');
    for (const r of put) tx.store.put(r);
    for (const id of remove) tx.store.delete(id);
    await tx.done;
    for (const r of put) this.rows.set(r.id, r);
    for (const id of remove) this.rows.delete(id);
    this.version++;
    return { put: put.length, removed: remove.length };
  }

  /** Solo per l'uscita dall'account: cancella le righe locali di questo utente (mai se ce ne sono da inviare). */
  async clear() {
    if (this.dirtyRows().length) throw new Error('rows-not-synced');
    const tx = this.db.transaction('rows', 'readwrite');
    for (const id of this.rows.keys()) tx.store.delete(id);
    await tx.done;
    this.rows.clear();
    this.version++;
  }
}

/** Riga pronta per Supabase: solo le colonne dell'app, sempre tutte (null se mancano). */
export function payload(row) {
  const out = {};
  for (const c of COLUMNS[row.table]) out[c] = row.data[c] === undefined ? null : row.data[c];
  return out;
}
