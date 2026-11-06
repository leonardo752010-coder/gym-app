// Prova completa nel browser (Chromium, schermo da telefono) sull'app costruita, con il database LOCALE.
// Uso: npm run test:e2e   (serve: npx supabase start). Crea un atleta finto e lo cancella alla fine.
// Screenshot in tests/out/.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { appDir, writeEnvLocale } from './locale.mjs';
import { adminClient, createFakeAthlete, deleteFakeAthlete, randomPassword } from './finti-lib.mjs';
import { localDate, addDays } from '../src/logic.js';

const out = path.join(appDir, 'tests', 'out');
fs.mkdirSync(out, { recursive: true });
const s = writeEnvLocale();
const admin = adminClient(s);
const today = localDate();
const email = `prova.e2e.${Date.now().toString(36)}@example.test`, password = randomPassword();
let ok = 0, ko = 0;
let START;
const check = (name, cond, extra = '') => { cond ? ok++ : ko++; console.log((cond ? '  ok   ' : '  NO   ') + name + (extra ? '  (' + extra + ')' : '')); };

console.log('Build (modo locale)…');
execSync('npx vite build --mode locale --logLevel warn', { cwd: appDir, stdio: 'inherit' });
const server = spawn(process.execPath, [path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '4173', '--strictPort'], { cwd: appDir, stdio: 'ignore' });
const URL_APP = 'http://localhost:4173/';
let browser, ref;
try {
  for (let i = 0; i < 50; i++) { try { await fetch(URL_APP); break; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  ref = await createFakeAthlete(admin, { email, password, today });
  START = new Date().toISOString();   // solo le serie create dall'app durante la prova
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'it-IT', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/.test(m.text()) && !/grant_type=password/.test(m.location().url || '')) errors.push(m.text() + ' @ ' + (m.location().url || '').slice(0, 120)); });
  const syncState = () => page.evaluate(() => document.body.dataset.sync);
  const waitSync = async (st, ms = 15000) => { try { await page.waitForFunction((x) => document.body.dataset.sync === x, st, { timeout: ms }); } catch (e) { const info = await page.evaluate(() => ({ sync: document.body.dataset.sync, rows: window.__gym.S.local.dirtyRows().map((r) => r.table + ':' + (r.error || '-')) })); throw new Error('sync non ' + st + ': ' + JSON.stringify(info) + ' | ' + (await page.evaluate(() => window.__gym.LOG.join(' | ')))); } };
  page.on('response', async (r) => { if (r.status() >= 400 && r.url().startsWith(s.url)) console.log('   risposta', r.status(), r.request().method(), r.url().slice(s.url.length, s.url.length + 60), (await r.text().catch(() => '')).slice(0, 200)); });
  const serverSets = async () => (await admin.from('sets').select('id, set_number, weight_kg, reps, rir, deleted_at, session_exercise_id').eq('user_id', ref.userId).gte('created_at', START).order('set_number')).data;

  console.log('1. Accesso');
  await page.goto(URL_APP);
  await page.screenshot({ path: path.join(out, '01-accesso.png') });
  await page.fill('#email', email);
  await page.fill('#pass', 'sbagliata');
  await page.click('#loginBtn');
  await page.waitForFunction(() => document.getElementById('loginMsg').textContent.length > 0);
  check('password sbagliata rifiutata', /sbagliat/i.test(await page.textContent('#loginMsg')));
  await page.fill('#pass', password);
  await page.click('#loginBtn');
  await page.waitForSelector('.card', { timeout: 15000 });
  check('dentro: seduta di oggi', true);
  check('giorno proposto = Upper B (dopo Lower A di ieri)', (await page.textContent('.day.on')).startsWith('Upper B'));
  await page.screenshot({ path: path.join(out, '02-seduta-notte.png'), fullPage: true });

  console.log('2. Volta scorsa e suggerimento (Upper A, panca)');
  await page.click('.day:has-text("Upper A")');
  await page.waitForSelector('#sugg');
  const sugg = await page.textContent('#sugg'), last = await page.textContent('#last');
  check('suggerimento 82,5 kg × 6 (range chiuso)', /82,5 kg × 6/.test(sugg), sugg);
  check('volta scorsa: 80 × 10, 80 × 10, senza la serie cancellata', /80 × 10.*80 × 10/.test(last) && !/999/.test(last), last.replace(/\s+/g, ' '));
  check('macchina e salto di peso visibili', /Marca Finta · Incline Press · MF-10.*salto 2,5 kg/.test(await page.textContent('.mac')));
  check('campo peso già compilato col suggerimento', (await page.inputValue('#inKg')) === '82,5');
  await page.click('[data-st=weight][data-d="1"]');
  check('+ usa il salto della macchina (85)', (await page.inputValue('#inKg')) === '85');
  await page.click('[data-st=weight][data-d="-1"]');

  console.log('3. Registrare una serie (online)');
  await page.click('#save');
  await page.waitForSelector('.done');
  const p1 = await page.evaluate(() => window.__gymPerf);
  check('serie salvata sul telefono in < 1 s', p1.saveEnd - p1.saveStart < 1000, (p1.saveEnd - p1.saveStart) + ' ms');
  check('schermo aggiornato in < 1 s', p1.saveRendered - p1.saveStart < 1000, (p1.saveRendered - p1.saveStart) + ' ms');
  check('timer di recupero partito', await page.isVisible('#timer'));
  await waitSync('ok');
  let sv = await serverSets();
  check('online: 1 serie', sv.length === 1 && Number(sv[0].weight_kg) === 82.5 && sv[0].reps === 6, JSON.stringify(sv.map((x) => [x.set_number, x.weight_kg, x.reps])));

  console.log('4. Offline: registrare, riaprire l\'app, modificare');
  // Senza rete: il browser offline (la pagina deve arrivare dalla cache) e in più ogni richiesta a Supabase bloccata
  // (il browser di prova lascia passare le richieste del service worker anche offline).
  await ctx.route(s.url + '/**', (r) => r.abort('internetdisconnected'));
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.fill('#inReps', '5');
  await page.click('#save');
  await page.waitForFunction(() => document.querySelectorAll('.done').length === 2);
  check('serie 2 salvata offline', ['offline', 'pending'].includes(await syncState()), await syncState());
  check('segno "da inviare" sulla serie', (await page.$$('.done .pend')).length >= 1);
  await page.screenshot({ path: path.join(out, '03-offline.png'), fullPage: true });
  await page.reload();
  await page.waitForSelector('.card', { timeout: 5000 });
  const open = await page.evaluate(() => window.__gymPerf.firstRender);
  check('riaperta senza rete (dalla cache) in < 1 s', open < 1000, open + ' ms');
  check('riaperta sul giorno scelto (Upper A), già sull\'esercizio successivo', (await page.textContent('.day.on')).startsWith('Upper A') && /Lat/i.test(await page.textContent('.ex')));
  await page.click('.bar [data-idx="0"]');
  await page.waitForSelector('.done');
  check('dopo la riapertura le 2 serie ci sono ancora', (await page.$$('.done')).length === 2);
  await page.click('.done >> nth=1');
  await page.waitForSelector('#update');
  await page.click('[data-st=reps][data-d="1"]');
  await page.click('[data-rir="1"]');
  await page.screenshot({ path: path.join(out, '04-modifica-serie.png'), fullPage: true });
  await page.click('#update');
  await page.waitForFunction(() => !document.getElementById('update'));
  check('serie 2 modificata offline (6 rep)', /× 6/.test(await page.textContent('.done >> nth=1')));
  { const n = (await serverSets()).length; check('online ancora 1 serie (niente inviato offline)', n === 1, n + ' online'); }

  console.log('5. Torna la rete: sincronizzazione senza doppioni');
  if (process.env.E2E_DEBUG) { const t0 = Date.now(); page.on('request', (r) => r.url().startsWith(s.url) && console.log('   req', Date.now() - t0, r.method(), r.url().slice(22, 90))); page.on('requestfailed', (r) => r.url().startsWith(s.url) && console.log('   fail', Date.now() - t0, r.url().slice(22, 90), r.failure().errorText)); page.on('requestfinished', (r) => r.url().startsWith(s.url) && console.log('   done', Date.now() - t0, r.url().slice(22, 90))); }
  await ctx.unroute(s.url + '/**');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitSync('ok');
  sv = await serverSets();
  check('online: 2 serie, la seconda con la modifica', sv.length === 2 && sv[1].reps === 6 && Number(sv[1].rir) === 1, JSON.stringify(sv.map((x) => [x.set_number, Number(x.weight_kg), x.reps, Number(x.rir)])));
  check('una sola seduta oggi', (await admin.from('sessions').select('id').eq('user_id', ref.userId).eq('session_date', today)).data.length === 1);
  await page.evaluate(() => window.__gym.syncNow());
  await page.evaluate(() => window.__gym.refresh());
  check('reinviare non crea doppioni', (await serverSets()).length === 2);

  console.log('6. Elimina una serie (cancellazione morbida)');
  await page.click('.done >> nth=1');
  await page.click('#delSet');
  await page.click('#fYes');
  await page.waitForFunction(() => document.querySelectorAll('.done').length === 1);
  for (let i = 0; i < 50; i++) { sv = await serverSets(); if (sv[1] && sv[1].deleted_at) break; await page.waitForTimeout(200); }
  check('serie 2 cancellata con deleted_at, non tolta dal database', sv.length === 2 && sv[1].deleted_at);

  console.log('7. Giorno, peso sospetto, menu');
  await page.click('.day:has-text("Lower A")');
  await page.waitForSelector('.card');
  await page.fill('#inKg', '400');
  await page.click('#save');
  check('peso sospetto: chiede conferma', await page.isVisible('.sheet'));
  await page.click('#fNo');
  await page.click('#themeBtn');
  await page.screenshot({ path: path.join(out, '05-seduta-giorno.png'), fullPage: true });
  await page.click('#themeBtn');
  await page.click('#logo');
  await page.waitForSelector('.sheet');
  await page.screenshot({ path: path.join(out, '06-menu.png') });
  check('menu: account e memoria del telefono', (await page.textContent('.sheet')).includes(email));
  await page.click('#mClose');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.screenshot({ path: path.join(out, '07-tablet.png') });
  await page.setViewportSize({ width: 390, height: 844 });

  console.log('8. Uscita');
  await page.click('#logo');
  await page.click('#mOut');
  await page.waitForSelector('#loginForm');
  check('uscita: torna all\'accesso', true);
  check('nessun errore JavaScript', errors.length === 0, errors.join(' | '));
} catch (e) {
  ko++; console.log('  ERRORE', e.message);
} finally {
  if (browser) await browser.close();
  server.kill();
  if (ref) await deleteFakeAthlete(admin, ref.userId);
}
console.log(`\nPROVA NEL BROWSER: ${ok} ok, ${ko} no. Screenshot in app/tests/out/`);
process.exit(ko ? 1 : 0);
