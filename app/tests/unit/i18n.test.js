// Lingua: italiano solo se il telefono è in italiano, altrimenti inglese (neozelandese); date giorno/mese/anno; kg.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGS, pickLang, tr, fmtDay } from '../../src/i18n.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

describe('lingua del telefono', () => {
  it('lingue non previste (cinese, giapponese, tedesco, vuota) → inglese; italiano → italiano', () => {
    for (const l of ['zh-CN', 'zh', 'ja-JP', 'de-DE', 'en-US', 'en-NZ', '', undefined, null]) expect(pickLang(null, l)).toBe('en');
    for (const l of ['it', 'it-IT', 'it-CH']) expect(pickLang(null, l)).toBe('it');
    expect(pickLang('it', 'zh-CN')).toBe('it');   // scelta fatta dal menu
    expect(pickLang('xx', 'zh-CN')).toBe('en');   // valore salvato strano
  });

  it('ogni testo esiste in tutte e due le lingue, con lo stesso tipo, e non è vuoto', () => {
    const { it: IT, en: EN } = LANGS;
    expect(Object.keys(EN).sort()).toEqual(Object.keys(IT).sort());
    for (const k of Object.keys(IT)) {
      expect(typeof EN[k], k).toBe(typeof IT[k]);
      if (typeof EN[k] === 'string') expect(EN[k].trim().length, k).toBeGreaterThan(0);
      if (typeof EN[k] === 'object') expect(Object.keys(EN[k]).sort(), k).toEqual(Object.keys(IT[k]).sort());
    }
    for (const k of ['endSession', 'ended', 'closedAt', 'reopen', 'reopened', 'saveErr', 'sync', 'back', 'noConfig']) expect(EN[k], k).toBeTruthy();
  });

  it('inglese neozelandese: locale en-NZ, "program" e mai "programme" o grafie americane comuni', () => {
    expect(LANGS.en.locale).toBe('en-NZ');
    const all = JSON.stringify(LANGS.en, (k, v) => (typeof v === 'function' ? v.toString() : v));
    expect(all).not.toMatch(/programme/i);
    expect(all).not.toMatch(/\b(color|favorite|center|organize|customize|canceled)\b/i);
  });

  it('date: giorno prima del mese, anno quando non è quello di oggi', () => {
    expect(fmtDay('2026-11-06', LANGS.en.locale)).toBe('6 Nov');
    expect(fmtDay('2025-12-30', LANGS.en.locale, '2026-01-02')).toBe('30 Dec 2025');
    expect(fmtDay('2026-11-06', LANGS.it.locale)).toBe('6 nov');
    expect(new Date(2026, 10, 6).toLocaleDateString(LANGS.en.locale)).toBe('6/11/2026');
  });

  it('nomi dal database: la lingua scelta, poi l\'inglese, poi l\'italiano', () => {
    expect(tr({ it: 'Panca', en: 'Bench' }, 'en')).toBe('Bench');
    expect(tr({ it: 'Panca' }, 'en')).toBe('Panca');
    expect(tr({ en: 'Bench' }, 'it')).toBe('Bench');
  });

  it('pagina e manifest: lingua di base inglese, nessun testo solo italiano', () => {
    expect(read('index.html')).toMatch(/<html lang="en">/);
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.lang).toBe('en');
    expect(m.description).not.toMatch(/\b(il|tuo|serie|tocco)\b/i);
  });

  it('nel codice nessun messaggio scritto solo in italiano', () => {
    const main = read('src/main.js');
    expect(main).not.toMatch(/Configurazione mancante/);
    expect(main).not.toMatch(/<dt>Sync<\/dt>/);
    expect(main).not.toMatch(/aria-label="back"/);
    expect(main).not.toMatch(/toast\(S\.T\.loginErr \+ \(e/);   // errore di salvataggio, non di accesso
    expect(read('src/store.js')).not.toMatch(/'errore'/);
  });
});
