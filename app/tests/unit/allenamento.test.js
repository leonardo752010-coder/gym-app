// Schermata ALLENAMENTO (layout "Track"): righe della tabella, frecce, tendina dei workout, timer.
// E controlli sul codice: le schede dei giorni non ci sono più, ogni funzione di prima resta raggiungibile.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { tableRows, exNav, dayOptions, clock, rirLabel, rirNext, vsLast } from '../../src/allenamento.js';
import { LANGS } from '../../src/i18n.js';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const main = read('src/main.js'), css = read('src/styles.css');
const set = (id, n, w = 80, r = 8) => ({ id, set_number: n, weight_kg: w, reps: r, rir: 2 });
const sugg = { sets: [{ n: 1, weight: 82.5, reps: 6 }, { n: 2, weight: 82.5, reps: 6 }, { n: 3, weight: 82.5, reps: 6 }] };

describe('tabella Set / Kg / Rep / RIR', () => {
  it('serie fatte, poi quella da salvare, poi quelle del piano con i valori del suggerimento', () => {
    const rows = tableRows({ done: [set('a', 1)], plannedSets: 4, draft: { n: 2, weight: 82.5, reps: 6 }, sugg });
    expect(rows.map((r) => r.kind + r.n)).toEqual(['done1', 'cur2', 'todo3', 'todo4']);
    expect(rows[2]).toMatchObject({ weight: 82.5, reps: 6 });
    expect(rows[3]).toMatchObject({ weight: 82.5, reps: 6 });   // oltre il suggerimento: l'ultimo valore
  });

  it('senza suggerimento (prima volta) le serie da fare restano vuote', () => {
    const rows = tableRows({ done: [], plannedSets: 2, draft: { n: 1 }, sugg: null });
    expect(rows.map((r) => r.kind)).toEqual(['cur', 'todo']);
    expect(rows[1]).toMatchObject({ weight: null, reps: null });
  });

  it('serie in modifica: diventa la riga in corso, nessuna serie nuova', () => {
    const rows = tableRows({ done: [set('a', 1), set('b', 2)], plannedSets: 3, draft: { n: 3 }, editId: 'b', sugg });
    expect(rows.map((r) => r.kind + r.n)).toEqual(['done1', 'cur2']);
    expect(rows[1].edit).toBe(true);
  });

  it('serie finite: niente riga nuova; la serie extra è segnata', () => {
    expect(tableRows({ done: [set('a', 1), set('b', 2)], plannedSets: 2, showDraft: false }).map((r) => r.kind)).toEqual(['done', 'done']);
    const ex = tableRows({ done: [set('a', 1), set('b', 2)], plannedSets: 2, draft: { n: 3 } });
    expect(ex[2]).toMatchObject({ kind: 'cur', n: 3, extra: true });
  });

  it('RIR: 4 vuol dire "4+"; vuoto = trattino', () => {
    expect([0, 1, 2, 3, 4, null].map(rirLabel)).toEqual(['0', '1', '2', '3', '4+', '—']);
  });

  it('RIR a tocco: 0 → 1 → 2 → 3 → 4+ → 0 (da un valore strano si riparte da 0)', () => {
    expect([0, 1, 2, 3, 4].map(rirNext)).toEqual([1, 2, 3, 4, 0]);
    expect([5, null, undefined, 'x', -1].map(rirNext)).toEqual([0, 0, 0, 0, 0]);
  });

  it('badge "vs volta scorsa": stesso peso → differenza di rep; peso diverso → differenza di peso; senza volta scorsa niente', () => {
    expect(vsLast({ weight: 80, reps: 10 }, 80, 9)).toEqual({ kind: 'reps', diff: 1 });
    expect(vsLast({ weight: 80, reps: 9 }, 80, 9)).toEqual({ kind: 'reps', diff: 0 });
    expect(vsLast({ weight: 82.5, reps: 6 }, 80, 10)).toEqual({ kind: 'weight', diff: 2.5 });
    expect(vsLast({ weight: 185, reps: 6 }, 180, 10)).toEqual({ kind: 'weight', diff: 5 });   // lb: stessa regola
    expect(vsLast(null, 80, 9)).toBe(null);
    expect(vsLast({ weight: 80, reps: 10 }, null, null)).toBe(null);
    expect([LANGS.it.repDiff(1), LANGS.en.repDiff(1), LANGS.en.repDiff(2)]).toEqual(['+1 rep', '+1 rep', '+2 reps']);
  });
});

describe('passare da un esercizio all\'altro e da un workout all\'altro', () => {
  it('frecce ‹ › spente al primo e all\'ultimo esercizio', () => {
    expect(exNav(0, 6)).toEqual({ prev: false, next: true });
    expect(exNav(3, 6)).toEqual({ prev: true, next: true });
    expect(exNav(5, 6)).toEqual({ prev: true, next: false });
    expect(exNav(0, 1)).toEqual({ prev: false, next: false });
  });

  it('tendina dei workout: tutti i giorni del piano, quello aperto acceso, serie fatte / serie del piano', () => {
    const days = [{ id: 'ua', name: 'Upper A', exercises: [1, 2] }, { id: 'la', name: 'Lower A', exercises: [1] }];
    const o = dayOptions(days, 'la', (d) => (d.id === 'la' ? { done: 1, total: 3 } : { done: 0, total: 4 }));
    expect(o).toEqual([
      { id: 'ua', name: 'Upper A', done: 0, total: 4, count: 2, on: false },
      { id: 'la', name: 'Lower A', done: 1, total: 3, count: 1, on: true },
    ]);
  });

  it('timer fermo: recupero come m:ss', () => {
    expect([150, 90, 60, 5, 0].map(clock)).toEqual(['2:30', '1:30', '1:00', '0:05', '0:00']);
    expect(clock(-12)).toBe('+0:12');
  });
});

describe('layout nel codice', () => {
  it('le 4 schede fisse dei giorni non ci sono più: al loro posto il workout a tendina', () => {
    expect(main).not.toMatch(/id="days"|class="day"|\$\('days'\)/);
    expect(main).toMatch(/id="dayBtn"/);
    expect(main).toMatch(/function openDays\(/);
    expect(main).toMatch(/defaultDay\(p, v\.idx, S\.date/);   // l'app apre ancora da sola il giorno giusto
  });

  it('niente sparisce: data, luna, kg/lb, Account e Fine seduta nel menu "..."; stato di sincronizzazione in testata', () => {
    const more = main.slice(main.indexOf('function openMore('), main.indexOf('function openDays('));
    for (const id of ['mDate', 'mTheme', 'mUnit', 'mAccount']) expect(more, id).toMatch(new RegExp('id="' + id + '"'));
    expect(more).toMatch(/endRow\(v\)/);
    expect(more).toMatch(/openMenu/);                         // Account = menu di sempre (versione, sync, lingua, Esci)
    expect(main).toMatch(/id="tsync"/);
    expect(main).toMatch(/\['tsync', 'sync tsync '\]/);       // stesso testo dello stato di prima
  });

  it('tasti + / − per kg e rep, suggerimento sopra la tabella, un solo tasto viola per salvare', () => {
    const ed = main.slice(main.indexOf('function editor('), main.indexOf('function dock('));
    // una capsula "− numero +" per il peso e una per le rep: ognuna ha il suo − (data-d="-1") e il suo + (data-d="1")
    expect(ed).toContain("cap('weight', 'inKg'");
    expect(ed).toContain("cap('reps', 'inReps'");
    expect(ed.split(`data-st="' + f + '" data-d="-1"`).length - 1).toBe(1);
    expect(ed.split(`data-st="' + f + '" data-d="1"`).length - 1).toBe(1);
    const ex = main.slice(main.indexOf('function exView('), main.indexOf('function editor('));
    expect(ex.indexOf('id="sugg"')).toBeGreaterThan(0);
    expect(ex.indexOf('id="sugg"')).toBeLessThan(ex.indexOf('id="sets"'));
    expect(ex.indexOf('id="sets"')).toBeLessThan(ex.indexOf('id="last"'));   // Volta scorsa sotto la tabella
    expect(main.match(/class="go"/g).length).toBe(1);
    expect(main).not.toMatch(/'<button class="save" id="save"/);         // nessun secondo tasto Salva nella carta
  });

  it('salvataggio solo con le funzioni di prima', () => {
    expect(read('src/allenamento.js')).not.toMatch(/\bapi\b|fetch|saveSet|updateSet|deleteSet|localStorage|indexedDB|setKv/);
    expect(main).toMatch(/await saveSet\(S\.local, ctx, pe, values\)/);
    expect(main).toMatch(/await updateSet\(S\.local, S\.edit\.id, values\)/);
  });

  it('niente foto della macchina (non esiste il dato); il tasto Storico c\'è (chiesto da Leonardo il 2026-11-13: ultime 3 volte)', () => {
    expect(main).not.toMatch(/photo|foto/i);
    expect(main).toMatch(/id="histBtn"/);
    expect(LANGS.it.histBtn).toBeTruthy();
  });

  it('area di tocco (non il disegno): almeno 40 × 40 px per − / + e RIR, almeno 44 px per frecce, timer, salva, tendine', () => {
    const rule = (sel) => { const i = css.indexOf(sel + '{'); expect(i, sel).toBeGreaterThan(-1); return css.slice(i, css.indexOf('}', i)); };
    const px = (sel, prop) => { const m = rule(sel).match(new RegExp('(?:\\{|;)' + prop + ':(\\d+)px')); return m ? Number(m[1]) : 0; };
    // − / +: disegnati come cerchi di 28 px (::before), ma il tasto vero, quello che si tocca, è 40 × 40 px
    expect(px('#exv#exv .cap button', 'width')).toBeGreaterThanOrEqual(40);
    expect(px('#exv#exv .cap button', 'height')).toBeGreaterThanOrEqual(40);
    expect(px('#exv#exv .cap button::before', 'width')).toBeLessThan(px('#exv#exv .cap button', 'width'));   // disegno più piccolo del tocco
    expect(rule('#exv#exv .cap::after')).toMatch(/inset:0 6px/);   // bordo disegnato 6 px dentro: il tocco sporge nello spazio vuoto
    expect(rule('#exv#exv .scur .cell.cap')).toMatch(/grid-template-columns:40px minmax\(0,1fr\) 40px/);   // − numero +: niente si sovrappone
    // RIR: una casella sola, tocco almeno 40 × 40 px
    expect(px('.rirb', 'width')).toBeGreaterThanOrEqual(40);
    expect(px('.rirb', 'height')).toBeGreaterThanOrEqual(40);
    expect(px('.arr', 'width')).toBeGreaterThanOrEqual(44);
    expect(px('#timer#timer .go', 'min-width')).toBeGreaterThanOrEqual(44);
    expect(px('#timer#timer .go', 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px('#timer#timer .treset', 'width')).toBeGreaterThanOrEqual(44);
    expect(px('.more', 'width')).toBeGreaterThanOrEqual(44);
    expect(px('.dayBtn', 'min-height')).toBeGreaterThanOrEqual(44);
  });

  it('finestra del timer solo dopo un salvataggio, chiusa col ✕; il tasto viola resta sempre', () => {
    expect(css).toMatch(/#timer#timer\.idle \.tclock,#timer#timer\.idle \.treset\{display:none\}/);
    expect(css).toMatch(/#timer#timer\.idle\{[^}]*background:transparent[^}]*pointer-events:none/);
    expect(css).toMatch(/#timer#timer\.idle \.go\{pointer-events:auto\}/);
    expect(main).toMatch(/if \(!isUpdate\) startTimer\(restFor\(pe\)\)/);   // parte solo salvando una serie nuova
    expect(main).toMatch(/\$\('tStop'\)\.onclick = stopTimer/);
    expect(main).toMatch(/aria-label="\$\{esc\(S\.T\.closeTimer\)\}"/);
  });

  it('serie in corso: capsule "− numero +" e casella RIR nella riga; niente riga separata di − / + né 5 tasti RIR', () => {
    const ed = main.slice(main.indexOf('function editor('), main.indexOf('function dock('));
    expect(ed).toMatch(/class="cell cap/);
    expect(ed).toMatch(/id="rirVal" data-rirc=/);
    expect(ed).not.toMatch(/class="steps"|class="rirrow"|data-rir="/);
    expect(main).toMatch(/d\.rir = rirNext\(d\.rir\)/);   // il tocco cambia solo la bozza: si salva come prima
  });

  it('testi nuovi in italiano e inglese', () => {
    for (const k of ['more', 'chooseDay', 'exercises', 'notesBtn', 'closeTimer', 'goal', 'vsLast', 'repDiff', 'weightCol', 'complete', 'rirTap']) {
      expect(LANGS.it[k], k).toBeTruthy();
      expect(LANGS.en[k], k).toBeTruthy();
    }
  });
});
