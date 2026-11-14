// Consegna del file dell'export (consegna.js): condivisione solo dove funziona, altrimenti download; mai in silenzio.
// Bug del 15/11 (Samsung Z Fold 7, Chrome Android): .xlsx → share() rifiutato con NotAllowedError → tasto viola
// all'infinito, nessun download. Browser finto: navigator, document, URL e setTimeout sono oggetti di prova.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deliverFile, downloadBlob, shareAllowed, errorLabel, REVOKE_AFTER_MS, ANDROID_SHAREABLE } from '../../src/consegna.js';
import { LANGS } from '../../src/i18n.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(appDir, f), 'utf8');

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 16; SM-F966B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1';
const XLSX = 'storico-allenamenti-tutto-2026-11-15.xlsx';
const blob = { size: 1234, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const err = (name, message = '') => Object.assign(new Error(message || name), { name });

/** Browser finto: registra tutto quello che succede. */
function fakeEnv({ ua = UA_ANDROID, touch = true, canShare = true, share = async () => {}, activation = { isActive: true }, fresh = false, noShare = false,
  createObjectURL, click } = {}) {
  const log = [];
  const body = { children: [], appendChild(el) { el.parentNode = body; body.children.push(el); log.push('append'); } , removeChild(el) { body.children = body.children.filter((x) => x !== el); el.parentNode = null; log.push('remove'); } };
  const doc = {
    body,
    createElement(tag) {
      const el = { tag, style: {}, parentNode: null, click() { log.push('click:' + el.download + ':' + el.href + ':' + (el.parentNode === body)); if (click) click(); } };
      log.push('create:' + tag);
      return el;
    },
  };
  const url = {
    createObjectURL: createObjectURL || ((b) => { log.push('url'); return 'blob:fake/1'; }),
    revokeObjectURL: (u) => log.push('revoke:' + u),
  };
  const timers = [];
  const nav = {
    canShare: typeof canShare === 'function' ? canShare : () => canShare,
    share: async (data) => { log.push('share:' + data.files.map((f) => f.name).join(',')); return share(data); },
    ...(activation ? { userActivation: activation } : {}),
  };
  return {
    log, timers, doc, body,
    env: { nav, ua, touch, fresh, noShare, doc, url, setTimeout: (f, ms) => timers.push({ f, ms }), makeFile: (b, n) => ({ name: n, type: b.type }) },
  };
}

describe('Bug Z Fold 7: Chrome Android e file .xlsx', () => {
  it('Android + .xlsx: download subito, share non chiamato, nessun tasto viola (anche se canShare dice sì)', async () => {
    const f = fakeEnv({ ua: UA_ANDROID, canShare: true, activation: { isActive: false } });
    const r = await deliverFile(blob, XLSX, f.env);
    expect(r.result).toBe('downloaded');
    expect(f.log.some((x) => x.startsWith('share:'))).toBe(false);
  });

  it('il vecchio giro non può più succedere: tocco sul tasto viola + share rifiutato → download, non un altro tasto viola', async () => {
    // telefono che dice "sì" a canShare ma rifiuta share (come il Fold), senza riconoscere il tipo dall'indirizzo
    const f = fakeEnv({ ua: 'Mozilla/5.0 (Linux; Mobile) Chrome/142', fresh: true, share: async () => { throw err('NotAllowedError', 'Permission denied'); } });
    const r = await deliverFile(blob, XLSX, f.env);
    expect(r.result).toBe('downloaded');
    expect(r.shareError.name).toBe('NotAllowedError');
    expect(f.log.filter((x) => x.startsWith('click:'))).toHaveLength(1);
  });

  it('share rifiutato con il tocco ancora valido (tipo non permesso) → download subito', async () => {
    const f = fakeEnv({ ua: 'Mozilla/5.0 (Linux; Mobile) Chrome/142', activation: { isActive: true }, share: async () => { throw err('NotAllowedError'); } });
    const r = await deliverFile(blob, XLSX, f.env);
    expect(r.result).toBe('downloaded');
  });

  it('Android: i tipi che Chrome condivide (pdf, csv, immagini) restano condivisibili; .xlsx e .docx no', () => {
    for (const n of ['a.pdf', 'a.csv', 'a.png', 'a.txt', 'a.mp4']) expect(ANDROID_SHAREABLE.test(n)).toBe(true);
    for (const n of ['a.xlsx', 'a.xls', 'a.docx', 'a.zip']) expect(ANDROID_SHAREABLE.test(n)).toBe(false);
    const f = fakeEnv({ ua: UA_ANDROID });
    expect(shareAllowed({ name: 'a.pdf' }, f.env)).toBe(true);
    expect(shareAllowed({ name: XLSX }, f.env)).toBe(false);
  });
});

describe('Quando si prova il menu di condivisione', () => {
  it('canShare falso → download diretto, nessun tasto viola', async () => {
    const f = fakeEnv({ ua: UA_IPHONE, canShare: false });
    expect((await deliverFile(blob, XLSX, f.env)).result).toBe('downloaded');
    expect(f.log.some((x) => x.startsWith('share:'))).toBe(false);
  });

  it('canShare che lancia un errore → download', async () => {
    const f = fakeEnv({ ua: UA_IPHONE, canShare: () => { throw new TypeError('x'); } });
    expect((await deliverFile(blob, XLSX, f.env)).result).toBe('downloaded');
  });

  it('computer (niente touch) o condivisione già fallita su questo telefono → download', async () => {
    expect((await deliverFile(blob, XLSX, fakeEnv({ ua: UA_IPHONE, touch: false }).env)).result).toBe('downloaded');
    expect((await deliverFile(blob, XLSX, fakeEnv({ ua: UA_IPHONE, noShare: true }).env)).result).toBe('downloaded');
  });

  it('iPhone, tocco ancora valido → menu di condivisione', async () => {
    const f = fakeEnv({ ua: UA_IPHONE, activation: { isActive: true } });
    expect((await deliverFile(blob, XLSX, f.env)).result).toBe('shared');
    expect(f.log).toContain('share:' + XLSX);
    expect(f.log.some((x) => x.startsWith('click:'))).toBe(false);
  });

  it('iPhone, tocco scaduto dopo l\'attesa → tasto viola (senza provare share); al tocco sul tasto → menu', async () => {
    const f = fakeEnv({ ua: UA_IPHONE, activation: { isActive: false } });
    expect((await deliverFile(blob, XLSX, f.env)).result).toBe('need-tap');
    expect(f.log.some((x) => x.startsWith('share:') || x.startsWith('click:'))).toBe(false);
    const g = fakeEnv({ ua: UA_IPHONE, activation: { isActive: true }, fresh: true });
    expect((await deliverFile(blob, XLSX, g.env)).result).toBe('shared');
  });

  it('senza navigator.userActivation: un solo tasto viola, poi download (mai in giro)', async () => {
    const no = async () => { throw err('NotAllowedError'); };
    const a = fakeEnv({ ua: UA_IPHONE, activation: null, share: no });
    expect((await deliverFile(blob, XLSX, a.env)).result).toBe('need-tap');
    const b = fakeEnv({ ua: UA_IPHONE, activation: null, share: no, fresh: true });
    expect((await deliverFile(blob, XLSX, b.env)).result).toBe('downloaded');
  });

  it('menu chiuso senza scegliere (AbortError) → niente, nessun download', async () => {
    const f = fakeEnv({ ua: UA_IPHONE, share: async () => { throw err('AbortError'); } });
    expect((await deliverFile(blob, XLSX, f.env)).result).toBe('cancelled');
    expect(f.log.some((x) => x.startsWith('click:'))).toBe(false);
  });

  it('altri errori di share (TypeError, DataError…) → download', async () => {
    for (const name of ['TypeError', 'DataError', 'InvalidStateError']) {
      const f = fakeEnv({ ua: UA_IPHONE, share: async () => { throw err(name); } });
      const r = await deliverFile(blob, XLSX, f.env);
      expect(r.result).toBe('downloaded');
      expect(r.shareError.name).toBe(name);
    }
  });
});

describe('Download', () => {
  it('link <a> con download = nome del file, aggiunto alla pagina, cliccato, tolto; indirizzo liberato dopo 60 secondi', async () => {
    const f = fakeEnv({ touch: false });
    await deliverFile(blob, XLSX, f.env);
    expect(f.log).toEqual(['url', 'create:a', 'append', 'click:' + XLSX + ':blob:fake/1:true', 'remove']);
    expect(f.log.some((x) => x.startsWith('revoke'))).toBe(false);   // non subito
    expect(f.timers).toHaveLength(1);
    expect(f.timers[0].ms).toBe(60000);
    expect(REVOKE_AFTER_MS).toBe(60000);
    f.timers[0].f();
    expect(f.log[f.log.length - 1]).toBe('revoke:blob:fake/1');
    expect(f.body.children).toHaveLength(0);
  });

  it('download che non riesce: errore con il nome (mai in silenzio), link tolto lo stesso', async () => {
    const f = fakeEnv({ touch: false, click: () => { throw err('SecurityError', 'blocked'); } });
    await expect(deliverFile(blob, XLSX, f.env)).rejects.toMatchObject({ downloadError: { name: 'SecurityError' } });
    expect(f.body.children).toHaveLength(0);
    expect(f.timers).toHaveLength(1);
    const g = fakeEnv({ touch: false, createObjectURL: () => { throw err('QuotaExceededError'); } });
    await expect(deliverFile(blob, XLSX, g.env)).rejects.toMatchObject({ downloadError: { name: 'QuotaExceededError' } });
  });

  it('share fallito e poi anche il download: l\'errore porta tutti e due i motivi', async () => {
    const f = fakeEnv({ ua: UA_IPHONE, fresh: true, share: async () => { throw err('NotAllowedError'); }, click: () => { throw err('SecurityError'); } });
    const e = await deliverFile(blob, XLSX, f.env).catch((x) => x);
    expect(e.downloadError.name).toBe('SecurityError');
    expect(e.shareError.name).toBe('NotAllowedError');
  });

  it('downloadBlob da solo: stesso comportamento', () => {
    const f = fakeEnv();
    downloadBlob(blob, 'x.xlsx', f.env);
    expect(f.log).toContain('click:x.xlsx:blob:fake/1:true');
    expect(f.timers[0].ms).toBe(60000);
  });

  it('nome dell\'errore per il messaggio', () => {
    expect(errorLabel(err('NotAllowedError', 'Permission denied'))).toBe('NotAllowedError (Permission denied)');
    expect(errorLabel(err('AbortError'))).toBe('AbortError');
    expect(errorLabel(null)).toBe('Error');
    expect(LANGS.it.downloadErr('SecurityError')).toBe('Download non riuscito: SecurityError');
    expect(LANGS.en.downloadErr('SecurityError')).toBe('Download failed: SecurityError');
    expect(LANGS.it.downloadStarted(XLSX)).toBe('Download avviato: ' + XLSX);
  });
});

describe('Pagina (main.js)', () => {
  const main = read('src/main.js');

  it('tasto viola: tocco nuovo (fresh = true); export: primo tentativo (fresh = false)', () => {
    expect(main).toMatch(/async function shareReady\(\)[\s\S]*?deliver\(R\.blob, R\.name, true\)/);
    expect(main).toMatch(/async function exportHistory\(\)[\s\S]*?deliver\(blob, name, false\)/);
  });

  it('mai in silenzio: download non riuscito → messaggio con il nome; download avviato → avviso', () => {
    const d = (main.match(/async function deliver\([\s\S]*?\n}\n/) || [''])[0];
    expect(d).toContain('T.downloadErr(errorLabel(');
    expect(d).toContain('T.downloadStarted(name)');
    expect(d).toContain("ls.set('noShare', '1')");
  });

  it('niente window.open e niente pagine nuove in tutta l\'app', () => {
    for (const f of fs.readdirSync(path.join(appDir, 'src')).filter((x) => x.endsWith('.js'))) {
      const src = read('src/' + f);
      expect(src).not.toMatch(/window\.open\(|location\.(href|assign)\s*[=(]|target="_blank"/);
    }
  });
});
