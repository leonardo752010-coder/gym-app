// Barra di stato del telefono (theme-color): sempre dello stesso colore dello sfondo dell'app, nei due temi.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const css = read('src/styles.css'), html = read('index.html'), main = read('src/main.js');
const manifest = JSON.parse(read('public/manifest.webmanifest'));

// colori dal CSS (non scritti a mano qui)
const block = (sel) => { const i = css.indexOf(sel + '{'); expect(i, sel).toBeGreaterThan(-1); return css.slice(i, css.indexOf('}', i)); };
const token = (b, name) => (b.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1].toLowerCase();
const NOTTE = token(block(':root'), '--bg');                                                         // accesso, starter, prima del caricamento
const NOTTE_APP = token(block(':root[data-theme="dark"]:has(#wrap)'), '--sk-bg');                    // caricamento e pagine
const GIORNO = token(block(':root[data-theme="light"]:not(:has(#starterScr))'), '--sk-bg');           // tutto tranne lo starter
const GIORNO_STARTER = token(block(':root[data-theme="light"]'), '--bg');                            // CHOOSE YOUR STARTER

// la funzione vera di main.js, fatta girare con una pagina finta
function runSyncBar(bodyBg) {
  const src = main.slice(main.indexOf('function syncBar()'));
  const fn = src.slice(0, src.search(/\r?\n\}\r?\n/)) + '\n}';
  const meta = { content: 'nessuno' };
  const document = { body: {}, querySelector: (q) => (q === 'meta[name=theme-color]' ? meta : null) };
  const getComputedStyle = () => ({ backgroundColor: bodyBg });
  class MutationObserver { observe() {} }
  new Function('document', 'getComputedStyle', 'MutationObserver', fn + '\nsyncBar();')(document, getComputedStyle, MutationObserver);
  return meta.content;
}
const rgb = (hex) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';

describe('barra di stato = sfondo', () => {
  it('main.js copia lo sfondo vero della pagina, in tutti e due i temi e su ogni schermata', () => {
    for (const bg of [NOTTE, NOTTE_APP, GIORNO, GIORNO_STARTER]) expect(runSyncBar(rgb(bg))).toBe(bg);
    expect(runSyncBar('rgba(0, 0, 0, 0)')).toBe('nessuno');          // sfondo trasparente: non cambia niente
  });

  it('main.js non ha più colori fissi per la barra: segue il tasto luna e la schermata', () => {
    expect(main).not.toMatch(/meta\.content\s*=\s*t\s*===/);
    expect(main).toMatch(/function applyTheme\(t\) \{[^}]*syncBar\(\);/);
    expect(main).toMatch(/getComputedStyle\(document\.body\)\.backgroundColor/);
    expect(main).toMatch(/new MutationObserver\(syncBar\)/);
  });

  it('prima del caricamento (index.html): barra e sfondo uguali, dal tema scelto o da quello del telefono', () => {
    expect(html).toMatch(new RegExp('<meta name="theme-color" content="' + NOTTE + '">', 'i'));
    expect(html).toMatch(new RegExp('html,body\\{margin:0;background:' + NOTTE + '\\}', 'i'));
    expect(html).toMatch(new RegExp(':where\\(:root\\[data-theme="light"\\]\\) body\\{background:' + GIORNO + '\\}', 'i'));
    const s = html.match(/<script>(.*?)<\/script>/s)[1];
    expect(s).toContain("localStorage.getItem('gym.theme')");
    expect(s).toContain("prefers-color-scheme: light");
    expect(s.toLowerCase()).toContain("t==='light'?'" + GIORNO + "':'" + NOTTE + "'");
    expect(main).toContain("localStorage.getItem('gym.' + k)");      // stessa chiave del tasto luna
  });

  it('manifest: colore di partenza uguale allo sfondo di partenza', () => {
    expect(manifest.theme_color.toLowerCase()).toBe(NOTTE);
    expect(manifest.background_color.toLowerCase()).toBe(NOTTE);
  });
});
