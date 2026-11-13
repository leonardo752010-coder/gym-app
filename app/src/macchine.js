// Disegno stilizzato della macchina nell'intestazione dell'esercizio (tab Allenamento / Workout).
// Solo logica pura: nessun DOM, nessuna rete, nessuna scrittura. Si prova con tests/unit/macchine.test.js.
//
// Il "tipo" della macchina non è un campo del database: si ricava dal modello (es. "Hack Squat",
// "Leg Press (OG, a dischi)", "Iso-Lateral High Row"), poi dal nome della macchina, poi dal nome
// dell'esercizio. Stesso tipo = stesso disegno, per tutte le marche. Nessun marchio nei disegni.
// Senza macchina, o con un tipo che non si riconosce: il manubrio generico.

/** Testo per il confronto: minuscole, senza accenti, trattini/parentesi/punti → spazio, spazi singoli. */
export function normKind(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// In ordine: le parole più precise prima ("leg press" prima di "press", "leg curl" prima di "curl").
const RULES = [
  ['hack-squat', /\bhack\b/],
  ['leg-press', /\bleg press\b|\bpressa\b/],
  ['leg-extension', /\bleg extensions?\b/],
  ['leg-curl', /\bleg curls?\b|\bhamstring/],
  ['calf', /\bcalf\b|\bcalves\b|\bpolpacci\b/],
  ['shoulder-press', /\bshoulder press\b|\boverhead press\b|\bmilitary press\b|\blento\b/],
  ['lateral-raise', /\blateral raises?\b|\balzate laterali\b/],
  ['fly', /\bfly\b|\bflyes?\b|\bpec deck\b|\bcroci\b|\bpectoral\b/],
  ['lat-pulldown', /\bpull ?down\b|\blat machine\b|\blat pull\b/],
  ['t-bar', /\bt ?bar\b/],
  ['row', /\brows?\b|\browing\b|\brematore\b/],
  ['deadlift', /\bdeadlift\b|\bshrugs?\b|\bstacco\b|\btrap bar\b/],
  ['smith', /\bsmith\b|\bmultipower\b/],
  ['arms', /\bcurl\b|\bbiceps\b|\bbicipiti\b|\btriceps\b|\btricipiti\b|\bdips?\b/],
  ['cable', /\bcables?\b|\bcavi\b|\bcavo\b|\bcrossover\b/],
  ['chest-press', /\bchest press\b|\bbench press\b|\bpress\b|\bpanca\b/],
];

/** Tipo di un testo (modello, nome…), o null se non si riconosce. */
export function kindOf(text) {
  const t = normKind(text);
  if (!t) return null;
  for (const [kind, re] of RULES) if (re.test(t)) return kind;
  return null;
}

const names = (n) => (!n ? [] : typeof n === 'string' ? [n] : Object.values(n));

/**
 * Tipo della macchina dell'esercizio: modello → nome della macchina → nome/codice dell'esercizio → 'generic'.
 * Senza macchina assegnata: sempre 'generic' (il manubrio).
 */
export function machineKind(machine, exercise = null) {
  if (!machine) return 'generic';
  const tries = [machine.model, ...names(machine.name)];
  if (exercise) tries.push(...names(exercise.name), exercise.code);
  for (const t of tries) { const k = kindOf(t); if (k) return k; }
  return 'generic';
}

// Disegni a linee, 48 × 48, colore del testo (currentColor), stesso spessore per tutti.
// Vista di lato (o di fronte), base a terra a y = 42, pacco pesi a sinistra quando c'è.
const BASE = '<path d="M6 42h36"/>';
const STACK = '<rect x="6" y="8" width="8" height="30" rx="1.5"/><path d="M8.5 14h3M8.5 19h3M8.5 24h3"/>';
const ICONS = {
  // guide inclinate, schienale che scorre sulle guide, appoggio delle spalle, pedana inclinata davanti
  'hack-squat': BASE + '<path d="M9 42L27 6"/><rect x="18.5" y="16" width="7" height="20" rx="3.5" transform="rotate(26.6 22 26)"/>' +
    '<path d="M26.5 17l5.5 2.8"/><path d="M23 39l12-8M30 34.5V42"/>',
  'leg-press': BASE + '<path d="M14 38L38 14M38 14v28M14 38v4"/><path d="M8 22l6 14h8"/><path d="M28 17l8 8"/><circle cx="37" cy="9" r="4"/>',
  'leg-extension': BASE + STACK + '<rect x="17" y="12" width="4" height="16" rx="2"/><rect x="17" y="28" width="15" height="4" rx="2"/><path d="M25 32v10"/>' +
    '<circle cx="33" cy="30" r="2"/><path d="M34.5 31.5L39 37"/><rect x="36.5" y="36" width="7" height="5" rx="2.5"/>',
  'leg-curl': BASE + STACK + '<rect x="17" y="12" width="4" height="16" rx="2"/><rect x="17" y="28" width="15" height="4" rx="2"/><path d="M25 32v10"/>' +
    '<rect x="24" y="21" width="12" height="4" rx="2"/><circle cx="37" cy="30" r="2"/><path d="M37 32v4"/><rect x="34" y="36" width="7" height="5" rx="2.5"/>',
  'chest-press': BASE + STACK + '<rect x="18" y="10" width="4" height="20" rx="2"/><rect x="18" y="28" width="12" height="4" rx="2"/><path d="M24 32v10"/>' +
    '<path d="M20 8q14 0 18 12"/><path d="M38 17v7"/>',
  'shoulder-press': BASE + STACK + '<rect x="19" y="14" width="4" height="16" rx="2"/><rect x="19" y="28" width="12" height="4" rx="2"/><path d="M25 32v10"/>' +
    '<path d="M21 12L35 6"/><path d="M35 3v7"/>',
  'lat-pulldown': BASE + '<rect x="7" y="10" width="6" height="32" rx="1.5"/><path d="M10 10V6h20"/><circle cx="30" cy="8.5" r="2.5"/><path d="M30 11v8"/>' +
    '<path d="M20 21q10-4 20 0"/><rect x="24" y="27" width="10" height="4" rx="2"/><rect x="22" y="34" width="14" height="4" rx="2"/><path d="M29 38v4"/>',
  'row': BASE + '<rect x="36" y="8" width="7" height="30" rx="1.5"/><rect x="8" y="30" width="14" height="4" rx="2"/><path d="M15 34v8"/>' +
    '<rect x="27" y="12" width="4" height="13" rx="2"/><path d="M20 28h16"/><path d="M20 25v6"/>',
  't-bar': BASE + '<circle cx="8" cy="39" r="2"/><path d="M9.5 38L34 22"/><circle cx="37" cy="20" r="6"/><path d="M27 21.5l3 6M27 21.5l-2-5"/>' +
    '<rect x="15" y="22" width="10" height="4" rx="2"/><path d="M20 26v16"/>',
  'fly': '<path d="M10 42h28M24 8v34"/><rect x="21" y="12" width="6" height="17" rx="3"/><rect x="17" y="30" width="14" height="4" rx="2"/>' +
    '<path d="M24 10q-12 0-14 12M24 10q12 0 14 12M10 21v8M38 21v8"/>',
  'lateral-raise': '<path d="M12 42h24M24 34v8"/><rect x="21" y="15" width="6" height="15" rx="3"/><rect x="18" y="30" width="12" height="4" rx="2"/>' +
    '<circle cx="17" cy="16" r="2"/><circle cx="31" cy="16" r="2"/><path d="M15.5 17.5L8 23M32.5 17.5L40 23"/><rect x="5" y="22" width="6" height="4" rx="2"/><rect x="37" y="22" width="6" height="4" rx="2"/>',
  'calf': BASE + '<rect x="34" y="6" width="7" height="34" rx="1.5"/><path d="M14 12h20M30 12v28"/><rect x="13" y="9.5" width="9" height="5" rx="2.5"/>' +
    '<rect x="14" y="36" width="12" height="4" rx="1"/>',
  'arms': '<path d="M8 42h32"/><rect x="10" y="30" width="12" height="4" rx="2"/><path d="M16 34v8M30 26v16"/><path d="M20 28l14-10 2 3-14 10z"/>' +
    '<circle cx="36" cy="20" r="2"/><path d="M35 18L32 10M29 10h6"/>',
  'cable': '<path d="M4 42h40"/><rect x="6" y="6" width="6" height="36" rx="1.5"/><rect x="36" y="6" width="6" height="36" rx="1.5"/>' +
    '<circle cx="14" cy="10" r="2"/><circle cx="34" cy="10" r="2"/><path d="M15 11.5l5 11M33 11.5l-5 11"/><circle cx="20.5" cy="25" r="2.5"/><circle cx="27.5" cy="25" r="2.5"/>',
  'smith': '<path d="M6 42h36M10 6v36M38 6v36M10 6h28"/><path d="M5 20h38"/><rect x="13" y="14" width="3.5" height="12" rx="1"/><rect x="31.5" y="14" width="3.5" height="12" rx="1"/>',
  'deadlift': '<path d="M2 42h44"/><path d="M4 30h40"/><circle cx="11" cy="30" r="9"/><circle cx="37" cy="30" r="9"/><path d="M20 30v-3M28 30v-3"/>',
  generic: '<path d="M16 24h16"/><rect x="10" y="16" width="6" height="16" rx="2"/><rect x="32" y="16" width="6" height="16" rx="2"/>' +
    '<rect x="6" y="19" width="4" height="10" rx="1.5"/><rect x="38" y="19" width="4" height="10" rx="1.5"/>',
};

/** Tutti i tipi che hanno un disegno (compreso 'generic'). */
export const MACHINE_KINDS = Object.keys(ICONS);

/** SVG del tipo (un tipo sconosciuto → manubrio). Solo disegno: aria-hidden, il nome è già scritto accanto. */
export function machineIcon(kind) {
  const p = ICONS[kind] || ICONS.generic;
  return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}
