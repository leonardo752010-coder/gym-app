// App v1: accesso, seduta di oggi, serie in un tocco, modifica, timer di recupero.
// Grafica e flusso presi da apps-script/gym-sheet/web-app.html.
// Regola: ogni serie si salva prima sul telefono (IndexedDB); poi, appena c'è rete, va a Supabase.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/barlow-condensed/latin-900-italic.css';
import './styles.css';
import { supabaseConfig } from './config.js';
import { makeApi, storedUser, HISTORY_DAYS } from './api.js';
import { openStore, Local, getKv, setKv } from './store.js';
import { flush } from './sync.js';
import { saveSet, updateSet, deleteSet, closeSession, reopenSession } from './session.js';
import { LANGS, pickLang, tr, fmtDay } from './i18n.js';
import { STARTERS, loadStarter, needsStarter, chooseStarter, mergeServerStarter, flushStarter } from './starter.js';
import gorillaImg from './assets/starters/gorilla.png';
import lionImg from './assets/starters/lion.png';
import tigerImg from './assets/starters/tiger.png';
// Logo dentro l'app (vedi scripts/logo.mjs): completo per accesso, caricamento e menu; solo il gorilla nel cerchio in alto.
// L'icona con la corona serve solo come icona dell'app (Home, favicon, manifest).
import logoFull from './assets/logo/logo-silverback.webp';
import logoHead from './assets/logo/logo-gorilla.webp';
const LOGO = (cls) => '<img class="' + cls + '" src="' + logoFull + '" width="720" height="668" alt="Gym · Import &amp; Track">';
import {
  localDate, addDays, indexRows, openSessions, setsInSessions, lastPerformance, lastPerformances, suggest, stepWeight,
  restFor, defaultDay, looksWrong, machineLabel, setWeightIn, kgToUnit, round2, reopenable, e1rmPoints, LB,
} from './logic.js';
import { PAGES, START_PAGE, navStep, pageFromState, historyList, historyFilterOptions, filterHistory, chartChoices } from './pages.js';
import { versionText } from './version.js';
import { tableRows, exNav, dayOptions, clock, rirLabel, rirNext, vsLast } from './allenamento.js';

// Mascotte (PNG ritagliati da docs/immagini/Vintage Trio Gym Mascots.png). La build le mette nella cache offline.
const STARTER_IMG = { gorilla: gorillaImg, lion: lionImg, tiger: tigerImg };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Riga piccola con la versione: stessa funzione in accesso, caricamento, menu e Programma (vedi version.js).
const VER = (id) => '<p class="ver" id="' + id + '">' + esc(versionText(S.T.version, cfg.locale)) + '</p>';
const fmtN = (n) => (n == null || n === '' ? '' : String(round2(Number(n))).replace('.', ','));
const parseN = (s) => { const t = String(s ?? '').trim().replace(',', '.'); const n = Number(t); return t === '' || isNaN(n) ? null : n; };
const ls = {
  get(k) { try { return localStorage.getItem('gym.' + k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('gym.' + k) : localStorage.setItem('gym.' + k, v); } catch (e) { /* niente */ } },
};
// Giorno scelto a mano: vale solo per oggi (domani si riparte dalla rotazione).
function savedDay() { const [d, id] = (ls.get('day') || '').split('|'); return d === localDate() && id ? id : null; }
// Registro breve in memoria (ultimi 50 eventi di sincronizzazione), utile per capire un problema.
const LOG = [];
const log = (...a) => { LOG.push(Math.round(performance.now()) + ' ' + a.join(' ')); if (LOG.length > 50) LOG.shift(); };
const perf = (window.__gymPerf = window.__gymPerf || {});
const mark = (k) => { perf[k] = Math.round(performance.now()); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* iPhone: niente vibrazione */ } };

const cfg = supabaseConfig();
const api = cfg.url && cfg.key ? makeApi(cfg) : null;   // senza chiave pubblica l'app non parte (vedi config.js)

const S = {
  lang: pickLang(ls.get('lang')), T: null, unit: ls.get('unit') || null, user: null, store: null, local: null, snap: null,
  date: localDate(), dayId: savedDay(), idx: 0, drafts: {}, edit: null, extraOpen: null, busy: false, openNotes: false,
  sync: { state: 'ok', pending: 0, failed: 0 }, lastRefresh: 0, persisted: null, pendingRender: false,
  starter: null, pick: null,   // starter: record sul telefono (vedi starter.js); pick: carta toccata, non ancora confermata
  page: START_PAGE,            // pagina della barra in basso: 'program' | 'track' | 'progress' (vedi pages.js)
  // Progressi: sezione (Storico / Grafico), filtri dello storico, esercizio+macchina del grafico, punto toccato. Solo in memoria.
  prog: { tab: 'history', day: '', ex: '', chart: '', pt: '' },
};
S.T = LANGS[S.lang];
document.documentElement.lang = S.lang;

/* ---------- giorno / notte ---------- */
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
const themeIcon = () => (document.documentElement.dataset.theme === 'light' ? ICON_MOON : ICON_SUN);
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  syncBar();
  for (const id of ['themeBtn', 'mTheme']) { const b = $(id); if (b) b.innerHTML = themeIcon(); }
}
/** Tasto luna (in alto su Programma e Progressi, nel menu "..." in Allenamento). */
function toggleTheme() { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; ls.set('theme', t); applyTheme(t); buzz(8); }
// Icone della schermata Allenamento (solo disegno, a tratto, colore del testo)
const SVG = (p, w = 2) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const ICON_DOWN = SVG('<path d="M6 9l6 6 6-6"/>', 2.4);
const ICON_MORE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const ICON_PREV = SVG('<path d="M15 6l-6 6 6 6"/>', 2.4), ICON_NEXT = SVG('<path d="M9 6l6 6-6 6"/>', 2.4);
const ICON_WATCH = SVG('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5M12 2.5V6"/>');
const ICON_CLOSE = SVG('<path d="M6 6l12 12M18 6L6 18"/>', 2.4);
const ICON_CHECK = SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3);
const ICON_NOTE = SVG('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>');
const ICON_HIST = SVG('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4M12 7.5V12l3 2"/>');
// schermata della serie: freccia su (obiettivo), calendario (volta scorsa), nuvola (stato online), icone dei chip
const ICON_UP = SVG('<path d="M12 19V5M6 11l6-6 6 6"/>', 2.6);
const ICON_CAL = SVG('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
const ICON_CLOUD = (ok) => SVG('<path d="M7 18.5h10.5a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.3 9.2 4.7 4.7 0 0 0 7 18.5z"/>' + (ok ? '<path d="M9.3 13.6l2 2 3.6-3.8"/>' : ''));
const ICON_SETS = SVG('<path d="M4 7h16M4 12h16M4 17h10"/>');
const ICON_GAUGE = SVG('<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l3.5-5"/>');
const ICON_MUSCLE = SVG('<path d="M6.5 7v10M17.5 7v10M3.5 10v4M20.5 10v4M6.5 12h11"/>');
/* Barra di stato del telefono (theme-color) = sfondo vero della pagina, letto dal CSS: segue il tasto luna
   e la schermata (accesso, app, CHOOSE YOUR STARTER hanno sfondi diversi). Si riallinea quando cambia la schermata. */
function syncBar() {
  const meta = document.querySelector('meta[name=theme-color]'); if (!meta || !document.body) return;
  const c = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
  if (c.length >= 3 && (c[3] == null || c[3] > 0)) meta.content = '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  if (!syncBar.obs) { syncBar.obs = new MutationObserver(syncBar); syncBar.obs.observe(document.body, { childList: true }); }
}
const theme = () => ls.get('theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
applyTheme(theme());

function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast' + (bad ? ' bad' : ''); }, bad ? 4500 : 2200);
}
function niceDate(k) { return fmtDay(k, S.T.locale).replace('.', '').toUpperCase(); }
function shortDate(k) { return fmtDay(k, S.T.locale, S.date); }

/* ---------- avvio ---------- */
async function boot() {
  mark('boot');
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (!api) { document.body.innerHTML = '<div class="load err">' + esc(S.T.noConfig) + '</div>' + VER('verLoad'); return; }
  askPersist();
  S.user = storedUser();
  if (!S.user) { renderLogin(); return; }
  resetPage();
  await openLocal();
  if (S.snap) { render(); mark('firstRender'); }
  else renderLoading();
  refresh();
}

async function askPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) { S.persisted = null; return; }
    S.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (e) { S.persisted = null; }
}

async function openLocal() {
  S.store = S.store || await openStore();
  S.local = await new Local(S.store, S.user.id).load();
  S.snap = (await getKv(S.store, 'snap:' + S.user.id)) || null;
  S.starter = await loadStarter(S.store, S.user.id);
  if (S.snap && !S.unit) S.unit = (S.snap.profile && S.snap.profile.weight_unit) || 'kg';
  if (!S.unit) S.unit = 'kg';
  updateSyncInfo();
}

/** Invia la coda e poi scarica piano e storico aggiornati. Mai bloccante per l'utente. */
async function refresh() {
  if (!S.user) return;
  // Se un aggiornamento è già in corso (magari appeso a una rete lenta), se ne fa un altro appena finisce.
  if (refresh.busy) { refresh.again = true; return; }
  refresh.again = false;
  refresh.busy = true;
  try {
    // L'accesso salvato vale ancora? (Per esempio: account ricreato, sessione chiusa.) Senza rete si continua col telefono.
    const auth = await api.checkAuth();
    if (!S.user) return;
    if (auth.state === 'invalid' || (auth.state === 'ok' && auth.user.id !== S.user.id)) { await sessionLost(auth.code); return; }
    await syncNow(true);
    const uid = S.user.id;
    const [snap, hist, st] = await Promise.all([api.snapshot(uid), api.history(uid, addDays(localDate(), -HISTORY_DAYS)), api.getStarter(uid)]);
    if (!S.user || S.user.id !== uid) return;
    // Starter: un errore qui (anche "colonna che non c'è") non blocca piano e seduta; la schermata semplicemente non compare.
    if (!st.error) S.starter = await mergeServerStarter(S.store, uid, st.data);
    else log('starter-read', st.error.code || '', st.error.message || '');
    if (snap.error || hist.error) {
      const e = snap.error || hist.error;
      if (!S.snap) renderLoading(e.offline ? S.T.firstLoad : S.T.loginErr + e.message, true);
      setSync();
      return;
    }
    await S.local.mergeServer(hist.data, addDays(localDate(), -HISTORY_DAYS));
    S.snap = { ...snap.data, fetchedAt: new Date().toISOString(), userId: uid };
    await setKv(S.store, 'snap:' + uid, S.snap);
    if (!ls.get('unit')) S.unit = (S.snap.profile && S.snap.profile.weight_unit) || 'kg';
    S.lastRefresh = Date.now();
    mark('refreshed');
    safeRender();
  } finally { refresh.busy = false; if (refresh.again) refresh(); }
}

const starterPending = () => !!(S.starter && S.starter.pending);
const pendingCount = () => (S.local ? S.local.dirtyRows().length : 0) + (starterPending() ? 1 : 0);

async function syncNow(force = false) {
  if (!S.local) return;
  if (!pendingCount()) { updateSyncInfo(); setSync(); return; }
  // Senza rete non si prova (si riprova all'evento "online"); "force" quando la rete è appena tornata o lo chiede l'utente,
  // perché navigator.onLine a volte resta indietro.
  if (!force && !navigator.onLine) { S.sync.offline = true; setSync(); return; }
  S.sync.state = 'syncing'; setSync();
  log('sync', S.local.dirtyRows().length);
  let offline = false, sent = 0;
  if (S.local.dirtyRows().length) {
    const r = await flush(S.local, api);
    log('sync-end', JSON.stringify(r));
    offline = r.offline; sent += r.sent;
  }
  if (!offline && starterPending() && S.user) {
    const uid = S.user.id;
    const r = await flushStarter(S.store, uid, api);
    log('starter-sync', JSON.stringify(r));
    if (S.user && S.user.id === uid) S.starter = await loadStarter(S.store, uid);
    offline = !!r.offline; if (r.sent) sent++;
  }
  S.sync.offline = offline;
  updateSyncInfo();
  setSync();
  if (sent) safeRender();
}

function updateSyncInfo() {
  const d = S.local ? S.local.dirtyRows() : [];
  const sp = starterPending(), se = sp && S.starter.error ? 1 : 0;
  S.sync.pending = d.length + (sp ? 1 : 0);
  S.sync.failed = d.filter((r) => r.error).length + se;
  S.sync.state = !S.sync.pending ? 'ok' : S.sync.failed ? 'err' : (S.sync.offline || !navigator.onLine) ? 'offline' : 'pending';
  document.body.dataset.sync = S.sync.state;
  document.body.dataset.pending = String(S.sync.pending);
}

function setSync() {
  updateSyncInfo();
  const T = S.T, p = S.sync.pending;
  const txt = S.sync.state === 'ok' ? T.syncOk : S.sync.state === 'syncing' ? T.syncing : S.sync.state === 'err' ? T.syncErr(S.sync.failed)
    : S.sync.state === 'offline' ? T.syncOffline(p) : T.syncPending(p);
  // stesso stato in due posti: testata di Programma/Progressi (#sync) e testata di Allenamento (#tsync)
  for (const [id, cls] of [['sync', 'sync '], ['tsync', 'sync tsync ']]) {
    const el = $(id); if (!el) continue;
    el.className = cls + S.sync.state;
    el.innerHTML = (id === 'tsync' ? ICON_CLOUD(S.sync.state === 'ok') : '<i></i>') + esc(txt);
  }
}

/** Ridisegna senza chiudere la tastiera mentre l'utente scrive. */
function safeRender() {
  const a = document.activeElement;
  if (a && a.tagName === 'INPUT' && $('wrap') && $('wrap').contains(a)) { S.pendingRender = true; setSync(); return; }
  if (S.user && S.snap) render(); else setSync();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender) { S.pendingRender = false; safeRender(); } }, 50));

/* ---------- accesso ---------- */
/**
 * Il server dice che l'accesso salvato non vale più: si torna al login.
 * Si toglie SOLO l'accesso salvato. Serie, sedute e coda restano sul telefono (IndexedDB), anche quelle non inviate.
 */
async function sessionLost(code) {
  log('auth-invalid', code || '');
  await api.forgetSession();
  S.user = null; S.local = null; S.snap = null; S.starter = null; S.pick = null;
  stopTimer(); renderLogin(S.T.sessionGone);
}

function renderLogin(msg) {
  document.body.innerHTML = '<main class="login">' + LOGO('llogo') + '<h1>' + S.T.loginTitle + '</h1>' +
    '<form id="loginForm" autocomplete="on"><input id="email" type="email" inputmode="email" autocomplete="username" placeholder="' + S.T.email + '" required>' +
    '<input id="pass" type="password" autocomplete="current-password" placeholder="' + S.T.password + '" required>' +
    '<button class="save" id="loginBtn" type="submit">' + S.T.login + '</button></form>' +
    '<div class="msg" id="loginMsg">' + esc(msg || '') + '</div><div class="note">' + S.T.install + '</div>' + VER('verLogin') + '</main>' +
    '<div class="toast" id="toast"></div>';
  $('loginForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = $('loginBtn'); btn.disabled = true; btn.textContent = S.T.loggingIn; $('loginMsg').textContent = '';
    const r = await api.signIn($('email').value.trim(), $('pass').value);
    if (r.error) {
      btn.disabled = false; btn.textContent = S.T.login;
      $('loginMsg').textContent = r.error.offline || !navigator.onLine ? S.T.needNet
        : (r.error.status === 400 || /invalid/i.test(r.error.message)) ? S.T.badLogin : S.T.loginErr + r.error.message;
      return;
    }
    S.user = { id: r.user.id, email: r.user.email };
    resetPage();
    await openLocal();
    if (S.snap) render(); else renderLoading();
    refresh();
  };
}

function renderLoading(msg, retry) {
  shell();
  $('wrap').innerHTML = '<div class="load" style="grid-column:1/-1">' + LOGO('llogo') + (msg ? '<div class="err">' + esc(msg) + '</div>' : '<div class="spin"></div>') +
    '<span>' + (msg ? '' : S.T.loading) + '</span>' + (retry ? '<button class="pill" id="retry">↻</button>' : '') + VER('verLoad') + '</div>';
  if (retry) $('retry').onclick = () => { renderLoading(); refresh(); };
}

/* ---------- CHOOSE YOUR STARTER (una sola volta; vedi starter.js) ---------- */
// Compare solo quando il server ha detto "vuoto" (needsStarter): mai per una copia vecchia sul telefono.
function renderStarter() {
  const T = S.T;
  document.body.innerHTML = '<main class="starter" id="starterScr"><h1>CHOOSE YOUR STARTER</h1><p>' + esc(T.starterHint) + '</p>' +
    '<div class="stCards">' + STARTERS.map((k) => '<button class="stCard' + (S.pick === k ? ' on' : '') + '" data-pick="' + k + '" aria-pressed="' + (S.pick === k) + '">' +
      '<img src="' + STARTER_IMG[k] + '" alt=""><b>' + esc(T.starterNames[k]) + '</b></button>').join('') + '</div>' +
    '<button class="save" id="starterOk"' + (S.pick ? '' : ' disabled') + '>' + esc(T.starterOk) + '</button></main><div class="toast" id="toast"></div>';
  document.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => {
      S.pick = b.dataset.pick; buzz(8);
      document.querySelectorAll('[data-pick]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      $('starterOk').disabled = false;
    };
  });
  $('starterOk').onclick = async () => {
    if (!S.pick || S.busy) return;
    S.busy = true; $('starterOk').disabled = true;
    const pick = S.pick;
    try { S.starter = await chooseStarter(S.store, S.user.id, pick); }
    catch (e) { S.busy = false; $('starterOk').disabled = false; toast(T.saveErr + (e && e.message || e), true); return; }
    S.busy = false; S.pick = null;
    buzz(30);
    document.body.innerHTML = ''; render(); scrollTo(0, 0);
    toast(T.starterSaved(T.starterNames[S.starter.value] || pick));
    syncNow();
  };
}

/* ---------- struttura della pagina ---------- */
// Due testate: quella di sempre (logo, titolo, data, luna, kg/lb) per Programma, Progressi e caricamento;
// quella di Allenamento (#thdr: workout a tendina, stato di sincronizzazione, menu "..."), accesa da render() con la classe "trk".
// In basso, sopra la barra delle pagine: timer di recupero + tasto per azzerarlo + tasto grande per salvare la serie (#timer).
function shell() {
  if ($('wrap') && $('thdr')) return;
  document.body.innerHTML = `
<header class="top" id="top"><div class="hdr"><div class="brand">
  <img class="blogo" id="logo" src="${logoHead}" alt="Gym">
  <div class="btitle" id="btitle">${S.T.workout}</div><div class="sync" id="sync"></div></div>
  <div class="ctrls"><span class="pill static" id="dateTxt"></span>
  <button class="theme" id="themeBtn" aria-label="${S.T.dayNight}"></button>
  <div class="seg" id="unitSeg"><button data-u="kg">kg</button><button data-u="lb">lb</button></div></div></div>
  <div class="thdr" id="thdr"><div class="trow"><button class="more hback" id="hBack" aria-label="${esc(S.T.navProgram)}">${ICON_PREV}</button>
    <button class="dayBtn" id="dayBtn" aria-haspopup="dialog" aria-label="${esc(S.T.chooseDay)}"><b id="dayName"></b>${ICON_DOWN}</button>
    <button class="more" id="moreBtn" aria-haspopup="dialog" aria-label="${esc(S.T.more)}">${ICON_MORE}</button></div>
    <div class="sync tsync" id="tsync"></div></div></header>
<main class="wrap" id="wrap"></main>
<div class="timer idle" id="timer"><div class="tclock"><span class="tic">${ICON_WATCH}</span><div class="tt"><span id="tLab"></span><b id="tTxt">0:00</b>
  <div class="tbar"><div class="pg" id="tPg"></div></div></div><button id="tMinus">−15</button><button id="tPlus">+15</button></div>
  <button class="treset" id="tStop" aria-label="${esc(S.T.closeTimer)}" title="${esc(S.T.closeTimer)}">${ICON_CLOSE}</button>
  <button class="go" id="save" aria-label="${esc(S.T.complete)}" title="${esc(S.T.complete)}"><span class="goc">${ICON_CHECK}</span><span class="gol" aria-hidden="true">${esc(S.T.complete)}</span></button></div>
<nav class="tabbar" id="tabs" aria-label="${S.T.pages}"></nav>
<div class="toast" id="toast"></div><div id="sheetHost"></div>`;
  applyTheme(theme());
  $('themeBtn').onclick = toggleTheme;
  $('tMinus').onclick = () => { T_.end -= 15000; saveTimer(); tick(); };
  $('tPlus').onclick = () => { T_.end += 15000; T_.tot += 15; saveTimer(); tick(); };
  $('tStop').onclick = stopTimer;
  $('logo').onclick = openMenu;
  $('sync').onclick = openMenu;
  $('tsync').onclick = openMenu;
  idleTimer();
  resumeTimer();
}

/* ---------- dati della seduta ---------- */
function plan() { return S.snap && S.snap.plan; }
function dayObj() {
  const p = plan(); if (!p || !p.days.length) return null;
  return p.days.find((d) => d.id === S.dayId) || p.days[0];
}
// Seduta mostrata: quella in corso per il giorno scelto (vedi openSessions in logic.js).
// Se non ce n'è una, la schermata parte vuota e le sedute passate sono la "volta scorsa".
function view() {
  const idx = indexRows(S.local.list());
  const day = dayObj();
  const sessions = day ? openSessions(idx, { date: S.date, day, now: new Date() }) : [];
  return { idx, day, sessions };
}
function doneOf(v, pe) {
  return setsInSessions(v.idx, v.sessions, pe);
}
const active = (pe) => pe.sets > 0;
function firstOpenIdx(v) {
  const i = v.day.exercises.findIndex((pe) => active(pe) && doneOf(v, pe).length < pe.sets);
  return i < 0 ? 0 : i;
}

/* ---------- disegno ---------- */
function render() {
  const today = localDate();
  if (today !== S.date) { S.date = today; S.drafts = {}; S.edit = null; S.dayId = null; }
  if (needsStarter(S.starter)) { renderStarter(); return; }
  shell();
  setSync();
  const T = S.T;
  $('dateTxt').textContent = T.today.toUpperCase() + ' · ' + niceDate(S.date);
  [...$('unitSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.u === S.unit));
  renderTabs();
  const top = $('top');
  if (S.page !== 'track') { top.classList.remove('trk'); dock(null); S.page === 'program' ? renderProgram() : renderProgress(); return; }
  const p = plan();
  if (!p || !p.days.length) { top.classList.remove('trk'); dock(null); $('wrap').innerHTML = '<div class="load err" style="grid-column:1/-1">' + T.noPlan + '</div>'; return; }

  let v = view();
  if (!S.dayId || !p.days.some((d) => d.id === S.dayId)) {
    const d = defaultDay(p, v.idx, S.date, new Date()); S.dayId = d.id; v = view(); S.idx = firstOpenIdx(v); S.idxSet = true;
  }
  if (!S.idxSet) { S.idx = firstOpenIdx(v); S.idxSet = true; }   // all'apertura: primo esercizio non finito
  // testata di Allenamento: nome del workout (tocco → elenco dei giorni del piano), stato di sincronizzazione, "..."
  top.classList.add('trk');
  $('dayName').textContent = v.day.name;

  const exs = v.day.exercises;
  if (!exs.length) { $('wrap').innerHTML = ''; dock(null); return; }
  if (S.idx >= exs.length) S.idx = 0;
  const pe = exs[S.idx];
  // su schermi larghi (tablet) resta l'elenco degli esercizi a sinistra, come prima
  const list = '<aside class="list">' + exs.map((x, i) => exItem(v, x, i, 'data-idx')).join('') + '</aside>';
  const ex = exView(v, exs, pe);
  $('wrap').innerHTML = list + '<section class="exv" id="exv">' + ex.html + '</section>';
  dock(pe, ex.canSave, ex.isUpdate);
}

const exProg = (v, x) => { const n = doneOf(v, x).length; return active(x) ? Math.min(n / x.sets, 1) : 0; };
/** Una riga dell'elenco degli esercizi (a sinistra sul tablet, nella tendina "Esercizio N di M" sul telefono). */
function exItem(v, x, i, attr) {
  const T = S.T, n = doneOf(v, x).length, pr = exProg(v, x);
  const cls = 'li' + (i === S.idx ? ' cur' : '') + (pr >= 1 ? ' full' : '') + (!active(x) && !n ? ' off' : '');
  const sub = !active(x) ? T.listOff : n + '/' + x.sets + ' ' + T.sets + ' · ' + range(x);
  return '<button class="' + cls + '" ' + attr + '="' + i + '"' + (i === S.idx ? ' aria-current="true"' : '') + '><span class="n">' + (pr >= 1 ? '✓' : i + 1) + '</span><span class="t">' +
    (x.superset_label ? '<span class="ss">SUPERSET ' + esc(x.superset_label) + '</span>' : '') + '<b>' + esc(exName(x)) + '</b><span>' + esc(sub) + '</span></span></button>';
}

/**
 * L'esercizio scelto, dall'alto in basso: "Esercizio N di M" (tocco → elenco) con ‹ ›, nome, macchina, Note,
 * suggerimento di carico, tabella Set / Kg / Rep / RIR, Volta scorsa, poi "Prossimo".
 */
function exView(v, exs, pe) {
  const T = S.T, done = doneOf(v, pe), { last, sugg } = infoFor(v, pe), m = pe.machine, nav = exNav(S.idx, exs.length);
  let h = closedBar(v);
  h += '<div class="exTop"><button class="exOf" id="exList" aria-haspopup="dialog">' + esc(T.exOf(S.idx + 1, exs.length)) + ICON_DOWN + '</button>' +
    '<span class="arrs"><button class="arr" data-go="-1" aria-label="' + esc(T.back) + '"' + (nav.prev ? '' : ' disabled') + '>' + ICON_PREV + '</button>' +
    '<button class="arr nx" data-go="1" aria-label="' + esc(T.next) + '"' + (nav.next ? '' : ' disabled') + '>' + ICON_NEXT + '</button></span></div>';
  h += '<div class="bar">' + exs.map((x, i) => '<button data-idx="' + i + '" class="' + (i === S.idx ? 'cur' : exProg(v, x) >= 1 ? 'full' : '') + '" aria-label="' + esc(exName(x)) + '"></button>').join('') + '</div>';
  if (pe.superset_label) h += '<div class="ss">SUPERSET ' + esc(pe.superset_label) + '</div>';
  h += '<h1 class="ex">' + esc(exName(pe)) + '</h1>';
  // macchina: "marca · modello · codice" in viola tenue; salto dei pesi e alternativa in grigio, come prima
  if (m) {
    const wl = Array.isArray(m.weight_list) ? m.weight_list : [];
    const stepTxt = wl.length ? (wl.length > 5 ? fmtN(wl[0]) + '…' + fmtN(wl[wl.length - 1]) + ' ' + m.weight_unit + ' (' + T.weights(wl.length) + ')' : wl.map(fmtN).join(' / ') + ' ' + m.weight_unit)
      : m.weight_step ? T.step + ' ' + fmtN(m.weight_step) + ' ' + m.weight_unit : '';
    h += '<div class="mac"><b>' + esc(machineLabel(m) || tr(m.name, S.lang) || m.code) + '</b>' + (stepTxt ? ' <span>· ' + esc(stepTxt) + '</span>' : '') +
      (pe.alt_machine ? ' <span>· ' + T.alt + ': ' + esc(machineLabel(pe.alt_machine) || pe.alt_machine.code) + '</span>' : '') + '</div>';
  }
  // chip con icona: schema, RIR, muscolo (viola), Note (solo se l'esercizio del piano ha una nota: è un tasto), Storico (ultime 3 volte)
  const noteBtn = pe.notes ? '<button class="mini' + (S.openNotes ? ' on' : '') + '" id="notesBtn" aria-expanded="' + S.openNotes + '"><span>' + ICON_NOTE + esc(T.notesBtn) + '</span></button>' : '';
  const histBtn = '<button class="mini" id="histBtn" aria-haspopup="dialog"><span>' + ICON_HIST + esc(T.histBtn) + '</span></button>';
  h += '<div class="chips"><span>' + ICON_SETS + pe.sets + ' × ' + esc(range(pe)) + '</span>' +
    (rirTxt(pe) ? '<span>' + ICON_GAUGE + 'RIR ' + esc(rirTxt(pe)) + '</span>' : '') + (pe.muscle ? '<span class="mu">' + ICON_MUSCLE + esc(tr(pe.muscle, S.lang)) + '</span>' : '') + noteBtn + histBtn + '</div>';
  if (pe.notes && S.openNotes) h += '<p class="notes open" id="notes">' + esc(pe.notes) + '</p>';

  // scheda obiettivo: suggerimento di oggi (stessa suggest()), badge "vs volta scorsa" solo se c'è una volta scorsa
  const nextN = done.reduce((mx, s) => Math.max(mx, s.set_number), 0) + 1;
  const sg = sugg && sugg.sets[Math.min(nextN, sugg.sets.length) - 1];
  if (sg && done.length < Math.max(pe.sets, 1)) {
    const ls = last && last.sets.length ? last.sets[Math.min(nextN, last.sets.length) - 1] : null;
    const vs = ls ? vsLast(sg, setWeightIn(ls, S.unit), ls.reps) : null;
    const vsTxt = !vs ? '' : vs.kind === 'weight' ? (vs.diff > 0 ? '+' : '−') + fmtN(Math.abs(vs.diff)) + ' ' + S.unit : T.repDiff(vs.diff);
    h += '<div class="sugg" id="sugg"><div class="sgt"><b class="sgl">' + ICON_UP + esc(T.set + ' ' + nextN + ' · ' + T.goal) + '</b>' +
      '<div class="sv' + (fmtN(sg.weight).length >= 5 ? ' lng' : '') + '"><b>' + fmtN(sg.weight) + '</b> <i>' + S.unit + '</i> <i>×</i> <b>' + sg.reps + '</b></div>' +
      '<div class="why">' + esc(T.why[sg.why]) + '</div></div>' +
      (vs ? '<div class="vs' + (vs.diff > 0 ? '' : ' flat') + '" id="vsLast"><small>' + esc(T.vsLast) + '</small><b>' + esc(vsTxt) + '</b></div>' : '') + '</div>';
  }
  if (!active(pe) && !done.length) h += '<div class="offnote">' + T.notPlan + '</div>';

  const editing = !!(S.edit && S.edit.pe === pe.id);
  const key = S.dayId + '|' + pe.id, allDone = done.length >= pe.sets;
  const showDraft = !editing && (!allDone || S.extraOpen === key);
  const rows = tableRows({ done, plannedSets: pe.sets, draft: showDraft ? draftFor(v, pe, done, sugg) : null, editId: editing ? S.edit.id : null, showDraft, sugg });
  if (rows.length) {
    h += '<div class="sets" id="sets"><div class="sh" aria-hidden="true"><span>' + esc(T.set) + '</span><span>' + esc(T.weightCol(S.unit)) + '</span><span>' +
      esc(T.rep.charAt(0).toUpperCase() + T.rep.slice(1)) + '</span><span>RIR</span></div>';
    for (const r of rows) {
      if (r.kind === 'done') {
        const s = r.set, row = S.local.rows.get(s.id);
        h += '<button class="srow sdone" data-edit="' + esc(s.id) + '" aria-label="' + esc(T.set + ' ' + s.set_number + ': ' + fmtN(setWeightIn(s, S.unit)) + ' ' + S.unit + ' × ' + s.reps + (s.rir != null ? ', RIR ' + fmtN(s.rir) : '')) + '">' +
          '<span class="sc"><span class="ck">✓</span><span class="sn">' + s.set_number + (row && row.dirty ? '<span class="pend" title="' + esc(T.syncPending(1)) + '">⟳</span>' : '') + '</span></span>' +
          '<span class="cell">' + fmtN(setWeightIn(s, S.unit)) + '</span><span class="cell">' + s.reps + '</span><span class="cell">' + (s.rir != null ? fmtN(s.rir) : '—') + '</span></button>';
      } else if (r.kind === 'todo') {
        h += '<div class="srow splan"><span class="sc"><span class="ck"></span><span class="sn">' + r.n + '</span></span><span class="cell">' + (r.weight != null ? fmtN(r.weight) : '—') + '</span>' +
          '<span class="cell">' + (r.reps != null ? r.reps : '—') + '</span><span class="cell">—</span></div>';
      } else h += editor(pe, r.edit ? S.edit : r.draft, r.edit);
    }
    h += '</div>';
  }
  if (!editing && allDone && S.extraOpen !== key) h += '<button class="extra" id="extra">' + T.extra + '</button>';

  // volta scorsa: calendario, data piccola, le serie separate da una riga (vanno a capo intere se non entrano)
  if (last) {
    h += '<div class="last small" id="last"><span class="lic">' + ICON_CAL + '</span><div class="lb"><b>' + T.last + ' · ' + esc(shortDate(last.date)) + '</b><div class="lvw"><div class="lv">' +
      last.sets.map((s) => '<span>' + fmtN(setWeightIn(s, S.unit)) + ' ' + S.unit + ' × ' + s.reps + ' ' + T.rep + (s.rir != null ? ' <em>@' + fmtN(s.rir) + '</em>' : '') + '</span>').join('') + '</div></div></div></div>';
  } else if (active(pe)) h += '<div class="last small"><span class="lic">' + ICON_CAL + '</span><div class="lb"><b>' + T.noLast + '</b></div></div>';

  // esercizio finito: subito il prossimo. Sull'ultimo niente scritta fissa: "Session done" compare solo dopo "Fine seduta".
  if (!editing && allDone && S.extraOpen !== key && nav.next) {
    h += '<div class="navrow"><button class="next" data-go="1"><span><span>' + T.next + '</span><b>' + esc(exName(exs[S.idx + 1])) + '</b></span><i>→</i></button></div>';
  }
  // "Fine seduta" anche nella schermata, in fondo: stessa condizione del menu "..." (dopo la prima serie salvata), stessa conferma (askEnd)
  if (v.sessions.length) h += '<button class="endbig" id="endPage">' + esc(T.endSession) + '</button>';
  return { html: h, canSave: editing || showDraft, isUpdate: editing };
}

/** Dopo "Fine seduta": riga con l'ora di chiusura e "Riapri" (finché non inizia una seduta nuova di questo giorno). */
function closedBar(v) {
  if (v.sessions.length) return '';
  const c = reopenable(v.idx, { date: S.date, day: v.day, now: new Date() });
  if (!c) return '';
  const t = new Date(c.ended_at).toLocaleTimeString(S.T.locale, { hour: '2-digit', minute: '2-digit' });
  return '<div class="closed" id="closedBar"><span>' + esc(S.T.closedAt(t)) + '</span><button id="reopen" data-sid="' + esc(c.id) + '">' + S.T.reopen + '</button></div>';
}

/** "Fine seduta": solo se c'è una seduta in corso (cioè almeno una serie salvata), in fondo al menu "..." e separato. */
function endRow(v) {
  if (!v || !v.sessions.length) return '';
  return '<div class="endrow"><button class="endbtn" id="endSession">' + S.T.endSession + '</button></div>';
}

/* ---------- barra in basso e pagine Program / Progress (solo lettura, solo dati sul telefono) ---------- */
const ICON_NAV = {
  program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>',
  track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 9v6M6.5 6.5v11M17.5 6.5v11M21 9v6M6.5 12h11"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16M7 16v-4M12 16V8M17 16v-7"/></svg>',
};
const pageLabel = (p) => ({ program: S.T.navProgram, track: S.T.navTrack, progress: S.T.navProgress }[p]);

function renderTabs() {
  $('btitle').textContent = S.page === 'track' ? S.T.workout : pageLabel(S.page).toUpperCase();
  $('wrap').className = 'wrap' + (S.page === 'track' ? '' : ' page');
  $('tabs').innerHTML = PAGES.map((p) => '<button class="tab' + (p === S.page ? ' on' : '') + '" data-page="' + p + '"' + (p === S.page ? ' aria-current="page"' : '') + '>' +
    ICON_NAV[p] + '<span>' + esc(pageLabel(p)) + '</span></button>').join('');
}

/** Cambia pagina (senza disegnare). Tasto indietro: vedi navStep in pages.js. false se la pagina è la stessa. */
function setPage(p) {
  if (!PAGES.includes(p) || p === S.page) return false;
  const step = navStep(S.page, p, pageFromState(history.state) !== START_PAGE);
  if (S.page === 'track' && curPe()) readInputs();   // i numeri scritti e non salvati restano nella bozza
  S.page = p;
  try {
    if (step === 'push') history.pushState({ gymPage: p }, '');
    else if (step === 'replace') history.replaceState({ gymPage: p }, '');
    else if (step === 'back') history.back();
  } catch (e) { /* niente cronologia: si cambia pagina lo stesso */ }
  return true;
}
/** Dopo l'accesso e a ogni avvio: si parte da Track, senza passi vecchi nella cronologia. */
function resetPage() {
  S.page = START_PAGE;
  try { if (pageFromState(history.state) !== START_PAGE) history.replaceState(null, ''); } catch (e) { /* niente */ }
}

function renderProgram() {
  const T = S.T, p = plan();
  if (!p || !p.days.length) { $('wrap').innerHTML = '<div class="load err">' + T.noPlan + '</div>' + VER('verProgram'); return; }
  $('wrap').innerHTML = '<h2 class="pgTitle" id="planName">' + esc(p.name || '') + '</h2>' + p.days.map((d) =>
    '<section class="pday' + (d.id === S.dayId ? ' on' : '') + '"><button class="pdayH" data-day="' + esc(d.id) + '" aria-label="' + esc(T.openDay(d.name)) + '">' +
    '<span><b>' + esc(d.name) + '</b><small>' + esc(T.exCount(d.exercises.length)) + '</small></span><i>›</i></button><ol class="pex">' +
    d.exercises.map((pe, i) => {
      const m = pe.machine;
      const sub = !active(pe) ? T.listOff : pe.sets + ' × ' + range(pe) + ' ' + T.rep + (rirTxt(pe) ? ' · RIR ' + rirTxt(pe) : '');
      return '<li class="' + (active(pe) ? '' : 'off') + '"><span class="n">' + (i + 1) + '</span><span class="t">' +
        (pe.superset_label ? '<span class="ss">SUPERSET ' + esc(pe.superset_label) + '</span>' : '') + '<b>' + esc(exName(pe)) + '</b><span>' + esc(sub) + '</span>' +
        (m ? '<span class="m">' + esc(machineLabel(m) || tr(m.name, S.lang) || m.code) + '</span>' : '') + '</span></li>';
    }).join('') + '</ol></section>').join('') + VER('verProgram');
}

/**
 * Progressi: due sezioni (Storico / Grafico). Solo lettura, solo dati già sul telefono (funziona offline).
 * Storico: le sedute come prima, con filtro per workout e per esercizio (si possono usare insieme).
 * Grafico: un esercizio su una macchina, un punto per seduta (e1RM della serie migliore); tocco su un punto → serie di quel giorno.
 */
function renderProgress() {
  const T = S.T, P = S.prog;
  const idx = indexRows(S.local.list());
  const list = historyList(idx, plan());
  if (!list.length) { $('wrap').innerHTML = '<div class="load" id="noHistory">' + T.noHistory + '</div>'; return; }
  const tabs = '<div class="ptabs" role="tablist">' + ['history', 'chart'].map((t) => '<button role="tab" data-ptab="' + t + '" id="ptab-' + t + '" class="' + (P.tab === t ? 'on' : '') +
    '" aria-selected="' + (P.tab === t) + '">' + esc(t === 'history' ? T.histTab : T.chartTab) + '</button>').join('') + '</div>';
  $('wrap').innerHTML = tabs + (P.tab === 'chart' ? chartView(idx, list) : historyView(list));
}

const macTxt = (m, id) => (m ? machineLabel(m) || tr(m.name, S.lang) || m.code : id ? S.T.otherMachine : '');
const setTxt = (x) => fmtN(setWeightIn(x, S.unit)) + ' ' + S.unit + ' × ' + x.reps + (x.rir != null ? '<em>@' + fmtN(x.rir) + '</em>' : '');
const pfSelect = (id, label, all, items, cur) => '<label class="pf"><span>' + esc(label) + '</span><select id="' + id + '">' +
  (all != null ? '<option value="">' + esc(all) + '</option>' : '') +
  items.map((o) => '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.t) + '</option>').join('') + '</select></label>';

function historyView(list) {
  const T = S.T, P = S.prog, opts = historyFilterOptions(list, plan());
  if (P.day && !opts.days.some((d) => d.key === P.day)) P.day = '';
  if (P.ex && !opts.exercises.some((e) => e.id === P.ex)) P.ex = '';
  const exItems = opts.exercises.map((e) => ({ v: e.id, t: tr(e.name, S.lang) || '—' })).sort((a, b) => a.t.localeCompare(b.t, T.locale));
  let h = '<div class="pfil">' + pfSelect('fDay', T.fWorkout, T.allWorkouts, opts.days.map((d) => ({ v: d.key, t: d.name || '—' })), P.day) +
    pfSelect('fEx', T.fExercise, T.allExercises, exItems, P.ex) + '</div>';
  const shown = filterHistory(list, { day: P.day, exercise: P.ex });
  if (!shown.length) return h + '<div class="load" id="noMatch">' + esc(T.noMatch) + '</div>';
  h += '<p class="pgNote">' + esc(T.historyNote) + '</p>';
  return h + shown.map((s) => {
    const live = !s.ended && s.date === S.date;
    return '<section class="hses" data-ses="' + esc(s.id) + '"><div class="hsH"><b>' + esc(shortDate(s.date)) + '</b><span>' + esc(s.dayName) + '</span>' +
      '<small' + (live ? ' class="live"' : '') + '>' + esc(live ? T.inProgress : T.setCount(s.setCount)) + '</small></div>' +
      s.exercises.map((e) => '<div class="hex"><b>' + esc(tr(e.name, S.lang) || '—') + '</b>' +
        (macTxt(e.machine, e.machineId) ? '<span class="m">' + esc(macTxt(e.machine, e.machineId)) + '</span>' : '') +
        '<div class="lv">' + e.sets.map((x) => '<span>' + setTxt(x) + '</span>').join('') + '</div></div>').join('') + '</section>';
  }).join('');
}

/** e1RM nell'unità mostrata, con un decimale (80 kg × 8 @2 → 106,7). */
const e1Txt = (kg) => String(Math.round((S.unit === 'lb' ? kg / LB : kg) * 10) / 10).replace('.', ',');

function chartView(idx, list) {
  const T = S.T, P = S.prog, choices = chartChoices(list);
  if (!choices.length) return '<div class="load" id="chartNone">' + esc(T.chartNone) + '</div>';
  if (!choices.some((c) => c.key === P.chart)) { P.chart = choices[0].key; P.pt = ''; }   // di base: l'esercizio fatto più di recente
  const c = choices.find((x) => x.key === P.chart);
  const label = (x) => (tr(x.name, S.lang) || '—') + (x.multi ? ' · ' + (macTxt(x.machine, x.machineId) || T.noMachine) : '');
  const items = choices.map((x) => ({ v: x.key, t: label(x) })).sort((a, b) => a.t.localeCompare(b.t, T.locale));
  let h = '<div class="pfil one">' + pfSelect('cEx', T.fExercise, null, items, P.chart) + '</div>';
  if (c.machineId) h += '<p class="cmac" id="chartMachine">' + esc(macTxt(c.machine, c.machineId)) + '</p>';
  const pts = e1rmPoints(idx, c.exerciseId, c.machineId);
  if (P.pt && !pts.some((p) => p.sessionId === P.pt)) P.pt = '';
  const sel = pts.find((p) => p.sessionId === P.pt) || pts[pts.length - 1] || null;
  if (pts.length < 2) return h + '<div class="load" id="chartFew">' + esc(T.chartFew) + '</div>' + (sel ? pointCard(sel, list) : '');
  // asse Y: dal minimo al massimo con un po' di margine; asse X: un punto per seduta, in ordine, a distanza uguale
  const vals = pts.map((p) => p.best);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = hi - lo > 0 ? (hi - lo) * 0.15 : Math.max(hi * 0.05, 1);
  lo = Math.max(0, lo - pad); hi += pad;
  const X = (i) => 6 + (88 * i) / (pts.length - 1), Y = (v) => 8 + 84 * (1 - (v - lo) / (hi - lo));
  const ticks = [hi, (hi + lo) / 2, lo];
  h += '<div class="chart" id="chart"><p class="cty">' + esc(T.e1rm) + ' (' + S.unit + ')</p><div class="cbox">' +
    '<div class="cyl" aria-hidden="true">' + ticks.map((t) => '<span style="top:' + Y(t) + '%">' + e1Txt(t) + '</span>').join('') + '</div>' +
    '<div class="cplot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    ticks.map((t) => '<line x1="0" x2="100" y1="' + Y(t) + '" y2="' + Y(t) + '" vector-effect="non-scaling-stroke"/>').join('') +
    '<polyline points="' + pts.map((p, i) => X(i) + ',' + Y(p.best)).join(' ') + '" vector-effect="non-scaling-stroke"/></svg>' +
    pts.map((p, i) => '<button class="cpt' + (p === sel ? ' on' : '') + '" data-pt="' + esc(p.sessionId) + '" style="left:' + X(i) + '%;top:' + Y(p.best) + '%"' +
      ' aria-pressed="' + (p === sel) + '" aria-label="' + esc(T.pointAria(shortDate(p.date), e1Txt(p.best) + ' ' + S.unit)) + '"></button>').join('') +
    '</div></div><div class="cxl" aria-hidden="true"><span>' + esc(shortDate(pts[0].date)) + '</span><span>' + esc(shortDate(pts[pts.length - 1].date)) + '</span></div>' +
    '<p class="chint">' + esc(T.chartHint) + '</p></div>';
  return h + pointCard(sel, list);
}

/** Serie del giorno toccato nel grafico: data, workout, e1RM migliore e le serie (kg × reps @RIR). */
function pointCard(p, list) {
  const T = S.T, s = list.find((x) => x.id === p.sessionId);
  return '<section class="hses cday" id="chartDay"><div class="hsH"><b>' + esc(shortDate(p.date)) + '</b><span>' + esc(s ? s.dayName : '') + '</span>' +
    '<small class="live">e1RM ' + esc(e1Txt(p.best)) + ' ' + S.unit + '</small></div>' +
    '<div class="hex"><div class="lv">' + p.sets.map((x) => '<span' + (x === p.bestSet ? ' class="bst" title="' + esc(T.best) + '"' : '') + '>' + setTxt(x) + '</span>').join('') + '</div></div></section>';
}

/** Tasto "Storico" dell'esercizio: le ultime 3 volte (stessa regola della "Volta scorsa"); si chiude e si torna subito alla serie. */
function openHist() {
  const pe = curPe(); if (!pe) return;
  const T = S.T, v = view();
  const list = lastPerformances(v.idx, pe, { excludeSessionId: v.sessions.map((s) => s.id), onOrBefore: S.date }, 3);
  const mac = pe.machine ? macTxt(pe.machine, pe.machine.id) : '';
  sheetBox('pick hsheet', '<h2>' + esc(T.histTitle) + '</h2><p class="hsub">' + esc(exName(pe)) + (mac ? ' · ' + esc(mac) : '') + '</p>' +
    (list.length ? '<div class="hlist" id="histList">' + list.map((p) => '<div class="hex"><b>' + esc(shortDate(p.date)) + '</b><div class="lv">' +
      p.sets.map((x) => '<span>' + setTxt(x) + '</span>').join('') + '</div></div>').join('') + '</div>'
      : '<p class="hsub" id="histNone">' + esc(T.histNone) + '</p>') +
    '<div class="stack"><button class="p" id="hClose">' + esc(T.close) + '</button></div>');
  $('hClose').onclick = closeSheet;
}

const exName = (pe) => tr(pe.exercise && pe.exercise.name, S.lang) || '—';
const range = (pe) => (pe.reps_min ?? '') + (pe.reps_max && pe.reps_max !== pe.reps_min ? '–' + pe.reps_max : '');
const rirTxt = (pe) => pe.rir_min == null ? '' : fmtN(pe.rir_min) + (pe.rir_max != null && pe.rir_max !== pe.rir_min ? '–' + fmtN(pe.rir_max) : '');

function infoFor(v, pe) {
  const last = lastPerformance(v.idx, pe, { excludeSessionId: v.sessions.map((s) => s.id), onOrBefore: S.date });
  return { last, sugg: suggest(pe, last, S.unit) };
}

function draftFor(v, pe, done, sugg) {
  const n = done.reduce((mx, s) => Math.max(mx, s.set_number), 0) + 1;
  const key = S.dayId + '|' + pe.id + '|' + n + '|' + S.unit;
  if (S.drafts[key]) return S.drafts[key];
  const prev = done[done.length - 1];
  const sg = sugg ? sugg.sets[Math.min(n, sugg.sets.length) - 1] : null;
  const rir0 = pe.rir_min != null ? Math.min(4, Math.round(pe.rir_min)) : 0;
  const d = { key, n, pe: pe.id,
    weight: prev ? setWeightIn(prev, S.unit) : sg ? sg.weight : '',
    reps: sg ? sg.reps : prev ? prev.reps : (pe.reps_min || ''),
    rir: prev && prev.rir != null ? Number(prev.rir) : rir0 };
  S.drafts[key] = d;
  return d;
}

/** Numero lungo (peso di 5 caratteri o più, per esempio 102,5; rep di 3 cifre): carattere un po' più piccolo, così resta tutto nella capsula. */
const longCls = (v, n) => (String(v ?? '').length >= n ? ' lng' : '');

/**
 * Serie da salvare adesso (o in modifica): una riga della tabella con due capsule "− numero +" (peso e rep)
 * e la casella RIR (un tocco = valore dopo: 0 → 1 → 2 → 3 → 4+ → 0). Salva il tasto viola in basso.
 * − / + disegnati piccoli, ma l'area di tocco di ogni tasto è almeno 40 × 40 px (vedi .cap button in styles.css).
 */
function editor(pe, d, isEdit) {
  const T = S.T, U = S.unit.toUpperCase(), R = T.rep.toUpperCase();
  const cap = (f, id, mode, val, tag, lbl) => '<div class="cell cap' + longCls(val, f === 'weight' ? 5 : 3) + '" data-lng="' + (f === 'weight' ? 5 : 3) + '"><button data-st="' + f + '" data-d="-1" aria-label="− ' + lbl + '">−</button>' +
    '<input id="' + id + '" inputmode="' + mode + '" autocomplete="off" aria-label="' + lbl + '" value="' + esc(val) + '" placeholder="0">' +
    '<button data-st="' + f + '" data-d="1" aria-label="+ ' + lbl + '">+</button><small aria-hidden="true">' + esc(tag) + '</small></div>';
  return '<div class="srow scur' + (isEdit ? ' editing' : '') + '" id="curRow"><span class="sc"><span class="ck"></span><span class="sn">' + d.n + (d.n > pe.sets ? '<small>extra</small>' : '') + '</span></span>' +
    cap('weight', 'inKg', 'decimal', fmtN(d.weight), S.unit, U) + cap('reps', 'inReps', 'numeric', d.reps, T.rep, R) +
    '<button class="rirb" id="rirVal" data-rirc="1" aria-label="' + esc(T.rirTap) + '"><b>' + rirLabel(d.rir) + '</b></button></div>' +
    (isEdit ? '<div class="edbtns"><button class="del" id="delSet">' + T.del + '</button><button id="cancelEd">' + T.cancel + '</button></div>' : '');
}

/* ---------- in basso, sopra la barra delle pagine: tasto viola per salvare + finestra del timer (solo dopo un salvataggio) ---------- */
/**
 * Prepara la barra per l'esercizio mostrato. pe = null: non si è su Allenamento (si vede solo il timer, se va).
 * Il tasto grande è "Salva serie" (#save) oppure "Aggiorna serie" (#update) mentre si modifica una serie fatta.
 */
function dock(pe, canSave = false, isUpdate = false) {
  const t = $('timer'); if (!t) return;
  t.classList.toggle('onTrack', !!pe);
  const b = t.querySelector('.go'), txt = isUpdate ? S.T.update : S.T.complete;
  b.id = isUpdate ? 'update' : 'save';
  b.setAttribute('aria-label', txt); b.title = txt; b.querySelector('.gol').textContent = txt;
  b.disabled = !pe || !canSave || S.busy;
  S.rest = pe ? restFor(pe) : 0;
  if (!T_.end) idleTimer();
}

function curPe() { const d = dayObj(); return d ? d.exercises[S.idx] : null; }
function curDraft() {
  const pe = curPe(); if (!pe) return null;
  if (S.edit && S.edit.pe === pe.id) return S.edit;
  const v = view();
  const done = doneOf(v, pe);
  return draftFor(v, pe, done, infoFor(v, pe).sugg);
}
function readInputs() {
  const d = curDraft(); if (!d) return null;
  const k = $('inKg'), r = $('inReps');
  if (k) d.weight = k.value.trim() === '' ? '' : (parseN(k.value) ?? k.value);
  if (r) d.reps = r.value.trim() === '' ? '' : (parseN(r.value) ?? r.value);
  return d;
}

/* ---------- salvataggio ---------- */
async function save(force, isUpdate) {
  const pe = curPe(), d = readInputs();
  const w = parseN(d.weight), reps = parseN(d.reps);
  if (w === null || reps === null || w < 0 || reps < 0 || reps > 200 || !Number.isInteger(reps)) { toast(S.T.needs(S.unit), true); return; }
  const v = view();
  const { last } = infoFor(v, pe);
  const kg = S.unit === 'lb' ? w * 0.45359237 : w;
  if (!force && looksWrong(kg, last)) {
    const prev = Math.max(...last.sets.map((s) => setWeightIn(s, S.unit) || 0));
    sheet(S.T.checkW, S.T.checkWmsg(fmtN(w), S.unit, fmtN(prev)), S.T.fix, S.T.anyway, () => save(true, isUpdate));
    return;
  }
  if (S.busy) return;
  S.busy = true;
  mark('saveStart');
  try {
    const values = { weight: w, unit: S.unit, reps, rir: d.rir };
    let n;
    if (isUpdate) { const s = await updateSet(S.local, S.edit.id, values); n = s.set_number; }
    else {
      const ctx = { userId: S.user.id, date: S.date, day: v.day, plan: plan(), clubId: pe.club_id || (S.snap && S.snap.homeClubId) };
      const s = await saveSet(S.local, ctx, pe, values); n = s.set_number;
      delete S.drafts[d.key];
    }
    mark('saveEnd');
    S.busy = false; S.extraOpen = null; S.edit = null;
    buzz(30);
    toast(isUpdate ? S.T.updated(n) : S.T.saved(n));
    if (!isUpdate) startTimer(restFor(pe));
    render();
    mark('saveRendered');
    syncNow();
  } catch (e) {
    S.busy = false; render();
    toast(S.T.saveErr + (e && e.message || e), true);
  }
}

/* ---------- fine seduta / riapri (sul telefono subito, poi nella coda di invio) ---------- */
async function endSession() {
  if (S.busy) return;
  S.busy = true;
  try {
    const closed = await closeSession(S.local, view().sessions);
    if (!closed.length) return;
    stopTimer();
    S.drafts = {}; S.edit = null; S.extraOpen = null; S.idx = 0;
    buzz(30);
  } finally { S.busy = false; }
  render(); scrollTo(0, 0); syncNow();
  doneBox();
}

/** Tocco su "Fine seduta" (menu "..."): prima la conferma Sì / No, poi la stessa endSession(). */
function askEnd() { sheet(S.T.endQ, '', S.T.no, S.T.yes, endSession); }

/** Dopo la chiusura riuscita: "Session done. Great workout" con un solo tasto OK. */
function doneBox() {
  sheetBox('donebox', '<h2>' + esc(S.T.doneMsg) + '</h2><div class="stack"><button class="p" id="doneOk">' + esc(S.T.ok) + '</button></div>');
  $('doneOk').onclick = closeSheet;
}

async function reopen(id) {
  if (S.busy) return;
  S.busy = true;
  try {
    if (!(await reopenSession(S.local, id))) return;
    S.drafts = {}; S.edit = null; S.extraOpen = null;
    buzz(20); toast(S.T.reopened);
  } finally { S.busy = false; }
  S.idx = firstOpenIdx(view());
  render(); syncNow();
}

function sheet(title, msg, noTxt, yesTxt, onYes) {
  $('sheetHost').innerHTML = '<div class="sheetBg" id="sbg"><div class="sheet"><h2>' + esc(title) + '</h2>' + (msg ? '<p>' + esc(msg) + '</p>' : '') +
    '<div class="row"><button id="fNo">' + esc(noTxt) + '</button><button class="p" id="fYes">' + esc(yesTxt) + '</button></div></div></div>';
  const close = () => { $('sheetHost').innerHTML = ''; };
  $('fNo').onclick = close;
  $('sbg').onclick = (ev) => { if (ev.target.id === 'sbg') close(); };
  $('fYes').onclick = () => { close(); onYes(); };
}

function askDelete() {
  const id = S.edit.id, row = S.local.rows.get(id), n = row ? row.data.set_number : '';
  sheet(S.T.delQ(n), S.T.delP, S.T.cancel, S.T.del, async () => {
    await deleteSet(S.local, id);
    S.edit = null; S.drafts = {};
    buzz(20); toast(S.T.deleted(n)); render(); syncNow();
  });
}

/* ---------- menu (account, memoria, lingua, uscita) ---------- */
function openMenu() {
  const T = S.T;
  const errs = S.local ? S.local.dirtyRows().filter((r) => r.error) : [];
  if (starterPending() && S.starter.error) errs.push({ error: 'starter: ' + S.starter.error });
  const last = S.snap && S.snap.fetchedAt ? new Date(S.snap.fetchedAt).toLocaleString(T.locale) : T.never;
  $('sheetHost').innerHTML = '<div class="sheetBg" id="sbg"><div class="sheet">' + LOGO('llogo mlogo') + '<h2>' + T.menu + '</h2><dl>' +
    '<dt>' + T.account + '</dt><dd class="acc">' + (S.starter && S.starter.value && STARTER_IMG[S.starter.value]
      ? '<img class="stMini" id="menuStarter" src="' + STARTER_IMG[S.starter.value] + '" alt="' + esc(T.starterNames[S.starter.value]) + '" title="' + esc(T.starterNames[S.starter.value]) + '">' : '') +
      '<span>' + esc(S.user && S.user.email) + '</span></dd>' +
    '<dt>' + T.sync + '</dt><dd>' + esc($('sync') ? $('sync').textContent : '') + '</dd>' +
    '<dt>' + T.lastSync + '</dt><dd>' + esc(last) + '</dd>' +
    '<dt>' + T.storage + '</dt><dd>' + (S.persisted === true ? T.persisted : S.persisted === false ? T.notPersisted : T.unknown) + '</dd>' +
    '<dt>' + T.lang + '</dt><dd><div class="seg" id="langSeg"><button data-l="it" class="' + (S.lang === 'it' ? 'on' : '') + '">IT</button><button data-l="en" class="' + (S.lang === 'en' ? 'on' : '') + '">EN</button></div></dd></dl>' +
    (errs.length ? '<div class="errs">' + T.errors + ': ' + errs.map((r) => esc(r.error)).join('<br>') + '</div>' : '') +
    '<div class="stack"><button class="p" id="mSync">' + T.syncNow + '</button><button id="mOut">' + T.logout + '</button><button id="mClose">' + T.close + '</button></div>' + VER('verMenu') + '</div></div>';
  const close = () => { $('sheetHost').innerHTML = ''; };
  $('sbg').onclick = (ev) => { if (ev.target.id === 'sbg') close(); };
  $('mClose').onclick = close;
  $('mSync').onclick = () => { close(); refresh(); };
  $('langSeg').onclick = (ev) => {
    const l = ev.target.dataset.l; if (!l || l === S.lang) return;
    ls.set('lang', l); S.lang = l; S.T = LANGS[l]; document.documentElement.lang = l;
    document.body.innerHTML = ''; render();
  };
  $('mOut').onclick = async () => {
    // Serie e scelta dello starter: si esce solo quando sono tutte online.
    if (pendingCount()) { await syncNow(); }
    if (pendingCount()) { toast(T.logoutBlocked, true); return; }
    await api.signOut();
    await S.local.clear();
    await S.store.delete('kv', 'snap:' + S.user.id);
    S.user = null; S.local = null; S.snap = null; S.starter = null; S.pick = null; S.dayId = null; ls.set('day', null);
    stopTimer(); renderLogin();
  };
}

/* ---------- Allenamento: menu "...", tendina dei workout, elenco degli esercizi ---------- */
const closeSheet = () => { $('sheetHost').innerHTML = ''; };
function sheetBox(cls, inner) {
  $('sheetHost').innerHTML = '<div class="sheetBg" id="sbg"><div class="sheet ' + cls + '" role="dialog">' + inner + '</div></div>';
  $('sbg').onclick = (ev) => { if (ev.target.id === 'sbg') closeSheet(); };
}

/** Menu "...": data, luna (giorno/notte), kg/lb, Account (versione, sincronizzazione, lingua, Esci), Fine seduta. */
function openMore() {
  const T = S.T, v = plan() && dayObj() ? view() : null;
  const unitBtns = () => ['kg', 'lb'].map((u) => '<button data-mu="' + u + '" class="' + (u === S.unit ? 'on' : '') + '">' + u + '</button>').join('');
  sheetBox('msheet', '<h2>' + esc(T.more) + '</h2>' +
    '<div class="mrow"><span class="pill static" id="mDate">' + esc(T.today.toUpperCase() + ' · ' + niceDate(S.date)) + '</span>' +
    '<span class="mctl"><button class="theme" id="mTheme" aria-label="' + esc(T.dayNight) + '">' + themeIcon() + '</button>' +
    '<span class="seg" id="mUnit" role="group" aria-label="' + esc(T.unit) + '">' + unitBtns() + '</span></span></div>' +
    '<div class="stack"><button id="mAccount">' + esc(T.account) + '</button><button id="moreClose">' + esc(T.close) + '</button></div>' + endRow(v));
  $('mTheme').onclick = toggleTheme;
  $('mUnit').onclick = (ev) => { const u = ev.target.dataset.mu; if (!u) return; setUnit(u); $('mUnit').innerHTML = unitBtns(); };
  $('mAccount').onclick = openMenu;
  $('moreClose').onclick = closeSheet;
  if ($('endSession')) $('endSession').onclick = askEnd;
}

/** Tendina "Upper A ▾": i giorni del piano; toccandone uno si apre quel giorno (come le schede di prima). */
function openDays() {
  const p = plan(); if (!p || !p.days.length) return;
  const T = S.T, idx = indexRows(S.local.list());
  const opts = dayOptions(p.days, dayObj().id, (d) => {
    const vv = { idx, sessions: openSessions(idx, { date: S.date, day: d, now: new Date() }) };
    const act = d.exercises.filter(active);
    return { total: act.reduce((a, e) => a + e.sets, 0), done: act.reduce((a, e) => a + Math.min(doneOf(vv, e).length, e.sets), 0) };
  });
  sheetBox('pick', '<h2>' + esc(T.chooseDay) + '</h2><div class="plist">' + opts.map((o) =>
    '<button class="popt' + (o.on ? ' on' : '') + '" data-pday="' + esc(o.id) + '"' + (o.on ? ' aria-current="true"' : '') + '><span class="t"><b>' + esc(o.name) + '</b><small>' +
    esc(T.exCount(o.count)) + '</small></span>' + (o.done ? '<em>' + o.done + '/' + o.total + '</em>' : '') + '<i>' + (o.on ? '✓' : '') + '</i></button>').join('') +
    '</div><div class="stack"><button id="pClose">' + esc(T.close) + '</button></div>');
  $('pClose').onclick = closeSheet;
  document.querySelectorAll('[data-pday]').forEach((b) => { b.onclick = () => { closeSheet(); chooseDay(b.dataset.pday); }; });
}

/** Tendina "Esercizio N di M ▾": tutti gli esercizi del giorno, in qualsiasi ordine. */
function openExList() {
  const d = dayObj(); if (!d) return;
  const v = view();
  sheetBox('pick', '<h2>' + esc(S.T.exercises) + '</h2><div class="plist exl">' + d.exercises.map((x, i) => exItem(v, x, i, 'data-pidx')).join('') +
    '</div><div class="stack"><button id="pClose">' + esc(S.T.close) + '</button></div>');
  $('pClose').onclick = closeSheet;
  document.querySelectorAll('[data-pidx]').forEach((b) => { b.onclick = () => { closeSheet(); goTo(Number(b.dataset.pidx)); scrollTo(0, 0); }; });
}

/** Giorno scelto (tendina in Allenamento o tocco in Programma): vale solo per oggi, si apre sul primo esercizio non finito. */
function chooseDay(id) {
  if (setPage('track')) scrollTo(0, 0);
  S.dayId = id; ls.set('day', S.date + '|' + S.dayId); S.idx = firstOpenIdx(view()); S.extraOpen = null; S.edit = null; render();
}

/** kg / lb (testata di Programma e Progressi, menu "..." in Allenamento). Come prima: i numeri scritti restano nella bozza. */
function setUnit(u) {
  if (curPe()) readInputs();
  if (u !== S.unit) { S.unit = u; ls.set('unit', S.unit); S.drafts = {}; S.edit = null; render(); }
}

/* ---------- timer di recupero (sopravvive alla chiusura dell'app) ---------- */
const T_ = { end: 0, tot: 0, iv: null, buzzed: false };
function saveTimer() { ls.set('timer', T_.end ? JSON.stringify({ end: T_.end, tot: T_.tot }) : null); }
function startTimer(sec) { T_.tot = sec; T_.end = Date.now() + sec * 1000; T_.buzzed = false; saveTimer(); showTimer(); }
function showTimer() { $('timer').classList.remove('idle'); $('tStop').disabled = false; tick(); clearInterval(T_.iv); T_.iv = setInterval(tick, 250); }
function stopTimer() { clearInterval(T_.iv); T_.end = 0; saveTimer(); idleTimer(); }
/** Timer chiuso (col ✕, a fine tempo + 10 minuti, o mai partito): la finestra sparisce, resta solo il tasto viola. */
function idleTimer() {
  const t = $('timer'); if (!t) return;
  t.classList.add('idle'); t.classList.remove('zero');
  $('tTxt').textContent = clock(S.rest || 0); $('tLab').textContent = S.T.rest; $('tPg').style.width = '0%';
  $('tStop').disabled = true;
}
function resumeTimer() {
  try { const t = JSON.parse(ls.get('timer') || 'null'); if (t && Date.now() - t.end < 10 * 60000) { T_.end = t.end; T_.tot = t.tot; T_.buzzed = Date.now() > t.end; showTimer(); } } catch (e) { /* niente */ }
}
function tick() {
  if (!$('timer')) return;
  const left = Math.round((T_.end - Date.now()) / 1000), a = Math.abs(left);
  $('tTxt').textContent = (left < 0 ? '+' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');
  $('tLab').textContent = left > 0 ? S.T.rest : S.T.go;
  $('tPg').style.width = Math.max(0, Math.min(100, (1 - left / T_.tot) * 100)) + '%';
  $('timer').classList.toggle('zero', left <= 0);
  if (left <= 0 && !T_.buzzed) { T_.buzzed = true; buzz([200, 100, 200]); }
  if (left < -600) stopTimer();
}

/* ---------- eventi ---------- */
function goTo(i) { if (curPe()) readInputs(); S.idx = i; S.extraOpen = null; S.edit = null; render(); }

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || !S.snap || !$('wrap')) return;
  // tasti con un loro gestore: menu e tendine (.sheet), timer, luna
  if (b.closest('.sheet') || ['tMinus', 'tPlus', 'tStop', 'themeBtn'].includes(b.id)) return;
  if (b.id === 'notesBtn') { S.openNotes = !S.openNotes; render(); return; }
  if (b.id === 'histBtn') { openHist(); return; }
  // Progressi: sezione Storico / Grafico, punto del grafico (solo cose da vedere, niente dati cambiati)
  if (b.dataset.ptab) { if (S.prog.tab !== b.dataset.ptab) { S.prog.tab = b.dataset.ptab; render(); } return; }
  if (b.dataset.pt) { S.prog.pt = b.dataset.pt; render(); return; }
  if (b.id === 'dayBtn') { openDays(); return; }
  if (b.id === 'hBack') { if (setPage('program')) { render(); scrollTo(0, 0); } return; }   // freccia indietro: a Programma (come il tasto in basso)
  if (b.id === 'moreBtn') { openMore(); return; }
  if (b.id === 'exList') { openExList(); return; }
  if (b.dataset.page) { if (setPage(b.dataset.page)) { render(); scrollTo(0, 0); } return; }
  const pe = curPe();
  // giorno toccato nelle schede di Track o in Program: si apre quel giorno in Track (come le schede di sempre)
  if (b.dataset.day) { chooseDay(b.dataset.day); return; }
  if (b.dataset.idx !== undefined) { goTo(Number(b.dataset.idx)); return; }
  if (b.dataset.go) { const i = S.idx + Number(b.dataset.go); if (pe && i >= 0 && i < dayObj().exercises.length) { goTo(i); scrollTo(0, 0); } return; }
  if (b.dataset.u) { setUnit(b.dataset.u); return; }
  if (b.dataset.edit) {
    const id = b.dataset.edit;
    if (S.edit && S.edit.id === id) { S.edit = null; render(); return; }
    const s = S.local.rows.get(id).data;
    S.edit = { id, pe: pe.id, n: s.set_number, weight: setWeightIn(s, S.unit), reps: s.reps, rir: s.rir == null ? 0 : Math.min(4, Math.round(Number(s.rir))) };
    render(); return;
  }
  if (b.dataset.st) {
    const d = readInputs(), f = b.dataset.st, dir = Number(b.dataset.d);
    const cur = parseN(d[f]) ?? 0;
    d[f] = f === 'weight' ? stepWeight(cur, pe.machine, S.unit, dir) : Math.max(0, Math.round(cur + dir));
    const inp = $(f === 'weight' ? 'inKg' : 'inReps'); inp.value = fmtN(d[f]); inp.parentNode.classList.toggle('lng', inp.value.length >= Number(inp.parentNode.dataset.lng)); buzz(8); return;
  }
  // RIR a tocco: valore dopo (0 → 1 → 2 → 3 → 4+ → 0); il valore resta nella bozza e si salva come prima
  if (b.dataset.rirc) {
    const d = readInputs(); d.rir = rirNext(d.rir);
    b.querySelector('b').textContent = rirLabel(d.rir);
    buzz(8); return;
  }
  if (b.id === 'save') { save(false, false); return; }
  if (b.id === 'update') { save(false, true); return; }
  if (b.id === 'delSet') { askDelete(); return; }
  if (b.id === 'cancelEd') { S.edit = null; render(); return; }
  if (b.id === 'extra') { S.extraOpen = S.dayId + '|' + pe.id; render(); return; }
  if (b.id === 'endSession') { endSession(); return; }
  if (b.id === 'endPage') { askEnd(); return; }
  if (b.id === 'reopen') { reopen(b.dataset.sid); return; }
});
// filtri dello Storico e scelta del grafico (tendine di Progressi)
document.addEventListener('change', (ev) => {
  const id = ev.target.id;
  if (id === 'fDay') S.prog.day = ev.target.value;
  else if (id === 'fEx') S.prog.ex = ev.target.value;
  else if (id === 'cEx') { S.prog.chart = ev.target.value; S.prog.pt = ''; }
  else return;
  render();
});
document.addEventListener('input', (ev) => { if (ev.target.id === 'inKg' || ev.target.id === 'inReps') { readInputs(); ev.target.parentNode.classList.toggle('lng', ev.target.value.length >= Number(ev.target.parentNode.dataset.lng)); } });

// scorrimento orizzontale tra esercizi (telefono)
let sx = null, sy = null;
document.addEventListener('touchstart', (ev) => { if (S.page !== 'track' || ev.target.closest('input,.bar,.sheet,.tabbar,.timer,.cap,.rirb')) { sx = null; return; } sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', (ev) => {
  if (sx === null || !S.snap || !$('wrap') || S.page !== 'track' || innerWidth >= 700 || !dayObj()) return;
  const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
    const n = dayObj().exercises.length, ni = S.idx + (dx < 0 ? 1 : -1);
    if (ni >= 0 && ni < n) goTo(ni);
  }
  sx = null;
}, { passive: true });

// tasto indietro (e avanti) del telefono o del browser: Program/Progress → Track; da Track come prima (esce)
addEventListener('popstate', (ev) => {
  if (!S.user || !S.snap || !$('wrap')) return;
  const p = pageFromState(ev.state);
  if (p === S.page) return;
  if (S.page === 'track' && curPe()) readInputs();
  S.page = p; render(); scrollTo(0, 0);
});

// rete e ritorno sull'app: si invia la coda appena possibile
addEventListener('online', () => { log('online'); S.sync.offline = false; syncNow(true); refresh(); });
addEventListener('offline', () => { S.sync.offline = true; setSync(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !S.user) return;
  if (S.date !== localDate()) safeRender();
  if (Date.now() - S.lastRefresh > 10 * 60000) refresh(); else syncNow();
});
setInterval(() => { if (S.local && pendingCount() && navigator.onLine) syncNow(); }, 20000);

window.__gym = { S, syncNow, refresh, LOG };
boot();
