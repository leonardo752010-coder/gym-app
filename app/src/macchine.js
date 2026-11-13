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

// Disegni 48 × 48 presi dalle icone di riferimento di Leonardo (2026-11-13), ridisegnati a mano:
// linee spesse 2,2 con estremità arrotondate, imbottiture piene (linee più spesse), base a terra a y = 42,
// pacco pesi a sinistra quando la macchina ne ha uno. Colore del testo (currentColor): notte e giorno.
const P = (d, w) => '<path d="' + d + '"' + (w ? ' stroke-width="' + w + '"' : '') + '/>';
const C = (cx, cy, r) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
const PAD = 4.6;   // imbottiture (schienale, sedile, rulli lunghi)
// pacco pesi: torre con la cima arrotondata (o piatta, se in alto parte una trave), due aste, piastre in basso
const RODS = P('M10.6 11v17M14.4 11v17', 1.3) + P('M9 30.6h7M9 33.4h7M9 36.2h7M9 39h7', 1.8);
const TOWER = P('M6 42V10.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V42') + RODS;
const TOWER_FLAT = P('M6 42V6.5h13V42') + RODS;
const ICONS_REF = {
  // hack squat: montante dietro con rinforzo, schienale inclinato che scende verso la pedana, appoggio delle spalle in cima
  'hack-squat': P('M4 42h40') + P('M8 42V21.5M8.5 31L18.5 42') + P('M12.5 23L27 36.5', 5.6) + P('M8.6 15.2l3.4 3.8', PAD) +
    P('M29.5 36.8h13', 3.4) + P('M31.5 38.5V42M40.5 38.5V42'),
  // leg press: sedile reclinato a sinistra, slitta inclinata a 45°, pedana in alto, sostegno dietro
  'leg-press': P('M4 42h40') + P('M6.5 25.5L10.8 36H21', PAD) + P('M10.5 38.5V42M20.5 38.5V42') + P('M21.5 39.5h3') +
    P('M24.5 40L41.5 23', 4) + P('M41.5 26.5V42') + P('M34 18v8', 3.6) + P('M35.8 22h5'),
  // leg extension: schienale, sedile, perno davanti al sedile, braccio verso il basso con il rullo per le caviglie
  'leg-extension': TOWER + P('M4 42h30') + P('M22.5 15.5L25 27.5', PAD) + P('M26.5 30.5H34', PAD) + P('M30 32.8V42') + P('M19 36.5h5.5l3.2-3.4') +
    C(37, 33, 1.6) + P('M38.1 34.1L41 37.2') + C(42.3, 38.6, 2.4),
  // leg curl seduto: schienale più reclinato, sedile alto, braccio e rullo più in basso, appoggio sopra le cosce
  'leg-curl': TOWER + P('M4 42h30') + P('M21.5 14.5L25.5 27', PAD) + P('M27 29.5h8', PAD) + P('M26 24.5h8', 3) + P('M31 31.8V42') + P('M19 40l5-4.2h3.8') +
    C(37.8, 32.6, 1.6) + P('M38.9 33.8L41.5 37.5') + C(42.5, 39.3, 2.3),
  // chest press: braccio che parte dalla cima della torre e scende davanti al petto, maniglia verticale
  'chest-press': TOWER + P('M4 42h36') + P('M19 13l4-4.3') + C(24.8, 7.7, 1.7) + P('M26.6 8.2L36 12.2l2.4 9.8') + P('M38.4 22h3') + P('M43 19.2v5.6', 2.6) +
    P('M23.6 14.5L26 27', PAD) + P('M27 30.2h9.5', PAD) + P('M31.8 32.5V42'),
  // shoulder press: braccio dalla cima della torre che sale sopra la testa, maniglia in alto
  'shoulder-press': TOWER + P('M4 42h36') + C(21.6, 11, 2) + P('M23.4 10.1l8.6-3.7 1.4 6.1') + P('M33.4 12.5h3.6') + P('M38.6 9.4v6.2', 2.6) +
    P('M24 17.5l2 11.5', PAD) + P('M27 31.6h9.5', PAD) + P('M31.8 33.9V42'),
  // lat machine: trave in alto con la carrucola, cavo, barra larga, sedile
  'lat-pulldown': TOWER_FLAT + P('M4 42h36') + P('M19 6.5h16.5') + P('M33 6.5v2.6') + C(33, 11, 1.8) + P('M33 12.8v3') +
    P('M23.5 19.5l3.5-3.5h12l3.5 3.5') + P('M28 34h9.5', PAD) + P('M32.8 36.3V42'),
  // pulley / row: appoggio del petto, sedile, maniglia orizzontale all'altezza del petto
  'row': TOWER + P('M4 42h38') + P('M26 19.5l1 8', PAD) + P('M26.8 29.8l-3 12.2') + P('M29.5 28.8h12') + C(37.8, 28.8, 1.3) + P('M43.4 25.6v6.4', 2.6) +
    P('M30.5 34.5h8.5', PAD) + P('M34.8 36.8V42'),
  // T-bar: appoggio del petto su un cavalletto, perno, bilanciere fino al disco
  't-bar': P('M4 42h30') + P('M14.5 30.5l9.5-6.2', PAD) + P('M10 42l7.3-12.8L23.5 42') + C(21.5, 36.4, 1.6) + P('M23.1 36l13.4-3.6') +
    P('M39 27.5v9.5', 4.4) + P('M42.2 32h2.6'),
  // pectoral / fly, vista di fronte: perni in alto, due braccia che scendono ai lati, schienale e sedile al centro
  'fly': P('M14 42h20') + P('M20.5 6h7M24 6v4.5') + P('M20 10.5h8') + C(18.5, 10.5, 1.5) + C(29.5, 10.5, 1.5) +
    P('M17 10.5l-7 3V22M31 10.5l7 3V22') + P('M7 18.5v6M41 18.5v6', 3.2) + P('M24 17.5v9', 6) + P('M20 32.5h8', PAD) + P('M24 34.8V42'),
  // alzate laterali: perno all'altezza del sedile, braccio che sale, imbottitura per il braccio orizzontale
  'lateral-raise': TOWER + P('M4 42h34') + P('M24.5 15.5L27 27.5', PAD) + P('M27 33.5h9', PAD) + P('M32 35.8V42') +
    C(30.8, 30, 1.5) + P('M30.8 28.5v-5l2.4-1.9') + P('M35.5 21.6h7.5', PAD),
  // polpacci in piedi: imbottitura per le spalle sopra un montante, pedana in basso
  'calf': TOWER + P('M4 42h38') + P('M19 10.5l3.6-1.8') + P('M24.5 8.2h8', PAD) + P('M28.5 10.5V38') + P('M28.5 38.6h10.5', 3),
  // macchina per le braccia (curl / triceps): sedile, panca inclinata, perno e braccio che sale
  'arms': P('M4 42h36') + P('M7 30.5h9', PAD) + P('M11.5 32.8V42') + P('M22 21.5l9.5 5.5', PAD) + P('M23 25.5L20.5 42') +
    C(33.6, 29.3, 1.8) + P('M33.6 31.1V42') + P('M35.2 28.4l2.4-1.6 2.9-5.6'),
  // cavi: torre con la trave in alto, carrucola in alto e in basso, cavo e maniglia
  'cable': TOWER_FLAT + P('M4 42h34') + P('M19 6.5h15.5') + C(31.5, 10.2, 1.9) + P('M33.4 10.2V17') + P('M30.6 21l2.8-4 2.8 4z') +
    P('M29.6 10.4v25.8') + C(31.5, 38, 1.9),
  // Smith / multipower: due montanti con le guide, trave in alto, bilanciere con i dischi
  'smith': P('M10 7v34M38 7v34') + P('M7.5 6.5h33', 2.8) + P('M7 41.5h6M35 41.5h6', 2.8) + P('M13 10v28M35 10v28', 1.3) +
    P('M5 24h38') + P('M7.5 21v6M40.5 21v6', 2.8),
  // stacco / shrug: bilanciere con due dischi per parte, appoggi a terra
  'deadlift': P('M12 24h24') + P('M8 17v14M40 17v14', 4) + P('M12 19.5v9M36 19.5v9', 3) + P('M3 24h2.5M42.5 24h2.5') +
    P('M5 35.5h9M34 35.5h9', 2.6),
};
const ICONS = {
  ...ICONS_REF,
  // manubrio generico (tipo sconosciuto o esercizio senza macchina): dischi pieni, impugnatura spessa
  generic: P('M15.5 24h17', 4.4) + '<rect x="9.5" y="13.5" width="6" height="21" rx="2" fill="currentColor"/>' +
    '<rect x="32.5" y="13.5" width="6" height="21" rx="2" fill="currentColor"/>' +
    '<rect x="5" y="17.5" width="4.5" height="13" rx="1.6" fill="currentColor"/><rect x="38.5" y="17.5" width="4.5" height="13" rx="1.6" fill="currentColor"/>',
};

/** Tutti i tipi che hanno un disegno (compreso 'generic'). */
export const MACHINE_KINDS = Object.keys(ICONS);

/** SVG del tipo (un tipo sconosciuto → manubrio). Solo disegno: aria-hidden, il nome è già scritto accanto. */
export function machineIcon(kind) {
  const p = ICONS[kind] || ICONS.generic;
  return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}
