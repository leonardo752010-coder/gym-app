// Versione dell'app: una sola funzione, formato "gg/mm/aaaa hh:mm", mostrata in accesso, caricamento, menu e Programma.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { APP_VERSION, versionText } from '../../src/version.js';
import { LANGS } from '../../src/i18n.js';

const main = fs.readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');

describe('versione', () => {
  it('è la data e ora della build (gg/mm/aaaa hh:mm)', () => {
    expect(APP_VERSION).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('testo uguale ovunque, in italiano e in inglese', () => {
    expect(versionText(LANGS.it.version, false, '08/11/2026 02:42')).toBe('Versione 08/11/2026 02:42');
    expect(versionText(LANGS.en.version, false, '08/11/2026 02:42')).toBe('Version 08/11/2026 02:42');
    expect(versionText(LANGS.it.version, true, '08/11/2026 02:42')).toBe('Versione 08/11/2026 02:42 (locale)');
    expect(versionText('Versione')).toBe('Versione ' + APP_VERSION);
  });

  it('main.js usa solo version.js e la mostra in accesso, caricamento, menu e Programma', () => {
    expect(main).not.toMatch(/__APP_VERSION__/);
    for (const id of ['verLogin', 'verLoad', 'verMenu', 'verProgram']) expect(main).toContain("VER('" + id + "')");
  });
});
