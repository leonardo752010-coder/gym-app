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
import {
  localDate, addDays, indexRows, openSessions, setsInSessions, lastPerformance, suggest, stepWeight,
  restFor, defaultDay, looksWrong, machineLabel, setWeightIn, kgToUnit, round2, reopenable,
} from './logic.js';

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
};
S.T = LANGS[S.lang];
document.documentElement.lang = S.lang;

/* ---------- giorno / notte ---------- */
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $('themeBtn'); if (b) b.innerHTML = t === 'light' ? ICON_MOON : ICON_SUN;
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = t === 'light' ? '#f4ede1' : '#121110';
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
  if (!api) { document.body.innerHTML = '<div class="load err">' + esc(S.T.noConfig) + '</div>'; return; }
  askPersist();
  S.user = storedUser();
  if (!S.user) { renderLogin(); return; }
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
    await syncNow(true);
    const uid = S.user.id;
    const [snap, hist] = await Promise.all([api.snapshot(uid), api.history(uid, addDays(localDate(), -HISTORY_DAYS))]);
    if (!S.user || S.user.id !== uid) return;
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

async function syncNow(force = false) {
  if (!S.local) return;
  if (!S.local.dirtyRows().length) { updateSyncInfo(); setSync(); return; }
  // Senza rete non si prova (si riprova all'evento "online"); "force" quando la rete è appena tornata o lo chiede l'utente,
  // perché navigator.onLine a volte resta indietro.
  if (!force && !navigator.onLine) { S.sync.offline = true; setSync(); return; }
  S.sync.state = 'syncing'; setSync();
  log('sync', S.local.dirtyRows().length);
  const r = await flush(S.local, api);
  log('sync-end', JSON.stringify(r));
  S.sync.offline = r.offline;
  updateSyncInfo();
  setSync();
  if (r.sent) safeRender();
}

function updateSyncInfo() {
  const d = S.local ? S.local.dirtyRows() : [];
  S.sync.pending = d.length;
  S.sync.failed = d.filter((r) => r.error).length;
  S.sync.state = !d.length ? 'ok' : S.sync.failed ? 'err' : (S.sync.offline || !navigator.onLine) ? 'offline' : 'pending';
  document.body.dataset.sync = S.sync.state;
  document.body.dataset.pending = String(d.length);
}

function setSync() {
  updateSyncInfo();
  const el = $('sync'); if (!el) return;
  const T = S.T, p = S.sync.pending;
  const txt = S.sync.state === 'ok' ? T.syncOk : S.sync.state === 'syncing' ? T.syncing : S.sync.state === 'err' ? T.syncErr(S.sync.failed)
    : S.sync.state === 'offline' ? T.syncOffline(p) : T.syncPending(p);
  el.className = 'sync ' + S.sync.state;
  el.innerHTML = '<i></i>' + esc(txt);
}

/** Ridisegna senza chiudere la tastiera mentre l'utente scrive. */
function safeRender() {
  const a = document.activeElement;
  if (a && a.tagName === 'INPUT' && $('wrap') && $('wrap').contains(a)) { S.pendingRender = true; setSync(); return; }
  if (S.user && S.snap) render(); else setSync();
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender) { S.pendingRender = false; safeRender(); } }, 50));

/* ---------- accesso ---------- */
function renderLogin(msg) {
  document.body.innerHTML = '<main class="login"><img class="blogo" src="./icons/icon-192.png" alt="Gym"><h1>' + S.T.loginTitle + '</h1>' +
    '<form id="loginForm" autocomplete="on"><input id="email" type="email" inputmode="email" autocomplete="username" placeholder="' + S.T.email + '" required>' +
    '<input id="pass" type="password" autocomplete="current-password" placeholder="' + S.T.password + '" required>' +
    '<button class="save" id="loginBtn" type="submit">' + S.T.login + '</button></form>' +
    '<div class="msg" id="loginMsg">' + esc(msg || '') + '</div><div class="note">' + S.T.install + '</div></main>' +
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
    await openLocal();
    if (S.snap) render(); else renderLoading();
    refresh();
  };
}

function renderLoading(msg, retry) {
  shell();
  $('wrap').innerHTML = '<div class="load" style="grid-column:1/-1">' + (msg ? '<div class="err">' + esc(msg) + '</div>' : '<div class="spin"></div>') +
    '<span>' + (msg ? '' : S.T.loading) + '</span>' + (retry ? '<button class="pill" id="retry">↻</button>' : '') + '</div>';
  if (retry) $('retry').onclick = () => { renderLoading(); refresh(); };
}

/* ---------- struttura della pagina ---------- */
function shell() {
  if ($('wrap') && $('days')) return;
  document.body.innerHTML = `
<header class="top"><div class="hdr"><div class="brand">
  <img class="blogo" id="logo" src="./icons/icon-192.png" alt="Gym">
  <div class="btitle">${S.T.workout}</div><div class="sync" id="sync"></div></div>
  <div class="ctrls"><span class="pill static" id="dateTxt"></span>
  <button class="theme" id="themeBtn" aria-label="${S.T.dayNight}"></button>
  <div class="seg" id="unitSeg"><button data-u="kg">kg</button><button data-u="lb">lb</button></div></div></div>
  <div class="days" id="days"></div><div id="progBox"></div></header>
<main class="wrap" id="wrap"></main>
<div class="timer hide" id="timer"><div class="pg" id="tPg"></div><div class="tt"><span id="tLab"></span><b id="tTxt">0:00</b></div><button id="tMinus">−15</button><button id="tPlus">+15</button><button id="tStop">✕</button></div>
<div class="toast" id="toast"></div><div id="sheetHost"></div>`;
  applyTheme(theme());
  $('themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; ls.set('theme', t); applyTheme(t); buzz(8); };
  $('tMinus').onclick = () => { T_.end -= 15000; saveTimer(); tick(); };
  $('tPlus').onclick = () => { T_.end += 15000; T_.tot += 15; saveTimer(); tick(); };
  $('tStop').onclick = stopTimer;
  $('logo').onclick = openMenu;
  $('sync').onclick = openMenu;
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
  shell();
  setSync();
  const T = S.T;
  $('dateTxt').textContent = T.today.toUpperCase() + ' · ' + niceDate(S.date);
  [...$('unitSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.u === S.unit));
  const p = plan();
  if (!p || !p.days.length) { $('days').innerHTML = ''; $('progBox').innerHTML = ''; $('wrap').innerHTML = '<div class="load err" style="grid-column:1/-1">' + T.noPlan + '</div>'; return; }

  let v = view();
  if (!S.dayId || !p.days.some((d) => d.id === S.dayId)) {
    const d = defaultDay(p, v.idx, S.date, new Date()); S.dayId = d.id; v = view(); S.idx = firstOpenIdx(v); S.idxSet = true;
  }
  if (!S.idxSet) { S.idx = firstOpenIdx(v); S.idxSet = true; }   // all'apertura: primo esercizio non finito
  $('days').innerHTML = p.days.map((d) => {
    const vv = { idx: v.idx, sessions: openSessions(v.idx, { date: S.date, day: d, now: new Date() }) };
    const act = d.exercises.filter(active), tot = act.reduce((a, e) => a + e.sets, 0);
    const dn = act.reduce((a, e) => a + Math.min(doneOf(vv, e).length, e.sets), 0);
    return '<button class="day' + (d.id === v.day.id ? ' on' : '') + '" data-day="' + esc(d.id) + '">' + esc(d.name) + (dn ? '<small>' + dn + '/' + tot + '</small>' : '') + '</button>';
  }).join('');

  const exs = v.day.exercises;
  if (!exs.length) { $('progBox').innerHTML = ''; $('wrap').innerHTML = ''; return; }
  if (S.idx >= exs.length) S.idx = 0;
  const pe = exs[S.idx];
  const prog = (x) => { const n = doneOf(v, x).length; return active(x) ? Math.min(n / x.sets, 1) : 0; };
  $('progBox').innerHTML = '<div class="prog">' + T.exOf(S.idx + 1, exs.length) + '</div><div class="bar">' +
    exs.map((x, i) => '<button data-idx="' + i + '" class="' + (i === S.idx ? 'cur' : prog(x) >= 1 ? 'full' : '') + '" aria-label="' + esc(exName(x)) + '"></button>').join('') + '</div>';
  const list = '<aside class="list">' + exs.map((x, i) => {
    const n = doneOf(v, x).length, pr = prog(x);
    const cls = 'li' + (i === S.idx ? ' cur' : '') + (pr >= 1 ? ' full' : '') + (!active(x) && !n ? ' off' : '');
    const sub = !active(x) ? T.listOff : n + '/' + x.sets + ' ' + T.sets + ' · ' + range(x);
    return '<button class="' + cls + '" data-idx="' + i + '"><span class="n">' + (pr >= 1 ? '✓' : i + 1) + '</span><span class="t"><b>' +
      esc(exName(x)) + '</b><span>' + esc(sub) + '</span></span></button>';
  }).join('') + '</aside>';
  $('wrap').innerHTML = list + '<section>' + closedBar(v) + card(v, pe) + navRow(v, exs) + endRow(v) + '</section>';
}

/** Dopo "Fine seduta": riga con l'ora di chiusura e "Riapri" (finché non inizia una seduta nuova di questo giorno). */
function closedBar(v) {
  if (v.sessions.length) return '';
  const c = reopenable(v.idx, { date: S.date, day: v.day, now: new Date() });
  if (!c) return '';
  const t = new Date(c.ended_at).toLocaleTimeString(S.T.locale, { hour: '2-digit', minute: '2-digit' });
  return '<div class="closed" id="closedBar"><span>' + esc(S.T.closedAt(t)) + '</span><button id="reopen" data-sid="' + esc(c.id) + '">' + S.T.reopen + '</button></div>';
}

/** "Fine seduta": solo se c'è una seduta in corso (cioè almeno una serie salvata), in fondo e separato. */
function endRow(v) {
  if (!v.sessions.length) return '';
  return '<div class="endrow"><button class="endbtn" id="endSession">' + S.T.endSession + '</button></div>';
}

const exName = (pe) => tr(pe.exercise && pe.exercise.name, S.lang) || '—';
const range = (pe) => (pe.reps_min ?? '') + (pe.reps_max && pe.reps_max !== pe.reps_min ? '–' + pe.reps_max : '');
const rirTxt = (pe) => pe.rir_min == null ? '' : fmtN(pe.rir_min) + (pe.rir_max != null && pe.rir_max !== pe.rir_min ? '–' + fmtN(pe.rir_max) : '');

function navRow(v, exs) {
  let h = '<div class="navrow">';
  if (S.idx > 0) h += '<button class="back" data-go="-1" aria-label="' + S.T.back + '">‹</button>';
  if (S.idx < exs.length - 1) h += '<button class="next" data-go="1"><span><span>' + S.T.next + '</span><b>' + esc(exName(exs[S.idx + 1])) + '</b></span><i>→</i></button>';
  else {
    const allDone = exs.every((x) => !active(x) || doneOf(v, x).length >= x.sets);
    h += '<div class="finish">' + (allDone ? S.T.finished : '') + '</div>';
  }
  return h + '</div>';
}

function infoFor(v, pe) {
  const last = lastPerformance(v.idx, pe, { excludeSessionId: v.sessions.map((s) => s.id), onOrBefore: S.date });
  return { last, sugg: suggest(pe, last, S.unit) };
}

function card(v, pe) {
  const T = S.T, done = doneOf(v, pe), { last, sugg } = infoFor(v, pe);
  const m = pe.machine;
  let h = '<div class="card">' + (pe.superset_label ? '<div class="ss">SUPERSET ' + esc(pe.superset_label) + '</div>' : '') +
    '<h1 class="ex">' + esc(exName(pe)) + '</h1><div class="sub"></div>';
  if (m) {
    const wl = Array.isArray(m.weight_list) ? m.weight_list : [];
    const stepTxt = wl.length ? (wl.length > 5 ? fmtN(wl[0]) + '…' + fmtN(wl[wl.length - 1]) + ' ' + m.weight_unit + ' (' + T.weights(wl.length) + ')' : wl.map(fmtN).join(' / ') + ' ' + m.weight_unit)
      : m.weight_step ? T.step + ' ' + fmtN(m.weight_step) + ' ' + m.weight_unit : '';
    h += '<div class="mac">' + esc(machineLabel(m) || tr(m.name, S.lang) || m.code) + (stepTxt ? ' <span>· ' + esc(stepTxt) + '</span>' : '') +
      (pe.alt_machine ? ' <span>· ' + T.alt + ': ' + esc(machineLabel(pe.alt_machine) || pe.alt_machine.code) + '</span>' : '') + '</div>';
  }
  h += '<div class="chips"><span>' + pe.sets + ' × ' + esc(range(pe)) + ' ' + T.rep + '</span>' +
    (rirTxt(pe) ? '<span>RIR ' + esc(rirTxt(pe)) + '</span>' : '') + (pe.muscle ? '<span>' + esc(tr(pe.muscle, S.lang)) + '</span>' : '') + '</div>';
  if (pe.notes) h += '<p class="notes' + (S.openNotes ? ' open' : '') + '" id="notes">' + esc(pe.notes) + '</p>';

  const nextN = done.reduce((mx, s) => Math.max(mx, s.set_number), 0) + 1;
  const sg = sugg && sugg.sets[Math.min(nextN, sugg.sets.length) - 1];
  if (sg && done.length < Math.max(pe.sets, 1)) {
    h += '<div class="sugg" id="sugg"><b>' + T.suggested + ' · ' + T.set + ' ' + nextN + '</b><div class="sv">' + fmtN(sg.weight) + ' ' + S.unit + ' × ' + sg.reps +
      '</div><div class="why">' + esc(T.why[sg.why]) + '</div></div>';
  }
  if (last) {
    h += '<div class="last small" id="last"><b>' + T.last + ' · ' + esc(shortDate(last.date)) + '</b><div class="lv">' +
      last.sets.map((s) => '<span>' + fmtN(setWeightIn(s, S.unit)) + ' × ' + s.reps + (s.rir != null ? '<em>@' + fmtN(s.rir) + '</em>' : '') + '</span>').join('') + '</div></div>';
  } else if (active(pe)) h += '<div class="last small"><b>' + T.noLast + '</b></div>';

  if (!active(pe) && !done.length) h += '<div class="offnote">' + T.notPlan + '</div>';
  const editing = S.edit && S.edit.pe === pe.id;
  done.forEach((s) => {
    const isEd = editing && S.edit.id === s.id;
    const row = S.local.rows.get(s.id);
    h += '<button class="done' + (isEd ? ' editing' : '') + '" data-edit="' + esc(s.id) + '"><span class="ck">✓</span><span class="sn">' + T.set + ' ' + s.set_number +
      (row && row.dirty ? '<span class="pend" title="' + esc(T.syncPending(1)) + '">⟳</span>' : '') +
      '</span><span class="sv">' + fmtN(setWeightIn(s, S.unit)) + ' ' + S.unit + ' × ' + s.reps + (s.rir != null ? '<small>RIR ' + fmtN(s.rir) + '</small>' : '') + '</span></button>';
    if (isEd) h += editor(pe, S.edit, true);
  });
  const allDone = done.length >= pe.sets;
  const key = S.dayId + '|' + pe.id;
  if (!editing && (!allDone || S.extraOpen === key)) {
    const d = draftFor(v, pe, done, sugg);
    h += editor(pe, d, false);
    for (let n = d.n + 1; n <= pe.sets; n++) h += '<div class="todo"><span>' + T.set + ' ' + n + '</span><span>—</span></div>';
  }
  if (!editing && allDone && S.extraOpen !== key) h += '<button class="extra" id="extra">' + T.extra + '</button>';
  return h + '</div>';
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

function editor(pe, d, isEdit) {
  const T = S.T;
  return '<div class="ed"><div class="edh"><b>' + T.set + ' ' + d.n + (d.n > pe.sets ? ' (extra)' : '') + '</b><span>' + T.target + ' ' + esc(range(pe)) + ' ' + T.rep + '</span></div>' +
    '<div class="boxes">' +
    '<div class="box"><div class="lbl">' + S.unit.toUpperCase() + '</div><input id="inKg" inputmode="decimal" autocomplete="off" value="' + esc(fmtN(d.weight)) + '" placeholder="0">' +
    '<div class="pm"><button data-st="weight" data-d="-1" aria-label="−">−</button><button data-st="weight" data-d="1" aria-label="+">+</button></div></div>' +
    '<div class="box"><div class="lbl">' + T.rep.toUpperCase() + '</div><input id="inReps" inputmode="numeric" autocomplete="off" value="' + esc(d.reps) + '" placeholder="0">' +
    '<div class="pm"><button data-st="reps" data-d="-1" aria-label="−">−</button><button data-st="reps" data-d="1" aria-label="+">+</button></div></div>' +
    '</div><div class="rirrow"><span>RIR</span><div class="r5">' + [0, 1, 2, 3, 4].map((n) => '<button data-rir="' + n + '" class="' + (d.rir === n ? 'on' : '') + '">' + (n === 4 ? '4+' : n) + '</button>').join('') + '</div></div>' +
    (isEdit
      ? '<button class="save" id="update"' + (S.busy ? ' disabled' : '') + '>' + T.update + '</button><div class="edbtns"><button class="del" id="delSet">' + T.del + '</button><button id="cancelEd">' + T.cancel + '</button></div>'
      : '<button class="save" id="save"' + (S.busy ? ' disabled' : '') + '>' + T.save + '</button>') + '</div>';
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
    buzz(30); toast(S.T.ended);
  } finally { S.busy = false; }
  render(); scrollTo(0, 0); syncNow();
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
  $('sheetHost').innerHTML = '<div class="sheetBg" id="sbg"><div class="sheet"><h2>' + esc(title) + '</h2><p>' + esc(msg) +
    '</p><div class="row"><button id="fNo">' + esc(noTxt) + '</button><button class="p" id="fYes">' + esc(yesTxt) + '</button></div></div></div>';
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
  const last = S.snap && S.snap.fetchedAt ? new Date(S.snap.fetchedAt).toLocaleString(T.locale) : T.never;
  $('sheetHost').innerHTML = '<div class="sheetBg" id="sbg"><div class="sheet"><h2>' + T.menu + '</h2><dl>' +
    '<dt>' + T.account + '</dt><dd>' + esc(S.user && S.user.email) + '</dd>' +
    '<dt>' + T.sync + '</dt><dd>' + esc($('sync') ? $('sync').textContent : '') + '</dd>' +
    '<dt>' + T.lastSync + '</dt><dd>' + esc(last) + '</dd>' +
    '<dt>' + T.storage + '</dt><dd>' + (S.persisted === true ? T.persisted : S.persisted === false ? T.notPersisted : T.unknown) + '</dd>' +
    '<dt>' + T.lang + '</dt><dd><div class="seg" id="langSeg"><button data-l="it" class="' + (S.lang === 'it' ? 'on' : '') + '">IT</button><button data-l="en" class="' + (S.lang === 'en' ? 'on' : '') + '">EN</button></div></dd>' +
    '<dt>' + T.version + '</dt><dd>' + esc(VERSION) + (cfg.locale ? ' (locale)' : '') + '</dd></dl>' +
    (errs.length ? '<div class="errs">' + T.errors + ': ' + errs.map((r) => esc(r.error)).join('<br>') + '</div>' : '') +
    '<div class="stack"><button class="p" id="mSync">' + T.syncNow + '</button><button id="mOut">' + T.logout + '</button><button id="mClose">' + T.close + '</button></div></div></div>';
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
    if (S.local.dirtyRows().length) { await syncNow(); }
    if (S.local.dirtyRows().length) { toast(T.logoutBlocked, true); return; }
    await api.signOut();
    await S.local.clear();
    await S.store.delete('kv', 'snap:' + S.user.id);
    S.user = null; S.local = null; S.snap = null; S.dayId = null; ls.set('day', null);
    stopTimer(); renderLogin();
  };
}

/* ---------- timer di recupero (sopravvive alla chiusura dell'app) ---------- */
const T_ = { end: 0, tot: 0, iv: null, buzzed: false };
function saveTimer() { ls.set('timer', T_.end ? JSON.stringify({ end: T_.end, tot: T_.tot }) : null); }
function startTimer(sec) { T_.tot = sec; T_.end = Date.now() + sec * 1000; T_.buzzed = false; saveTimer(); showTimer(); }
function showTimer() { $('timer').classList.remove('hide'); tick(); clearInterval(T_.iv); T_.iv = setInterval(tick, 250); }
function stopTimer() { clearInterval(T_.iv); T_.end = 0; saveTimer(); const t = $('timer'); if (t) t.classList.add('hide'); }
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
  const b = ev.target.closest('button, #notes');
  if (!b || !S.snap || !$('wrap')) return;
  if (b.closest('.sheet') || b.closest('.timer') || b.id === 'themeBtn') return;
  if (b.id === 'notes') { S.openNotes = !S.openNotes; b.classList.toggle('open', S.openNotes); return; }
  const pe = curPe();
  if (b.dataset.day) { S.dayId = b.dataset.day; ls.set('day', S.date + '|' + S.dayId); S.idx = firstOpenIdx(view()); S.extraOpen = null; S.edit = null; render(); return; }
  if (b.dataset.idx !== undefined) { goTo(Number(b.dataset.idx)); return; }
  if (b.dataset.go) { goTo(S.idx + Number(b.dataset.go)); scrollTo(0, 0); return; }
  if (b.dataset.u) {
    if (pe) readInputs();
    if (b.dataset.u !== S.unit) { S.unit = b.dataset.u; ls.set('unit', S.unit); S.drafts = {}; S.edit = null; render(); }
    return;
  }
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
    $(f === 'weight' ? 'inKg' : 'inReps').value = fmtN(d[f]); buzz(8); return;
  }
  if (b.dataset.rir !== undefined) {
    const d = readInputs(); d.rir = Number(b.dataset.rir);
    [...b.parentNode.children].forEach((x) => x.classList.toggle('on', x === b)); buzz(8); return;
  }
  if (b.id === 'save') { save(false, false); return; }
  if (b.id === 'update') { save(false, true); return; }
  if (b.id === 'delSet') { askDelete(); return; }
  if (b.id === 'cancelEd') { S.edit = null; render(); return; }
  if (b.id === 'extra') { S.extraOpen = S.dayId + '|' + pe.id; render(); return; }
  if (b.id === 'endSession') { endSession(); return; }
  if (b.id === 'reopen') { reopen(b.dataset.sid); return; }
});
document.addEventListener('input', (ev) => { if (ev.target.id === 'inKg' || ev.target.id === 'inReps') readInputs(); });

// scorrimento orizzontale tra esercizi (telefono)
let sx = null, sy = null;
document.addEventListener('touchstart', (ev) => { if (ev.target.closest('input,.days,.bar,.sheet')) { sx = null; return; } sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', (ev) => {
  if (sx === null || !S.snap || innerWidth >= 700 || !dayObj()) return;
  const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
    const n = dayObj().exercises.length, ni = S.idx + (dx < 0 ? 1 : -1);
    if (ni >= 0 && ni < n) goTo(ni);
  }
  sx = null;
}, { passive: true });

// rete e ritorno sull'app: si invia la coda appena possibile
addEventListener('online', () => { log('online'); S.sync.offline = false; syncNow(true); refresh(); });
addEventListener('offline', () => { S.sync.offline = true; setSync(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !S.user) return;
  if (S.date !== localDate()) safeRender();
  if (Date.now() - S.lastRefresh > 10 * 60000) refresh(); else syncNow();
});
setInterval(() => { if (S.local && S.local.dirtyRows().length && navigator.onLine) syncNow(); }, 20000);

window.__gym = { S, syncNow, refresh, LOG };
boot();
