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
// Supabase online (gym-app) sempre bloccato: la prova usa solo il database locale. Conta i tentativi (devono essere 0).
const ONLINE_HOST = 'https://kclgcqwmvqqkogkhycgb.supabase.co';
let onlineHits = 0;
const blockOnline = (c) => c.route(ONLINE_HOST + '/**', (r) => { onlineHits++; return r.abort('blockedbyclient'); });
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
  await blockOnline(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/.test(m.text()) && !/grant_type=password/.test(m.location().url || '')) errors.push(m.text() + ' @ ' + (m.location().url || '').slice(0, 120)); });
  const syncState = () => page.evaluate(() => document.body.dataset.sync);
  const waitSync = async (st, ms = 15000) => { try { await page.waitForFunction((x) => document.body.dataset.sync === x, st, { timeout: ms }); } catch (e) { const info = await page.evaluate(() => ({ sync: document.body.dataset.sync, rows: window.__gym.S.local.dirtyRows().map((r) => r.table + ':' + (r.error || '-')) })); throw new Error('sync non ' + st + ': ' + JSON.stringify(info) + ' | ' + (await page.evaluate(() => window.__gym.LOG.join(' | ')))); } };
  page.on('response', async (r) => { if (r.status() >= 400 && r.url().startsWith(s.url)) console.log('   risposta', r.status(), r.request().method(), r.url().slice(s.url.length, s.url.length + 60), (await r.text().catch(() => '')).slice(0, 200)); });
  // Layout di Allenamento: workout a tendina (#dayBtn), menu "..." (#moreBtn) con luna, kg/lb, Account e Fine seduta.
  const pickDay = async (p, name) => { await p.click('#dayBtn'); await p.click('.popt:has-text("' + name + '")'); await p.waitForSelector('#exv'); };
  const openMore = async (p) => { await p.click('#moreBtn'); await p.waitForSelector('.sheet.msheet'); };
  const openAccount = async (p) => { await openMore(p); await p.click('#mAccount'); await p.waitForSelector('#mOut'); };
  const toggleTheme = async (p) => { await openMore(p); await p.click('#mTheme'); await p.click('#moreClose'); };
  const endSes = async (p) => { await openMore(p); await p.click('#endSession'); };
  const hasEnd = async (p) => { await openMore(p); const r = !!(await p.$('#endSession')); await p.click('#moreClose'); return r; };
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
  await page.waitForSelector('#exv', { timeout: 15000 });
  check('dentro: seduta di oggi', true);
  await page.waitForFunction(() => window.__gym.S.lastRefresh > 0, null, { timeout: 15000 });
  check('starter non leggibile: niente schermata, seduta normale', !(await page.$('#starterScr')) && !!(await page.$('#exv')));
  await page.reload();
  await page.waitForSelector('#exv', { timeout: 15000 });
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
  await page.waitForSelector('#exv');
  const st = () => page.evaluate(() => window.__gym.S.starter);
  const srvStarter = async () => (await admin.from('profiles').select('starter').eq('id', ref.userId).single()).data.starter;
  check('offline: scelta salvata sul telefono, in attesa di invio', (await st()).value === 'lion' && (await st()).pending === true && (await srvStarter()) === null);
  await openAccount(page);
  await page.click('#mOut');
  await page.waitForTimeout(300);
  check('"Esci" bloccato finché la scelta non è inviata', !(await page.$('#loginForm')) && /internet/i.test(await page.textContent('#toast')));
  await page.click('#mClose');
  await ctx.setOffline(false);
  await waitSync('ok');
  check('rete tornata: starter scritto online (lion), telefono allineato', (await srvStarter()) === 'lion' && (await st()).pending === false);
  await page.reload();
  await page.waitForSelector('#exv', { timeout: 15000 });
  await page.waitForFunction(() => window.__gym.S.lastRefresh > 0, null, { timeout: 15000 });
  check('riaperta: la schermata non torna', !(await page.$('#starterScr')));
  check('giorno proposto = Upper B (dopo Lower A di ieri)', (await page.textContent('#dayName')).startsWith('Upper B'));
  await page.screenshot({ path: path.join(out, '02-seduta-notte.png'), fullPage: true });

  console.log('2. Volta scorsa e suggerimento (Upper A, panca)');
  await pickDay(page, 'Upper A');
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
  // prima di salvare: niente finestra del timer, solo il tasto viola
  const timerWin = () => page.evaluate(() => { const t = document.getElementById('timer'), cs = getComputedStyle(t), vis = (s) => { const e = t.querySelector(s); return !!e && e.getClientRects().length > 0; };
    return { clock: vis('.tclock'), close: vis('#tStop'), save: vis('.go'), bg: cs.backgroundColor, border: cs.borderTopColor }; });
  { const w = await timerWin();
    check('prima della serie: niente finestra del timer (né tempo né ✕), solo il tasto viola', !w.clock && !w.close && w.save && /rgba\(0, 0, 0, 0\)|transparent/.test(w.bg), JSON.stringify(w)); }
  await page.screenshot({ path: path.join(out, '16-timer-chiuso.png') });
  await page.click('#save');
  await page.waitForSelector('.sdone');
  const p1 = await page.evaluate(() => window.__gymPerf);
  check('serie salvata sul telefono in < 1 s', p1.saveEnd - p1.saveStart < 1000, (p1.saveEnd - p1.saveStart) + ' ms');
  check('schermo aggiornato in < 1 s', p1.saveRendered - p1.saveStart < 1000, (p1.saveRendered - p1.saveStart) + ' ms');
  check('timer di recupero partito', await page.isVisible('#timer') && !(await page.$('#timer.idle')));
  { const w = await timerWin(); check('dopo la serie: finestra del timer con tempo e ✕', w.clock && w.close && w.save, JSON.stringify(w)); }
  await waitSync('ok');
  let sv = await serverSets();
  check('online: 1 serie', sv.length === 1 && Number(sv[0].weight_kg) === 82.5 && sv[0].reps === 6, JSON.stringify(sv.map((x) => [x.set_number, x.weight_kg, x.reps])));

  const localRows = () => page.evaluate(() => JSON.stringify([...window.__gym.S.local.rows.values()].sort((a, b) => (a.id < b.id ? -1 : 1))));
  console.log('3a. Layout di Allenamento (workout a tendina, tabella, timer e tasto viola)');
  {
    const L = (f) => path.join(out, 'layout', f);
    fs.mkdirSync(path.join(out, 'layout'), { recursive: true });
    const rowsBefore = await localRows(), setsBefore = (await serverSets()).length;
    // misure dal browser: niente tagliato, tocchi ≥ 44 px, suggerimento e stato visibili, timer e barra che non coprono niente
    const measure = () => page.evaluate(() => {
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const small = qa('#dayBtn, #moreBtn, #exList, .arr, [data-st], [data-rir], #tStop, #save, #update, #tMinus, #tPlus, #notesBtn, .sdone')
        .filter(vis).map((e) => ({ id: e.id || e.dataset.st || e.className, ...R(e) })).filter((r) => r.w < 44 - 0.5 || r.h < 44 - 0.5);
      const clipped = qa('#exv .cell, #exv input, .dayBtn b, .ex, .tt b').filter(vis).filter((e) => e.scrollWidth > e.clientWidth + 1 && !(e.matches('.dayBtn b'))).map((e) => e.className || e.id || e.tagName);
      const s = q('#sugg'), sets = q('#sets'), t = q('#timer'), tabs = q('#tabs'), sync = q('#tsync');
      scrollTo(0, document.body.scrollHeight);
      const lastEl = [...q('#exv').children].filter(vis).pop();
      const bottom = { last: Math.round(R(lastEl).b), timerTop: Math.round(R(t).y) };
      scrollTo(0, 0);
      const kids = ['.tclock', '#tStop', '.go'].map((x) => R(q('#timer ' + x) || q(x)));
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        small, clipped,
        sugg: s ? { vis: vis(s), aboveTable: !sets || R(s).b <= R(sets).y, size: parseFloat(getComputedStyle(s.querySelector('.sv')).fontSize), color: getComputedStyle(s.querySelector('.sv')).color, inView: R(s.querySelector('.sv')).b <= R(t).y } : null,
        sync: vis(sync) && sync.textContent.length > 3 ? sync.textContent : null, syncTop: Math.round(R(sync).b),
        timerAboveTabs: R(t).b <= R(tabs).y + 0.5, notCovered: bottom.last <= bottom.timerTop, bottom,
        dockOverlap: kids[0].r > kids[1].x + 0.5 || kids[1].r > kids[2].x + 0.5 ||
          ['#tLab', '#tTxt'].some((x) => vis(q(x)) && vis(q('#tMinus')) && R(q(x)).r > R(q('#tMinus')).x + 0.5),
        numFont: Math.min(...qa('#exv .cell').filter(vis).map((e) => parseFloat(getComputedStyle(e.querySelector('input') || e).fontSize))),
      };
    });
    const layoutChecks = async (name, suggInView = true) => {
      const m = await measure();
      check(name + ': niente scorrimento laterale', !m.overflow);
      check(name + ': tasti (+/−, frecce, timer, salva, tendine) almeno 44 × 44 px', m.small.length === 0, JSON.stringify(m.small).slice(0, 300));
      check(name + ': numeri e nomi non tagliati', m.clipped.length === 0, m.clipped.join(','));
      check(name + ': numeri leggibili (≥ 18 px)', m.numFont >= 18, m.numFont + ' px');
      check(name + ': suggerimento viola, grande, sopra la tabella' + (suggInView ? ', numero visibile senza scorrere' : ''), !!m.sugg && m.sugg.vis && m.sugg.aboveTable && m.sugg.size >= 30 && (m.sugg.inView || !suggInView), JSON.stringify(m.sugg));
      check(name + ': stato di sincronizzazione visibile in alto', !!m.sync && m.syncTop < 120, m.sync);
      check(name + ': timer sopra la barra; in fondo alla pagina timer e barra non coprono niente', m.timerAboveTabs && m.notCovered, JSON.stringify(m.bottom));
      check(name + ': timer (scritte comprese), −15/+15, azzera e salva non si sovrappongono', !m.dockOverlap);
      return m;
    };
    // serie 1 fatta (cerchio viola con spunta), serie 2 da fare, timer che va
    check('tabella: 1 serie fatta, 1 in corso con caselle Kg e Rep', (await page.$$('.sdone')).length === 1 && (await page.$$('.scur #inKg')).length === 1);
    const m1 = await layoutChecks('notte 390 px');
    check('suggerimento in viola (colore del tasto Salva)', m1.sugg && m1.sugg.color === (await page.$eval('#save', (b) => getComputedStyle(b).backgroundColor)), m1.sugg && m1.sugg.color);
    await page.screenshot({ path: L('01-notte.png') });
    await page.screenshot({ path: L('01-notte-intera.png'), fullPage: true });
    // menu "...": data, luna, kg/lb, Account, Fine seduta
    await openMore(page);
    check('menu "...": data, luna, kg/lb, Account e Fine seduta', /OGGI · /.test(await page.textContent('#mDate')) && !!(await page.$('#mTheme')) &&
      (await page.textContent('#mUnit .on')) === 'kg' && !!(await page.$('#mAccount')) && !!(await page.$('#endSession')));
    await page.screenshot({ path: L('02-menu-altro.png') });
    await page.click('[data-mu=lb]');
    check('kg → lb dal menu: il suggerimento passa in lb', /lb/.test(await page.textContent('#sugg')) && (await page.textContent('#mUnit .on')) === 'lb');
    await page.click('[data-mu=kg]');
    await page.click('#mAccount');
    check('Account dal menu "...": versione, Invia ora, lingua, Esci', !!(await page.$('#verMenu')) && !!(await page.$('#mSync')) && !!(await page.$('#langSeg')) && !!(await page.$('#mOut')));
    await page.click('#mClose');
    // tendina dei workout
    await page.click('#dayBtn');
    check('tendina: i 4 giorni del piano, Upper A acceso con le serie fatte', (await page.$$('.popt')).length === 4 && /Upper A.*1\/\d/.test(await page.textContent('.popt.on')));
    await page.screenshot({ path: L('03-tendina-workout.png') });
    await page.click('#pClose');
    // elenco degli esercizi e frecce
    await page.click('#exList');
    check('elenco esercizi: tutti quelli del giorno', (await page.$$('[data-pidx]')).length >= 2);
    await page.screenshot({ path: L('04-elenco-esercizi.png') });
    const ex0 = await page.textContent('.ex');
    await page.click('[data-pidx="1"]');
    const ex1 = await page.textContent('.ex');
    check('elenco: tocco il secondo esercizio', ex1 !== ex0 && /2 di/.test(await page.textContent('#exList')), ex1);
    await page.click('.arr[data-go="-1"]');
    check('freccia ‹: torna al primo, con la sua serie', (await page.textContent('.ex')) === ex0 && (await page.$$('.sdone')).length === 1);
    check('freccia ‹ spenta sul primo esercizio', await page.isDisabled('.arr[data-go="-1"]'));
    await page.click('.arr[data-go="1"]');
    check('freccia ›: passa al secondo', (await page.textContent('.ex')) === ex1);
    await page.click('.arr[data-go="-1"]');
    // Note: solo dove il piano ha una nota (panca)
    check('tasto Note sulla panca (nota del piano), chiuso all\'inizio', await page.isVisible('#notesBtn') && !(await page.$('#notes')));
    await page.click('#notesBtn');
    check('Note: si apre la nota del piano', /Nota finta/.test(await page.textContent('#notes')));
    await page.click('#notesBtn');
    check('nessun tasto Storico e nessuna foto finta', !/storico/i.test(await page.textContent('#exv')) && (await page.$$('#exv img')).length === 0);
    // superserie (Upper B)
    await pickDay(page, 'Upper B');
    check('superserie: etichetta SUPERSET A sull\'esercizio', /SUPERSET A/.test(await page.textContent('#exv .ss')));
    await page.screenshot({ path: L('05-superserie.png') });
    await pickDay(page, 'Lower B'); await pickDay(page, 'Lower A'); await pickDay(page, 'Upper A');
    check('tornato su Upper A: stessa serie, stesso esercizio', (await page.$$('.sdone')).length === 1 && (await page.textContent('.ex')) === ex0);
    // giorno
    await toggleTheme(page);
    check('tema giorno attivo', (await page.getAttribute('html', 'data-theme')) === 'light');
    await layoutChecks('giorno 390 px');
    await page.screenshot({ path: L('06-giorno.png') });
    await page.click('#dayBtn'); await page.screenshot({ path: L('07-giorno-tendina.png') }); await page.click('#pClose');
    await openMore(page); await page.screenshot({ path: L('08-giorno-menu.png') }); await page.click('#moreClose');
    // schermo piccolo (320 × 568), notte e giorno, poi un nome lungo (solo in memoria, il piano sul telefono non cambia)
    await page.setViewportSize({ width: 320, height: 568 });
    await layoutChecks('giorno 320 px');
    await page.screenshot({ path: L('09-piccolo-giorno.png') });
    await toggleTheme(page);
    await layoutChecks('notte 320 px');
    await page.screenshot({ path: L('10-piccolo-notte.png') });
    await page.evaluate(() => { const pe = window.__gym.S.snap.plan.days.find((d) => d.name === 'Upper A').exercises[0]; window.__oldName = pe.exercise.name;
      pe.exercise.name = { it: 'Distensioni su panca inclinata con manubri, presa neutra e fermo al petto', en: 'Incline dumbbell press, neutral grip, paused at the chest' }; });
    await page.click('.arr[data-go="1"]'); await page.click('.arr[data-go="-1"]');
    await layoutChecks('nome lungo 320 px', false);
    await page.screenshot({ path: L('11-nome-lungo-piccolo.png') });
    await page.evaluate(() => { window.__gym.S.snap.plan.days.find((d) => d.name === 'Upper A').exercises[0].exercise.name = window.__oldName; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('.arr[data-go="1"]'); await page.click('.arr[data-go="-1"]');
    check('cambiare workout ed esercizio più volte non cambia nessun dato (telefono e online)', (await localRows()) === rowsBefore && (await serverSets()).length === setsBefore);
    // ✕: chiude la finestra del timer; resta il tasto viola, nessun dato cambia, e non torna dopo la riapertura
    await page.click('#tStop');
    { const w = await timerWin();
      check('✕: finestra del timer chiusa, resta solo il tasto viola (acceso)', !w.clock && !w.close && w.save && !(await page.isDisabled('#save')), JSON.stringify(w)); }
    await page.screenshot({ path: L('12-timer-chiuso-con-x.png') });
    check('chiudere il timer non cambia nessun dato', (await localRows()) === rowsBefore && (await serverSets()).length === setsBefore);
    await page.reload();
    await page.waitForSelector('#exv', { timeout: 15000 });
    check('riaperta l\'app: il timer chiuso resta chiuso', !(await timerWin()).clock);
    await page.click('[data-page=program]'); await page.waitForSelector('#planName');
    check('timer chiuso: su Programma la striscia in basso non c\'è', !(await page.isVisible('#timer')));
    await page.click('[data-page=track]'); await page.waitForSelector('#exv');
  }

  console.log('3b. Barra in basso: Programma, Allenamento, Progressi (sola lettura)');
  const tabOn = () => page.textContent('.tab.on');
  const rowsBefore = await localRows(), lsBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('gym.') && k !== 'gym.timer').sort()));
  check('barra con tre tasti nell\'ordine giusto, Allenamento acceso', JSON.stringify(await page.$$eval('.tab', (b) => b.map((x) => x.textContent))) === '["Programma","Allenamento","Progressi"]' && (await tabOn()) === 'Allenamento');
  check('Allenamento: testata col workout a tendina, niente schede dei giorni, esercizio', (await page.textContent('#dayName')) === 'Upper A' && await page.isVisible('#dayBtn') &&
    (await page.$$('.day')).length === 0 && !(await page.isVisible('.hdr')) && !!(await page.$('#exv')));
  { const r = await page.evaluate(() => ({ t: document.getElementById('timer').getBoundingClientRect().bottom, b: document.getElementById('tabs').getBoundingClientRect().top }));
    check('timer sopra la barra, non sotto', r.t <= r.b, JSON.stringify(r)); }
  await page.screenshot({ path: path.join(out, '13-track.png') });
  await page.click('[data-page=program]');
  await page.waitForSelector('#planName');
  check('Programma: piano, 4 giorni, esercizi con macchina', (await page.$$('.pday')).length === 4 && /Marca Finta · Incline Press · MF-10/.test(await page.textContent('.pex')) && (await tabOn()) === 'Programma');
  check('Programma: niente Importa, Library, Crea programma', !/importa|library|crea/i.test(await page.textContent('#wrap')));
  await page.screenshot({ path: path.join(out, '14-program.png') });
  await page.click('[data-page=progress]');
  await page.waitForSelector('.hses');
  const prog1 = (await page.textContent('.hses')).replace(/\s+/g, ' ');
  check('Progressi: la serie appena salvata c\'è (82,5 kg × 6, in corso)', /82,5 kg × 6/.test(prog1) && /in corso/.test(prog1), prog1.slice(0, 120));
  check('Progressi: anche le sedute dei giorni prima', (await page.$$('.hses')).length >= 2);
  await page.screenshot({ path: path.join(out, '15-progress.png') });
  await page.goBack();
  await page.waitForSelector('#exv');
  check('tasto indietro da Progressi: torna ad Allenamento (anche se prima c\'era Programma)', (await tabOn()) === 'Allenamento' && (await page.textContent('#dayName')).startsWith('Upper A'));
  await page.click('[data-page=program]');
  await page.click('.pdayH:has-text("Lower A")');
  await page.waitForSelector('#exv');
  check('tocco un giorno in Programma: si apre quel giorno in Allenamento', (await tabOn()) === 'Allenamento' && (await page.textContent('#dayName')).startsWith('Lower A'));
  await pickDay(page, 'Upper A');
  await page.waitForSelector('.sdone');
  await page.click('[data-page=progress]');
  await page.waitForSelector('.hses');
  await page.reload();
  await page.waitForSelector('#exv', { timeout: 15000 });
  check('riavvio da Progressi: si riparte da Allenamento', (await tabOn()) === 'Allenamento');
  check('girare le pagine non cambia nessun dato (telefono e impostazioni)', (await localRows()) === rowsBefore &&
    (await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('gym.') && k !== 'gym.timer').sort()))) === lsBefore);
  { const n = (await serverSets()).length; check('online ancora 1 serie dopo il giro delle pagine', n === 1, n + ''); }

  console.log('4. Offline: registrare, riaprire l\'app, modificare');
  // Senza rete: il browser offline (la pagina deve arrivare dalla cache) e in più ogni richiesta a Supabase bloccata
  // (il browser di prova lascia passare le richieste del service worker anche offline).
  await ctx.route(s.url + '/**', (r) => r.abort('internetdisconnected'));
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  // senza scrivere: tasto − delle rep (6 → 5), poi il tasto grande viola
  check('serie 2 proposta a 6 rep', (await page.inputValue('#inReps')) === '6', await page.inputValue('#inReps'));
  await page.click('[data-st=reps][data-d="-1"]');
  check('tasto − delle rep: 5', (await page.inputValue('#inReps')) === '5');
  await page.click('#save');
  await page.waitForFunction(() => document.querySelectorAll('.sdone').length === 2);
  check('serie 2 salvata offline', ['offline', 'pending'].includes(await syncState()), await syncState());
  check('segno "da inviare" sulla serie', (await page.$$('.sdone .pend')).length >= 1);
  await page.click('[data-page=progress]');
  await page.waitForSelector('.hses');
  { const t = (await page.textContent('.hses')).replace(/\s+/g, ' ');
    check('senza rete: in Progressi ci sono tutte e due le serie di oggi (82,5 × 6 e × 5)', /82,5 kg × 6.*82,5 kg × 5/.test(t), t.slice(0, 120)); }
  await page.click('[data-page=program]');
  await page.waitForSelector('#planName');
  check('senza rete: Programma si apre', (await page.$$('.pday')).length === 4);
  await page.click('[data-page=track]');
  await page.waitForSelector('#exv');
  await page.screenshot({ path: path.join(out, '03-offline.png'), fullPage: true });
  await page.reload();
  await page.waitForSelector('#exv', { timeout: 5000 });
  const open = await page.evaluate(() => window.__gymPerf.firstRender);
  check('riaperta senza rete (dalla cache) in < 1 s', open < 1000, open + ' ms');
  check('riaperta sul giorno scelto (Upper A), già sull\'esercizio successivo', (await page.textContent('#dayName')).startsWith('Upper A') && /Lat/i.test(await page.textContent('.ex')));
  await page.click('.bar [data-idx="0"]');
  await page.waitForSelector('.sdone');
  check('dopo la riapertura le 2 serie ci sono ancora', (await page.$$('.sdone')).length === 2);
  await page.click('.sdone >> nth=1');
  await page.waitForSelector('#update');
  await page.click('[data-st=reps][data-d="1"]');
  await page.click('[data-rir="1"]');
  await page.screenshot({ path: path.join(out, '04-modifica-serie.png'), fullPage: true });
  await page.click('#update');
  await page.waitForFunction(() => !document.getElementById('update'));
  check('serie 2 modificata offline (6 rep)', /× 6/.test(await page.getAttribute('.sdone >> nth=1', 'aria-label')));
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
  await page.click('.sdone >> nth=1');
  await page.click('#delSet');
  await page.click('#fYes');
  await page.waitForFunction(() => document.querySelectorAll('.sdone').length === 1);
  for (let i = 0; i < 50; i++) { sv = await serverSets(); if (sv[1] && sv[1].deleted_at) break; await page.waitForTimeout(200); }
  check('serie 2 cancellata con deleted_at, non tolta dal database', sv.length === 2 && sv[1].deleted_at);

  console.log('7. Giorno, peso sospetto, menu');
  await pickDay(page, 'Lower A');
  await page.waitForSelector('#exv');
  await page.fill('#inKg', '400');
  await page.click('#save');
  check('peso sospetto: chiede conferma', await page.isVisible('.sheet'));
  await page.click('#fNo');
  await toggleTheme(page);
  await page.screenshot({ path: path.join(out, '05-seduta-giorno.png'), fullPage: true });
  await toggleTheme(page);
  await openAccount(page);
  await page.screenshot({ path: path.join(out, '06-menu.png') });
  check('menu: account e memoria del telefono', (await page.textContent('.sheet')).includes(email));
  await page.click('#mClose');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.screenshot({ path: path.join(out, '07-tablet.png') });
  await page.setViewportSize({ width: 390, height: 844 });

  console.log('8. Uscita');
  await openAccount(page);
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
  await page.waitForSelector('.sdone', { timeout: 15000 });
  const localSessions = (p = page) => p.evaluate(() => [...window.__gym.S.local.rows.values()].filter((r) => r.table === 'sessions' && !r.data.deleted_at).map((r) => r.data));
  const nBefore = (await localSessions()).length;
  check('riaperta: propone Upper A, la seduta di oggi con la sua serie', (await page.textContent('#dayName')).startsWith('Upper A') && (await page.$$('.sdone')).length === 1);
  const page2 = await ctx.newPage();
  await page2.goto(URL_APP);
  await page2.waitForSelector('.sdone', { timeout: 15000 });
  check('seconda apertura (altra scheda): stessa seduta, stessa serie', (await page2.textContent('#dayName')).startsWith('Upper A') && (await page2.$$('.sdone')).length === 1);
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
  await page.waitForSelector('#exv', { timeout: 5000 });
  check('l\'app vede la data della settimana dopo', (await page.evaluate(() => window.__gym.S.date)) === week);
  check('giorno proposto = Lower A (Upper A lasciato a metà conta come fatto)', (await page.textContent('#dayName')).startsWith('Lower A'));
  await pickDay(page, 'Upper A');
  await page.waitForSelector('#last');
  check('Upper A la settimana dopo: schermata vuota', (await page.$$('.sdone')).length === 0);
  const lastW = (await page.textContent('#last')).replace(/\s+/g, ' ');
  check('volta scorsa = la serie della settimana prima (82,5 × 6)', /82,5 × 6/.test(lastW), lastW);
  check('aprire non crea sedute nemmeno la settimana dopo', (await localSessions()).length === nBefore);
  await page.click('#save');
  await page.waitForSelector('.sdone');
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
  await page.waitForSelector('#exv', { timeout: 5000 });
  await pickDay(page, 'Lower B');
  await page.waitForSelector('#save');
  await page.click('#save');
  await page.waitForSelector('.sdone');
  await page.clock.setFixedTime(new Date(ty, tm - 1, td + 9, 0, 20));
  await page.reload();
  await page.waitForSelector('#exv', { timeout: 5000 });
  check('alle 00:20 propone ancora Lower B con la serie delle 23:50', (await page.textContent('#dayName')).startsWith('Lower B') && (await page.$$('.sdone')).length === 1);
  await page.click('#save');
  await page.waitForFunction(() => document.querySelectorAll('.sdone').length === 2);
  ls2 = await localSessions();
  check('stessa seduta (nessuna seduta nuova dopo mezzanotte)', ls2.length === nBefore + 2, ls2.map((x) => x.session_date).join(','));
  await page.clock.setFixedTime(new Date(ty, tm - 1, td + 9, 4, 0));
  await page.reload();
  await page.waitForSelector('#exv', { timeout: 5000 });
  check('alle 4:00 la seduta è passata: propone il giorno dopo (Upper A)', (await page.textContent('#dayName')).startsWith('Upper A'));
  await pickDay(page, 'Lower B');
  await page.waitForSelector('#last');
  check('alle 4:00 Lower B parte vuoto, con la volta scorsa', (await page.$$('.sdone')).length === 0);
  { const fut = (await admin.from('sessions').select('id').eq('user_id', ref.userId).gt('session_date', today)).data; check('online (database locale) nessuna seduta con data futura', fut.length === 0); }

  console.log('12. Fine seduta: due telefoni, online e offline (orologio vero)');
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'it-IT', hasTouch: true, isMobile: true });
    await blockOnline(c);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL_APP);
    await p.fill('#email', email); await p.fill('#pass', password); await p.click('#loginBtn');
    await p.waitForSelector('#exv', { timeout: 15000 });
    return { c, p };
  };
  const sync = (p) => p.waitForFunction(() => document.body.dataset.sync === 'ok', null, { timeout: 15000 });
  const toDay = pickDay;
  const upperB = async () => {
    const day = (await admin.from('plan_days').select('id').eq('user_id', ref.userId).eq('name', 'Upper B')).data[0].id;
    return (await admin.from('sessions').select('id, ended_at, started_at').eq('user_id', ref.userId).eq('session_date', today).eq('plan_day_id', day).order('started_at')).data;
  };
  const A = await phone(), B = await phone();
  await toDay(A.p, 'Upper B');
  check('senza serie: nessun tasto Fine seduta (nemmeno nel menu "...")', !(await hasEnd(A.p)));
  await A.p.click('#save');
  await A.p.waitForSelector('.sdone');
  await openMore(A.p);
  { const r = await A.p.evaluate(() => { const e = document.getElementById('endSession').getBoundingClientRect(), a = document.getElementById('moreClose').getBoundingClientRect();
      return { gap: Math.round(e.top - a.bottom), endBottom: Math.round(e.bottom), vh: innerHeight, inSheet: !!document.querySelector('.sheet.msheet #endSession') }; });
    check('Fine seduta nel menu "...", in fondo e staccato dagli altri tasti (≥ 24 px)', r.inSheet && r.gap >= 24 && r.endBottom <= r.vh, JSON.stringify(r));
    await A.p.screenshot({ path: path.join(out, '08-fine-seduta.png') }); }
  await A.p.click('#moreClose');
  await sync(A.p);
  await endSes(A.p);
  await A.p.waitForSelector('#closedBar');
  check('chiusa: schermata vuota, "Riapri" visibile, la serie è la volta scorsa', (await A.p.$$('.sdone')).length === 0 && await A.p.isVisible('#reopen') && /Volta scorsa/.test(await A.p.textContent('#last')));
  await A.p.screenshot({ path: path.join(out, '09-seduta-chiusa.png'), fullPage: true });
  await sync(A.p);
  let ub = await upperB();
  check('online: una seduta, chiusa (ended_at), serie non cancellata', ub.length === 1 && !!ub[0].ended_at &&
    (await admin.from('sets').select('id').eq('user_id', ref.userId).is('deleted_at', null).gte('created_at', START)).data.length >= 1);
  await B.p.evaluate(() => window.__gym.refresh());
  await toDay(B.p, 'Upper B');
  check('l\'altro telefono la vede chiusa dopo la sincronizzazione', (await B.p.$$('.sdone')).length === 0 && await B.p.isVisible('#closedBar'));
  await A.p.click('#reopen');
  await A.p.waitForSelector('.sdone');
  await sync(A.p);
  check('Riapri: serie di nuovo nella seduta; online ended_at vuoto', (await A.p.$$('.sdone')).length === 1 && (await upperB())[0].ended_at === null);
  await B.p.evaluate(() => window.__gym.refresh());
  await B.p.waitForSelector('.sdone');
  await endSes(A.p); await endSes(B.p);
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
  await A.p.waitForSelector('#save:not([disabled])');
  await A.p.click('#save');
  await A.p.waitForFunction(() => document.querySelectorAll('.sdone').length === 2);
  await endSes(A.p);
  await A.p.waitForSelector('#closedBar');
  await A.p.reload();
  await A.p.waitForSelector('#exv', { timeout: 5000 });
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
  await A.p.waitForFunction(() => !document.getElementById('closedBar') && document.querySelectorAll('.sdone').length === 1);
  check('serie dopo la chiusura: Fine seduta di nuovo nel menu', await hasEnd(A.p));
  await sync(A.p);
  ub = await upperB();
  const oldSets = (await admin.from('session_exercises').select('sets(id, deleted_at)').eq('session_id', ub[0].id)).data.flatMap((x) => x.sets);
  check('serie dopo la chiusura: seduta nuova aperta; la vecchia resta chiusa con le sue 2 serie', ub.length === 2 && !!ub[0].ended_at && ub[1].ended_at === null &&
    oldSets.length === 2 && oldSets.every((x) => !x.deleted_at) && !(await A.p.$('#closedBar')), ub.length + ' sedute');
  await A.c.close(); await B.c.close();

  console.log('13. Telefono in una lingua non prevista (cinese): inglese');
  { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', hasTouch: true, isMobile: true });
    await blockOnline(c);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL_APP);
    await p.waitForSelector('#loginForm');
    check('accesso in inglese, pagina con lang="en"', (await p.textContent('h1')) === 'Sign in' && (await p.getAttribute('html', 'lang')) === 'en');
    await p.fill('#email', email); await p.fill('#pass', password); await p.click('#loginBtn');
    await p.waitForSelector('#exv', { timeout: 15000 });
    const [y, mo, d] = today.split('-').map(Number);
    const dayTxt = new Date(y, mo - 1, d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }).toUpperCase();
    check('seduta in inglese, data giorno-mese, kg', (await p.textContent('.btitle')) === 'WORKOUT' && (await p.textContent('#dateTxt')) === 'TODAY · ' + dayTxt &&
      (await p.textContent('#unitSeg .on')) === 'kg', await p.textContent('#dateTxt'));
    const body = await p.textContent('body');
    check('nessuna parola italiana dell\'app sullo schermo', !/\b(Serie|Salva|Volta scorsa|Prossimo|Oggi|Fine seduta|Suggerito)\b/.test(body));
    await p.screenshot({ path: path.join(out, '10-inglese.png'), fullPage: true });
    await c.close(); }
  check('nessun errore JavaScript (fine)', errors.length === 0, errors.join(' | '));
  check('nessuna richiesta a Supabase online (gym-app) durante la prova', onlineHits === 0, onlineHits + ' tentativi');
} catch (e) {
  ko++; console.log('  ERRORE', e.message);
} finally {
  if (browser) await browser.close();
  server.kill();
  if (ref) await deleteFakeAthlete(admin, ref.userId);
}
console.log(`\nPROVA NEL BROWSER: ${ok} ok, ${ko} no. Screenshot in app/tests/out/`);
process.exit(ko ? 1 : 0);
