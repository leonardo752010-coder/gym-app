// Intestazione dell'esercizio: tipo di macchina ricavato dal modello e disegno a linee (nessun marchio).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normKind, kindOf, machineKind, machineIcon, MACHINE_KINDS } from '../../src/macchine.js';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const main = read('src/main.js'), css = read('src/styles.css');

describe('tipo di macchina dal modello', () => {
  it('normalizza maiuscole, spazi, trattini, parentesi e accenti', () => {
    expect(normKind('  HACK-squat ')).toBe('hack squat');
    expect(normKind('Leg Press (OG, a dischi)')).toBe('leg press og a dischi');
    expect(normKind('T-bar Row')).toBe('t bar row');
    expect(normKind('Pressa à 45°')).toBe('pressa a 45');
    expect(normKind(null)).toBe('');
  });

  it('i modelli delle macchine nei file di import e nei dati finti', () => {
    const casi = {
      'Hack Squat': 'hack-squat', 'hack squat': 'hack-squat', 'HACK-SQUAT': 'hack-squat',
      'Leg Press (OG, a dischi)': 'leg-press', 'Leg Press 45': 'leg-press',
      'Leg Extension': 'leg-extension', 'Leg Extension a dischi': 'leg-extension', 'Leg Extension plate': 'leg-extension',
      'Seated Leg Curl': 'leg-curl',
      'Iso-Lateral Incline Press': 'chest-press', 'Iso-Lateral Bench Press': 'chest-press', 'Super Declined Chest Press': 'chest-press', 'Incline Press': 'chest-press',
      'Iso-Lateral High Row': 'row', 'T-bar Row': 't-bar', 'T-bar': 't-bar',
      'Select Lateral Raise': 'lateral-raise', 'Lateral Raise': 'lateral-raise',
      'HumanSport Chest Fly': 'fly', 'Rear Delt Fly': 'fly',
      'Select Triceps Extension': 'arms', 'Preacher Curl': 'arms',
      'Select Standing Calf': 'calf', 'Shoulder Press': 'shoulder-press',
      'Shrug and Deadlift': 'deadlift', 'Multipower': 'smith', 'Lat Pulldown': 'lat-pulldown',
      'Cable crossover': 'cable', 'Cavi': 'cable', 'Seated Row': 'row',
    };
    for (const [modello, tipo] of Object.entries(casi)) expect(kindOf(modello), modello).toBe(tipo);
  });

  it('"iso-lateral" non è un\'alzata laterale; "leg curl" non è un curl per le braccia', () => {
    expect(kindOf('Iso-Lateral High Row')).toBe('row');
    expect(kindOf('Seated Leg Curl')).toBe('leg-curl');
    expect(kindOf('Leg Press')).toBe('leg-press');
  });

  it('senza macchina: sempre il manubrio generico (anche se il nome dell\'esercizio direbbe un tipo)', () => {
    expect(machineKind(null, { code: 'lat-pulldown', name: { it: 'Lat pulldown', en: 'Lat pulldown' } })).toBe('generic');
    expect(machineKind(undefined)).toBe('generic');
  });

  it('con macchina: modello, poi nome della macchina, poi nome dell\'esercizio, poi manubrio', () => {
    expect(machineKind({ model: 'Hack Squat', brand: 'Atlantis', brand_code: 'PW412' })).toBe('hack-squat');
    expect(machineKind({ model: null, name: { it: 'Pressa', en: 'Leg press' } })).toBe('leg-press');
    expect(machineKind({ model: 'XR-9000' }, { code: 'hack-squat', name: { it: 'Hack squat' } })).toBe('hack-squat');
    expect(machineKind({ model: 'XR-9000' }, { code: 'boh', name: { it: 'Qualcosa' } })).toBe('generic');
  });
});

describe('disegni', () => {
  it('almeno Hack Squat, gli 8 tipi chiesti e il manubrio', () => {
    for (const k of ['hack-squat', 'leg-press', 'leg-extension', 'leg-curl', 'chest-press', 'lat-pulldown', 'row', 'shoulder-press', 'cable', 'generic']) {
      expect(MACHINE_KINDS, k).toContain(k);
    }
  });

  it('ogni tipo delle regole ha un disegno; un tipo sconosciuto dà il manubrio', () => {
    for (const k of MACHINE_KINDS) expect(machineIcon(k)).toMatch(/^<svg viewBox="0 0 48 48"[^>]*stroke="currentColor"[^>]*aria-hidden="true">.+<\/svg>$/);
    expect(machineIcon('non-esiste')).toBe(machineIcon('generic'));
    expect(machineIcon(undefined)).toBe(machineIcon('generic'));
  });

  it('solo linee: niente testo, immagini o marchi dentro i disegni', () => {
    for (const k of MACHINE_KINDS) {
      const s = machineIcon(k);
      expect(s, k).not.toMatch(/<text|<image|href|atlantis|hammer|panatta|cybex|nautilus|gymleco|technogym/i);
      expect(s, k).toMatch(/fill="none"/);
    }
  });
});

describe('intestazione nel tab Allenamento', () => {
  it('quadrato col disegno a sinistra, nome e macchina a destra, poi le pillole; Note e Storico come prima', () => {
    const i = main.indexOf('class="exHead"');
    expect(i).toBeGreaterThan(-1);
    expect(main.indexOf('class="mico"')).toBeGreaterThan(i);
    expect(main.indexOf('<h1 class="ex">')).toBeGreaterThan(main.indexOf('class="mico"'));
    expect(main.indexOf('class="chips"')).toBeGreaterThan(main.indexOf("h += '</div></div>';"));
    expect(main).toMatch(/id="notesBtn"/);
    expect(main).toMatch(/id="histBtn"/);
    expect(main).toMatch(/if \(b\.id === 'notesBtn'\) \{ S\.openNotes = !S\.openNotes; render\(\); return; \}/);
  });

  it('telefono stretto: il nome va a capo, la colonna del testo può stringersi, le pillole vanno a capo e sono rotonde', () => {
    expect(css).toMatch(/\.exv \.ex\{[^}]*overflow-wrap:anywhere/);
    expect(css).toMatch(/#exv#exv \.exTx\{flex:1;min-width:0\}/);
    expect(css).toMatch(/#exv#exv \.mico\{flex:none;width:60px;height:60px/);
    expect(css).toMatch(/#exv#exv \.chips\{display:flex;flex-wrap:wrap/);
    expect(css).toMatch(/#exv#exv \.chips > span,#exv#exv \.mini > span\{[^}]*border-radius:999px/);
  });
});
