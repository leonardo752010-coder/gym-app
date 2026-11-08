// Schermata ALLENAMENTO (layout "Track"): solo logica pura per il disegno.
// Nessun DOM, nessuna rete, nessuna scrittura: legge i dati che main.js ha già (piano, serie fatte, bozza, suggerimento).
// Si prova con tests/unit/allenamento.test.js.

/**
 * Righe della tabella Set / Kg / Rep / RIR, nell'ordine in cui si vedono.
 * - 'done': serie già salvate (toccandole si modificano);
 * - 'cur': la serie da salvare adesso (caselle e tasti + / −), oppure quella in modifica;
 * - 'todo': serie del piano ancora da fare, con i valori del suggerimento (solo da leggere).
 * editId: id della serie in modifica (o null). showDraft: false quando le serie del piano sono finite e la serie extra non è aperta.
 */
export function tableRows({ done, plannedSets, draft = null, editId = null, showDraft = true, sugg = null }) {
  const rows = done.map((s) => ({ kind: s.id === editId ? 'cur' : 'done', n: s.set_number, set: s, edit: s.id === editId }));
  if (editId || !showDraft || !draft) return rows;
  rows.push({ kind: 'cur', n: draft.n, draft, edit: false, extra: draft.n > plannedSets });
  for (let n = draft.n + 1; n <= plannedSets; n++) {
    const sg = sugg && sugg.sets.length ? sugg.sets[Math.min(n, sugg.sets.length) - 1] : null;
    rows.push({ kind: 'todo', n, weight: sg ? sg.weight : null, reps: sg ? sg.reps : null });
  }
  return rows;
}

/** Tasti ‹ › tra gli esercizi: quali si possono usare. */
export function exNav(idx, count) {
  return { prev: idx > 0, next: idx < count - 1 };
}

/** Elenco dei giorni per la tendina "Upper A ▾": nome, serie fatte / serie del piano, giorno attuale. */
export function dayOptions(days, currentId, progress) {
  return days.map((d) => {
    const p = progress(d);
    return { id: d.id, name: d.name, done: p.done, total: p.total, count: d.exercises.length, on: d.id === currentId };
  });
}

/** Secondi come m:ss (il timer quando è fermo mostra il recupero dell'esercizio). */
export function clock(sec) {
  const a = Math.abs(Math.round(sec));
  return (sec < 0 ? '+' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
}

/** RIR come si mostra in tabella: 4 vuol dire "4 o più". */
export function rirLabel(r) {
  if (r == null || r === '') return '—';
  const n = Number(r);
  return n >= 4 ? '4+' : String(n).replace('.', ',');
}
