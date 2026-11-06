// Controlli di sicurezza sui file dell'app che vanno nel telefono (src/, public/, index.html).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ONLINE } from '../../src/config.js';
import { LANGS } from '../../src/i18n.js';

const app = path.join(__dirname, '..', '..');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === 'icons' ? [] : files(p);
  return [p];
});
const shipped = [...files(path.join(app, 'src')), ...files(path.join(app, 'public')), path.join(app, 'index.html')];

describe('configurazione', () => {
  it('solo il progetto gym-app', () => {
    expect(ONLINE.url).toBe('https://kclgcqwmvqqkogkhycgb.supabase.co');
    for (const f of shipped) {
      const refs = fs.readFileSync(f, 'utf8').match(/[a-z]{20}\.supabase\.co/g) || [];
      for (const r of refs) expect(r, f).toBe('kclgcqwmvqqkogkhycgb.supabase.co');
    }
  });
  it('la chiave, se c\'è, è quella pubblica', () => {
    if (ONLINE.key) expect(ONLINE.key).toMatch(/^sb_publishable_/);
  });
  it('nessuna chiave di servizio o token nei file dell\'app', () => {
    for (const f of shipped) {
      const t = fs.readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}|eyJhbGciOi[A-Za-z0-9_-]{8,}/);
    }
  });
});

describe('testi', () => {
  it('italiano e inglese hanno gli stessi testi', () => {
    const keys = (o) => Object.keys(o).sort();
    expect(keys(LANGS.en)).toEqual(keys(LANGS.it));
    expect(keys(LANGS.en.why)).toEqual(keys(LANGS.it.why));
  });
});
