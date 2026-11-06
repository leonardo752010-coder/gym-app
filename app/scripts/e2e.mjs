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
  // Lettura dello starter bloccata (come se online la colonna non ci fosse ancora): la seduta deve funzionare lo stesso.
  const starterRead = (u) => /\/rest\/v1\/profiles\?/.test(u.toString()) && /select=starter/.test(u.toString());
  await ctx.route(starterRead, (r) => r.abort('failed'));
  await page.fill('#pass', password);
  await page.click('#loginBtn');
  await page.waitForSelector('.card', { timeout: 15000 });
  check('dentro: seduta di oggi', true);
  await page.waitForFunction(() => window.__gym.S.lastRefresh > 0, null, { timeout: 15000 });
  check('starter non leggibile: niente schermata, seduta normale', !(await page.$('#starterScr')) && !!(await page.$('.card')));
  await page.reload();
  await page.waitForSelector('.card', { timeout: 15000 });
  await page.waitForFunction(() => window.__gym.S.lastRefresh > 0, null, { timeout: 15000 });
  check('copia sul telefono senza risposta del server sullo starter: niente schermata', !(await page.$('#starterScr')));
  await ctx.unroute(starterRead);

  console.log('1b. CHOOSE YOUR STARTER (una volta sola, scelta offline)');
  await page.reload();
  await page.waitForSelector('#starterScr', { timeout: 15000 });
  check('il server dice "vuoto": schermata a tutto schermo', (await page.textContent('#starterScr h1')) === 'CHOOSE YOUR STARTER' && !(await page.$('#wrap')));
  check('tre carte, Conferma spenta finché non si tocca', (await page.$$('[data-pick]')).length === 3 && (await page.isDisabled('#starterOk')));
  { await page.waitForFunction(() => [...document.querySelectorAll('.stCard img')].every((i) => i.complete && i.naturalWidth > 0));
    const imgs = await page.$$eval('.stCard img', (els) => els.map((i) => ({ src: i.getAttribute('src'), nw: i.naturalWidth, nh: i.naturalHeight, fit: getComputedStyle(i).objectFit, w: i.clientWidth })));
    check('mascotte PNG caricate, proporzioni intatte (object-fit: contain)', imgs.length === 3 && imgs.every((i) => /\/assets\/(gorilla|lion|tiger)-[^/]+\.png$/.test(i.src) && i.nh === 480 && i.fit === 'contain' && i.w >= 80),
      imgs.map((i) => i.nw + 'x' + i.nh + ' ' + i.w + 'px').join(', ')); }
  await page.screenshot({ path: path.join(out, '11-starter.png'), fullPage: true });
  await ctx.setOffline(true);
  await page.click('[data-pick=lion]');
  check('tocco: carta scelta, Conferma accesa', (await page.getAttribute('[data-pick=lion]', 'aria-pressed')) === 'true' && !(await page.isDisabled('#starterOk')));
  await page.click('#starterOk');
  await page.waitForSelector('.card');
  const st = () => page.evaluate(() => window.__gym.S.starter);
  const srvStarter = async () => (await admin.from('profiles').select('starter').eq('id', ref.userId).single()).data.starter;
  check('offline: scelta salvata sul telefono, in attesa di invio', (await st()).value === 'lion' && (await st()).pending === true && (await srvStarter()) === null);
  await page.click('#logo');
  await page.click('#mOut');
  await page.waitForTimeout(300);
  check('"Esci" bloccato finché la scelta non è inviata', !(await page.$('#loginForm')) && /internet/i.test(await page.textContent('#toast')));
  await page.click('#mClose');
  await ctx.setOffline(false);
  await waitSync('ok');
  check('rete tornata: starter scritto online (lion), telefono allineato', (await srvStarter()) === 'lion' && (await st()).pending === false);
  await page.reload();
  await page.waitForSelector('.card', { timeout: 15000 });
  await page.waitForFunction(() => window.__gym.S.lastRefresh > 0, null, { timeout: 15000 });
  check('riaperta: la schermata non torna', !(await page.$('#starterScr')));
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
  check('menu: piccola immagine dello starter accanto ad Account', (await page.getAttribute('#menuStarter', 'alt')) === 'Leone' && /\/assets\/lion-[^/]+\.png$/.test(await page.getAttribute('#menuStarter', 'src')) &&
    (await page.$eval('#menuStarter', (i) => i.complete && i.naturalWidth > 0 && getComputedStyle(i).objectFit === 'contain')));
  await page.screenshot({ path: path.join(out, '12-menu-starter.png') });
  await page.click('#mOut');
  await page.waitForSelector('#loginForm');
  check('uscita: torna all\'accesso', true);
  check('nessun errore JavaScript', errors.length === 0, errors.join(' | '));

  console.log('9. Doppia apertura lo stesso giorno');
  // Di nuovo dentro (serve la rete): oggi c'è Upper A lasciato a metà (panca 1 serie su 2).
  await page.fill('#email', email);
  await page.fill('#pass', password);
  await page.click('#loginBtn');
  await page.waitForSelector('.done', { timeout: 15000 });
  const localSessions = (p = page) => p.evaluate(() => [...window.__gym.S.local.rows.values()].filter((r) => r.table === 'sessions' && !r.data.deleted_at).map((r) => r.data));
  const nBefore = (await localSessions()).length;
  check('riaperta: propone Upper A, la seduta di oggi con la sua serie', (await page.textContent('.day.on')).startsWith('Upper A') && (await page.$$('.done')).length === 1);
  const page2 = await ctx.newPage();
  await page2.goto(URL_APP);
  await page2.waitForSelector('.done', { timeout: 15000 });
  check('seconda apertura (altra scheda): stessa seduta, stessa serie', (await page2.textContent('.day.on')).startsWith('Upper A') && (await page2.$$('.done')).length === 1);
  await page2.close();
  check('aprire l\'app non crea sedute', (await localSessions()).length === nBefore, nBefore + ' sedute');

  console.log('10. Settimana dopo, senza rete (orologio del browser + 7 giorni)');
  // Rete bloccata fino alla fine: le serie con date future restano solo nel browser di prova (che poi si chiude).
  await ctx.route(s.url + '/**', (r) => r.abort('internetdisconnected'));
  await ctx.setOffline(true);
  const [ty, tm, td] = today.split('-').map(Number);
  const week = addDays(today, 7);
  await page.clock.setFixedTime(new Date(ty, tm - 1, td + 7, 18, 0));
  await page.reload();
  await page.waitForSelector('.card', { timeout: 5000 });
  check('l\'app vede la data della settimana dopo', (await page.evaluate(() => window.__gym.S.date)) === week);
  check('giorno proposto = Lower A (Upper A lasciato a metà conta come fatto)', (await page.textContent('.day.on')).startsWith('Lower A'));
  await page.click('.day:has-text("Upper A")');
  await page.waitForSelector('#last');
  check('Upper A la settimana dopo: schermata vuota', (await page.$$('.done')).length === 0);
  const lastW = (await page.textContent('#last')).replace(/\s+/g, ' ');
  check('volta scorsa = la serie della settimana prima (82,5 × 6)', /82,5 × 6/.test(lastW), lastW);
  check('aprire non crea sedute nemmeno la settimana dopo', (await localSessions()).length === nBefore);
  await page.click('#save');
  await page.waitForSelector('.done');
  let ls2 = await localSessions();
  check('serie salvata offline in una seduta nuova con la data nuova', ls2.length === nBefore + 1 && ls2.some((x) => x.session_date === week), ls2.map((x) => x.session_date).join(','));
  const oldSet = await page.evaluate((d) => {
    const rows = [...window.__gym.S.local.rows.values()];
    const ses = rows.find((r) => r.table === 'sessions' && r.data.session_date === d && r.data.plan_day_id);
    const se = rows.filter((r) => r.table === 'session_exercises' && r.data.session_id === (ses && ses.id)).map((r) => r.id);
    return rows.filter((r) => r.table === 'sets' && se.includes(r.data.session_exercise_id)).map((r) => [Number(r.data.weight_kg), r.data.reps, !!r.data.deleted_at]).sort((a, b) => a[2] - b[2]);
  }, today);
  check('seduta della settimana prima intatta (82,5 × 6 e la serie cancellata prima)', JSON.stringify(oldSet) === JSON.stringify([[82.5, 6, false], [82.5, 6, true]]), JSON.stringify(oldSet));

  console.log('11. A cavallo della mezzanotte, senza rete');
  await page.clock.setFixedTime(new Date(ty, tm - 1, td + 8, 23, 50));
  await page.reload();
  await page.waitForSelector('.card', { timeout: 5000 });
  await page.click('.day:has-text("Lower B")');
  await page.waitForSelector('#save');
  await page.click('#save');
  await page.waitForSelector('.done');
  await page.clock.setFixedTime(new Date(ty, tm - 1, td + 9, 0, 20));
  await page.reload();
  await page.waitForSelector('.card', { timeout: 5000 });
  check('alle 00:20 propone ancora Lower B con la serie delle 23:50', (await page.textContent('.day.on')).startsWith('Lower B') && (await page.$$('.done')).length === 1);
  await page.click('#save');
  await page.waitForFunction(() => document.querySelectorAll('.done').length === 2);
  ls2 = await localSessions();
  check('stessa seduta (nessuna seduta nuova dopo mezzanotte)', ls2.length === nBefore + 2, ls2.map((x) => x.session_date).join(','));
  await page.clock.setFixedTime(new Date(ty, tm - 1, td + 9, 4, 0));
  await page.reload();
  await page.waitForSelector('.card', { timeout: 5000 });
  check('alle 4:00 la seduta è passata: propone il giorno dopo (Upper A)', (await page.textContent('.day.on')).startsWith('Upper A'));
  await page.click('.day:has-text("Lower B")');
  await page.waitForSelector('#last');
  check('alle 4:00 Lower B parte vuoto, con la volta scorsa', (await page.$$('.done')).length === 0);
  { const fut = (await admin.from('sessions').select('id').eq('user_id', ref.userId).gt('session_date', today)).data; check('online (database locale) nessuna seduta con data futura', fut.length === 0); }

  console.log('12. Fine seduta: due telefoni, online e offline (orologio vero)');
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'it-IT', hasTouch: true, isMobile: true });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL_APP);
    await p.fill('#email', email); await p.fill('#pass', password); await p.click('#loginBtn');
    await p.waitForSelector('.card', { timeout: 15000 });
    return { c, p };
  };
  const sync = (p) => p.waitForFunction(() => document.body.dataset.sync === 'ok', null, { timeout: 15000 });
  const toDay = async (p, name) => { await p.click('.day:has-text("' + name + '")'); await p.waitForSelector('.card'); };
  const upperB = async () => {
    const day = (await admin.from('plan_days').select('id').eq('user_id', ref.userId).eq('name', 'Upper B')).data[0].id;
    return (await admin.from('sessions').select('id, ended_at, started_at').eq('user_id', ref.userId).eq('session_date', today).eq('plan_day_id', day).order('started_at')).data;
  };
  const A = await phone(), B = await phone();
  await toDay(A.p, 'Upper B');
  check('senza serie: nessun tasto Fine seduta', !(await A.p.$('#endSession')));
  await A.p.click('#save');
  await A.p.waitForSelector('#endSession');
  { const sv = await A.p.$('#save').then((e) => e.boundingBox()), nb = await A.p.$('.navrow').then((e) => e.boundingBox()), eb = await A.p.$('#endSession').then((e) => e.boundingBox());
    check('Fine seduta in fondo, staccato da Salva e Prossimo (≥ 40 px)', eb.y - (nb.y + nb.height) >= 40 && eb.y > sv.y + sv.height + 40, Math.round(eb.y - (nb.y + nb.height)) + ' px'); }
  { await A.p.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const r = await A.p.evaluate(() => { const e = document.getElementById('endSession').getBoundingClientRect(), t = document.getElementById('timer');
      return { visible: !t.classList.contains('hide'), endBottom: e.bottom, timerTop: t.getBoundingClientRect().top, vh: innerHeight }; });
    check('in fondo alla pagina Fine seduta resta ≥ 40 px sopra il timer', r.visible && r.timerTop - r.endBottom >= 40 && r.endBottom <= r.vh, JSON.stringify(r));
    await A.p.screenshot({ path: path.join(out, '08-fine-seduta.png') }); }
  await sync(A.p);
  await A.p.click('#endSession');
  await A.p.waitForSelector('#closedBar');
  check('chiusa: schermata vuota, "Riapri" visibile, la serie è la volta scorsa', (await A.p.$$('.done')).length === 0 && await A.p.isVisible('#reopen') && /Volta scorsa/.test(await A.p.textContent('#last')));
  await A.p.screenshot({ path: path.join(out, '09-seduta-chiusa.png'), fullPage: true });
  await sync(A.p);
  let ub = await upperB();
  check('online: una seduta, chiusa (ended_at), serie non cancellata', ub.length === 1 && !!ub[0].ended_at &&
    (await admin.from('sets').select('id').eq('user_id', ref.userId).is('deleted_at', null).gte('created_at', START)).data.length >= 1);
  await B.p.evaluate(() => window.__gym.refresh());
  await toDay(B.p, 'Upper B');
  check('l\'altro telefono la vede chiusa dopo la sincronizzazione', (await B.p.$$('.done')).length === 0 && await B.p.isVisible('#closedBar'));
  await A.p.click('#reopen');
  await A.p.waitForSelector('.done');
  await sync(A.p);
  check('Riapri: serie di nuovo nella seduta; online ended_at vuoto', (await A.p.$$('.done')).length === 1 && (await upperB())[0].ended_at === null);
  await B.p.evaluate(() => window.__gym.refresh());
  await B.p.waitForSelector('#endSession');
  await A.p.click('#endSession'); await B.p.click('#endSession');
  await A.p.waitForSelector('#closedBar'); await B.p.waitForSelector('#closedBar');
  await sync(A.p); await sync(B.p);
  ub = await upperB();
  check('chiusa su tutti e due i telefoni: una sola seduta, chiusa, nessun errore di invio', ub.length === 1 && !!ub[0].ended_at, JSON.stringify(ub.map((x) => !!x.ended_at)));
  const firstEnd = ub[0].ended_at;
  // offline: riapro, aggiungo una serie e richiudo senza rete; l'app si riapre senza rete; poi torna la rete
  await A.c.route(s.url + '/**', (r) => r.abort('internetdisconnected'));
  await A.c.setOffline(true);
  await A.p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await A.p.click('#reopen');
  await A.p.waitForSelector('#save');
  await A.p.click('#save');
  await A.p.waitForFunction(() => document.querySelectorAll('.done').length === 2);
  await A.p.click('#endSession');
  await A.p.waitForSelector('#closedBar');
  await A.p.reload();
  await A.p.waitForSelector('.card', { timeout: 5000 });
  await toDay(A.p, 'Upper B');
  check('offline: chiusa anche dopo la riapertura dell\'app, in coda', await A.p.isVisible('#closedBar') && Number(await A.p.evaluate(() => document.body.dataset.pending)) >= 2);
  check('offline: online non è cambiato niente', (await upperB())[0].ended_at === firstEnd);
  await A.c.unroute(s.url + '/**');
  await A.c.setOffline(false);
  await A.p.evaluate(() => window.dispatchEvent(new Event('online')));
  await sync(A.p);
  ub = await upperB();
  check('rete tornata: stessa seduta chiusa di nuovo, 2 serie, nessun doppione', ub.length === 1 && !!ub[0].ended_at && ub[0].ended_at !== firstEnd);
  await A.p.click('#save');
  await A.p.waitForSelector('#endSession');
  await sync(A.p);
  ub = await upperB();
  const oldSets = (await admin.from('session_exercises').select('sets(id, deleted_at)').eq('session_id', ub[0].id)).data.flatMap((x) => x.sets);
  check('serie dopo la chiusura: seduta nuova aperta; la vecchia resta chiusa con le sue 2 serie', ub.length === 2 && !!ub[0].ended_at && ub[1].ended_at === null &&
    oldSets.length === 2 && oldSets.every((x) => !x.deleted_at) && !(await A.p.$('#closedBar')), ub.length + ' sedute');
  await A.c.close(); await B.c.close();

  console.log('13. Telefono in una lingua non prevista (cinese): inglese');
  { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', hasTouch: true, isMobile: true });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL_APP);
    await p.waitForSelector('#loginForm');
    check('accesso in inglese, pagina con lang="en"', (await p.textContent('h1')) === 'Sign in' && (await p.getAttribute('html', 'lang')) === 'en');
    await p.fill('#email', email); await p.fill('#pass', password); await p.click('#loginBtn');
    await p.waitForSelector('.card', { timeout: 15000 });
    const [y, mo, d] = today.split('-').map(Number);
    const dayTxt = new Date(y, mo - 1, d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }).toUpperCase();
    check('seduta in inglese, data giorno-mese, kg', (await p.textContent('.btitle')) === 'WORKOUT' && (await p.textContent('#dateTxt')) === 'TODAY · ' + dayTxt &&
      (await p.textContent('#unitSeg .on')) === 'kg', await p.textContent('#dateTxt'));
    const body = await p.textContent('body');
    check('nessuna parola italiana dell\'app sullo schermo', !/\b(Serie|Salva|Volta scorsa|Prossimo|Oggi|Fine seduta|Suggerito)\b/.test(body));
    await p.screenshot({ path: path.join(out, '10-inglese.png'), fullPage: true });
    await c.close(); }
  check('nessun errore JavaScript (fine)', errors.length === 0, errors.join(' | '));
} catch (e) {
  ko++; console.log('  ERRORE', e.message);
} finally {
  if (browser) await browser.close();
  server.kill();
  if (ref) await deleteFakeAthlete(admin, ref.userId);
}
console.log(`\nPROVA NEL BROWSER: ${ok} ok, ${ko} no. Screenshot in app/tests/out/`);
process.exit(ko ? 1 : 0);
