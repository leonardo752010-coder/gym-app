// Prova locale della pagina della web app con dati finti (nessun Google, nessun foglio).
// Uso:  npm i playwright && npx playwright install chromium  (se non già presenti)
//       node tests/render-check.js
// Crea screenshot in tests/out/ e stampa eventuali errori JavaScript.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'apps-script/gym-sheet/web-app.html'), 'utf8');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

// lang = 'it' (Leonardo, nessuna chiave) oppure 'en' (chiave personale)
function page(lang) {
  return src
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="../mock.js"></script>')
    .replace("const GYM_KEY = '__GYM_KEY__';", "const GYM_KEY = '" + (lang === 'en' ? 'test-key' : '') + "';");
}

(async () => {
  const browser = await chromium.launch();
  const cases = [
    ['it-night-cover', 'it', 'dark', 412, 1000, false],
    ['it-day-cover', 'it', 'light', 412, 1000, false],
    ['en-night-open', 'en', 'dark', 884, 800, false],
    ['it-edit-set', 'it', 'dark', 412, 1000, true],
  ];
  let failed = 0;
  for (const [name, lang, scheme, w, h, edit] of cases) {
    const file = path.join(out, name + '.html');
    fs.writeFileSync(file, page(lang));
    const p = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + file);
    await p.waitForTimeout(800);
    if (edit) { await p.click('.done'); await p.waitForTimeout(200); }
    await p.screenshot({ path: path.join(out, name + '.png') });
    console.log(name, errs.length ? 'ERRORI: ' + errs.join(' | ') : 'ok');
    if (errs.length) failed++;
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
