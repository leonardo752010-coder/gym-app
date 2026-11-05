/**
 * GYM + MACROFACTOR: un unico file per il progetto Apps Script.
 *
 * 1) SESSIONE -> STORICO (il tuo script, pulito): spunta Gym_SaveCheckbox (SESSIONE!Z2) e le serie vanno in STORICO.
 *    Novità rispetto al tuo: niente doppioni (una serie già in STORICO non viene riscritta), le serie incomplete
 *    (kg senza reps o viceversa) restano nella cella invece di essere cancellate, kg e reps devono essere numeri
 *    (la virgola va bene), tolto tutto ciò che riguardava DAILY_METRICS.
 *    Kg e libbre: unità di default in SESSIONE!F3 (kg o lb) e, se serve, un'eccezione per ESERCIZIO nella colonna Y
 *    (riga dell'esercizio: vuoto = usa F3). In STORICO il peso è sempre in kg (Weight_kg, 1 lb = 0,45359237 kg, arrotondato
 *    a 2 decimali) e restano anche il valore e l'unità che hai scritto (colonne L:M). Nella singola cella puoi scrivere
 *    anche l'unità ("135lb", "60kg"): vale solo per quella cella.
 * 2) MacroFactor -> STORICO_METRICS e MISURE: menu Gym > "Sincronizza MacroFactor da Drive" (o lancia mfSync()).
 *    Metti l'export nella cartella Drive "MacroFactor" (xlsx o Google Sheet). Per l'xlsx serve il servizio avanzato "Drive API".
 *    Alla prima esecuzione, se vuoi tutto lo storico, metti MF_DAYS_BACK = 9999; poi riportalo a 60.
 *
 * 3) Manutenzione (menu Gym > Manutenzione): "Crea tab CONTROLLO" (semafori e paletti; si ferma se il tab esiste già),
 *    "Ripara formule CONTROLLO" (riscrive solo le formule, se vedi #ERROR!) e "Riscrivi README". Sono in fondo a questo file.
 *
 * GUARDIE: ogni azione mostra un popup se qualcosa non va (manca la cartella, il file o un tab; data sbagliata;
 * valori impossibili; esercizio ancora da scegliere; export vecchio; troppe righe da scrivere). Soglie nelle costanti qui sotto.
 *
 * Questo è l'UNICO file del progetto: incolla sempre l'intero contenuto al posto di quello vecchio (Codice.gs),
 * altrimenti funzioni e costanti con lo stesso nome vanno in conflitto. Non serve installare trigger:
 * onOpen e onEdit sono trigger semplici.
 */

/*************************** MENU ***************************/

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Gym')
    .addItem('Salva SESSIONE in STORICO (desktop)', 'saveSessionToStoricoDesktop')
    .addItem('Pulisci input SESSIONE (desktop)', 'clearSessionInputsDesktop')
    .addSeparator()
    .addItem('Sincronizza MacroFactor da Drive', 'mfSync')
    .addSeparator()
    .addSubMenu(ui.createMenu('Manutenzione')
      .addItem('Aggiungi scelta unità kg/lb (F3 e colonna Y)', 'mfSetupUnitCell')
      .addItem('Ripara "Primo Set" (SESSIONE)', 'mfFixPrimoSet')
      .addItem('Applica ripetizioni a PIANO (celle vuote)', 'mfApplyReps')
      .addItem('Volume: rampa (settimane 1-2)', 'mfApplyVolumeRamp')
      .addItem('Volume: serie piene (da settimana 3)', 'mfApplyVolumeFull')
      .addItem('Crea tab CONTROLLO (una volta)', 'mfSetupControllo')
      .addItem('Ripara formule CONTROLLO', 'mfFixControlloFormulas')
      .addItem('Riscrivi README', 'mfSetupReadme'))
    .addToUi();
}

/*************************** SOGLIE DELLE GUARDIE (modificabili) ***************************/

const GYM_MAX_PAST_DAYS = 45;     // la data in E3 non può essere più vecchia di così (né nel futuro)
const GYM_MAX_KG = 500, GYM_MAX_REPS = 100, GYM_MAX_RIR = 10;   // sopra questi valori la serie non viene salvata
const GYM_UNIT_CELL = 'F3';       // SESSIONE: unità di default dei pesi (kg o lb)
const GYM_UNIT_ROW_COL = 25;      // SESSIONE: colonna Y = unità per esercizio (vuoto = usa F3)
const LB_TO_KG = 0.45359237;      // 1 libbra in kg (valore esatto per definizione)
const GYM_UNIT_TOL = 0.03;        // guardia kg/lb: scatta solo se il peso è 2,2 volte (±3%) più alto o più basso dell'ultimo
const MF_CONFIRM_ABOVE = 150;     // se la sync scrive più di tante righe, chiede conferma
const MF_STALE_DAYS = 7;          // avvisa se l'ultimo giorno dell'export è più vecchio di così

/*************************** UTILITÀ: POPUP E DATE ***************************/

// Popup di avviso. Se non c'è un'interfaccia (es. esecuzione da trigger) ripiega su un avviso in basso e sul log.
function notify_(title, msg) {
  console.log(title + ': ' + msg);
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, String(msg), ui.ButtonSet.OK);
  } catch (e) {
    try { SpreadsheetApp.getActive().toast(String(msg), title, 20); } catch (e2) { /* niente da fare */ }
  }
}

// Aggiunge righe/colonne al foglio se servono per scrivere fino a lastRow / lastCol
// (altrimenti Google dà "coordinate dell'intervallo di destinazione fuori dalle dimensioni del foglio").
function ensureGrid_(sh, lastRow, lastCol) {
  const mr = sh.getMaxRows();
  if (lastRow > mr) sh.insertRowsAfter(mr, Math.max(lastRow - mr, 500));      // a blocchi di almeno 500 righe
  const mc = sh.getMaxColumns();
  if (lastCol && lastCol > mc) sh.insertColumnsAfter(mc, lastCol - mc);
}

// Differenza in giorni tra due date 'yyyy-MM-dd' (keyB - keyA).
function daysBetween_(keyA, keyB) {
  const p = function (k) { const a = k.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); };
  return Math.round((p(keyB) - p(keyA)) / 86400000);
}

// '' se la data della sessione è plausibile, altrimenti il motivo.
function sessDateCheck_(dateKey, todayKey, maxPast) {
  const diff = daysBetween_(dateKey, todayKey);           // oggi - data
  if (diff < -1) return 'la data in E3 (' + dateKey + ') è nel futuro: correggila.';
  if (diff > maxPast) return 'la data in E3 (' + dateKey + ') è di ' + diff + ' giorni fa (limite ' + maxPast + '): correggila.';
  return '';
}

/*************************** SESSIONE -> STORICO ***************************/

/**
 * Legge il layout dei set in SESSIONE (intestazioni "Set1", "Set2"... alla riga 5 da colonna I, 3 colonne per set).
 */
function getSetLayout_(sheet) {
  const HEADER_ROW = 5;
  const FIRST_SET_COL = 9; // I

  const lastCol = sheet.getLastColumn();
  if (lastCol < FIRST_SET_COL) {
    return { firstSetCol: FIRST_SET_COL, numSetCols: 0, numSets: 0 };
  }

  const headerRow = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0];

  // 1) "Set1 / Set2 / Set3..." (anche "Set 1")
  let found = [];
  for (let col = FIRST_SET_COL; col <= lastCol; col++) {
    const h = (headerRow[col - 1] || "").toString().trim();
    const m = h.match(/^set\s*(\d+)$/i) || h.match(/^set(\d+)$/i);
    if (m) found.push({ col, n: parseInt(m[1], 10) });
  }
  if (found.length > 0) {
    const maxN = Math.max(...found.map(x => x.n));
    const set1 = found.find(x => x.n === 1);
    const firstSetCol = set1 ? set1.col : Math.min(...found.map(x => x.col));
    return { firstSetCol, numSetCols: maxN * 3, numSets: maxN };   // kg / reps / RIR
  }

  // 2) fallback: "Last ..." (case-insensitive)
  let lastSetCol = null;
  for (let col = FIRST_SET_COL; col <= lastCol; col++) {
    const h = (headerRow[col - 1] || "").toString().trim().toLowerCase();
    if (h.startsWith('last ')) { lastSetCol = col - 1; break; }
  }
  if (lastSetCol === null || lastSetCol < FIRST_SET_COL) {
    return { firstSetCol: FIRST_SET_COL, numSetCols: 0, numSets: 0 };
  }
  const numSetCols = lastSetCol - FIRST_SET_COL + 1;
  return { firstSetCol: FIRST_SET_COL, numSetCols, numSets: Math.floor(numSetCols / 3) };
}

/** Range della checkbox di salvataggio: named range "Gym_SaveCheckbox", altrimenti SESSIONE!Z2. */
function getSaveCheckboxRange_() {
  const ss = SpreadsheetApp.getActive();
  const named = ss.getRangeByName('Gym_SaveCheckbox');
  if (named) return named;
  const ses = ss.getSheetByName('SESSIONE');
  return ses ? ses.getRange(2, 26) : null;
}

/**
 * Legge SESSIONE e aggiunge le serie a STORICO. Non usa UI (si può chiamare da menu e da onEdit).
 * Ritorna { msg, saved, warn } dove saved = serie salvate ({row, set}, 0-based) da pulire in SESSIONE
 * e warn = testo per il popup ('' se tutto ok).
 */
function processSession_() {
  const ss = SpreadsheetApp.getActive();
  const sessionSheet = ss.getSheetByName('SESSIONE');
  const storicoSheet = ss.getSheetByName('STORICO');
  if (!sessionSheet || !storicoSheet) return gymErr_('Errore: foglio SESSIONE o STORICO mancante.');

  const layout = getSetLayout_(sessionSheet);
  if (layout.numSets === 0) {
    return gymErr_('Errore: nessuna colonna set trovata (intestazioni tipo "Set1" alla riga 5, da colonna I).');
  }
  const firstSetIndex = layout.firstSetCol - 1;                    // 0-based
  const lastSetCol = layout.firstSetCol + layout.numSetCols - 1;

  const dayName = String(sessionSheet.getRange('B3').getValue() || '').trim();
  if (!dayName) return gymErr_('Errore: seleziona il giorno in B3.');
  const sessionDate = sessionSheet.getRange('E3').getValue();
  if (!(sessionDate instanceof Date)) return gymErr_('Errore: manca la data in E3 (o non è una data valida).');
  const defUnit = sessUnit_(sessionSheet.getRange(GYM_UNIT_CELL).getValue());
  if (defUnit === null) return gymErr_('Errore: unità in ' + GYM_UNIT_CELL + ' non valida: scegli kg o lb.');
  const defaultUnit = defUnit || 'kg';

  const startRow = 6;
  const lastRow = sessionSheet.getLastRow();
  if (lastRow < startRow) return gymErr_('Errore: nessun esercizio trovato in SESSIONE.');
  const numRows = lastRow - startRow + 1;
  const data = sessionSheet.getRange(startRow, 1, numRows, lastSetCol).getValues();

  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const dateObj = sessionDate;
  const dateKey = Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd');
  const dateErr = sessDateCheck_(dateKey, Utilities.formatDate(now, tz, 'yyyy-MM-dd'), GYM_MAX_PAST_DAYS);
  if (dateErr) return gymErr_('Errore: ' + dateErr);

  const unitCol = sessionSheet.getRange(startRow, GYM_UNIT_ROW_COL, numRows, 1).getValues();   // Y: unità per esercizio
  for (let i = 0; i < numRows; i++) {
    if (sessUnit_(unitCol[i][0]) === null) return gymErr_('Errore: unità non valida nella cella Y' + (startRow + i) + ': scegli kg o lb (o lascia vuoto).');
  }
  const sessionRows = data.map(function (row, i) {
    return {
      unit: sessUnit_(unitCol[i][0]),                              // Y: '' = usa il default
      exercise: String(row[1] || '').trim(),                       // B: Exercise
      targetRir: row[6],                                           // G: Target_RIR_Pattern
      notes: row[7],                                               // H: Notes
      inputs: row.slice(firstSetIndex, firstSetIndex + layout.numSets * 3)
    };
  });

  // serie già presenti in STORICO per quella data (B:E = Date, Day, Exercise, Set) e ultimo peso (kg) per esercizio (F)
  const existing = {};
  const lastKg = {};                                   // esercizio -> { key: data, kg: peso massimo di quel giorno }
  const sl = storicoSheet.getLastRow();
  if (sl > 1) {
    storicoSheet.getRange(2, 2, sl - 1, 5).getValues().forEach(function (r) {
      if (!(r[0] instanceof Date)) return;
      const k = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
      const ex = String(r[2]).trim();
      if (k === dateKey) existing[[dateKey, String(r[1]).trim(), ex, Number(r[3])].join('|')] = true;
      if (typeof r[4] === 'number') {
        const cur = lastKg[ex];
        if (!cur || k > cur.key) lastKg[ex] = { key: k, kg: r[4] };
        else if (k === cur.key && r[4] > cur.kg) cur.kg = r[4];
      }
    });
  }
  const lastKgByEx = {};
  Object.keys(lastKg).forEach(function (ex) { lastKgByEx[ex] = lastKg[ex].kg; });

  const res = sessBuildRows_(dayName, dateKey, dateObj, sessionRows, existing, now, layout.numSets, defaultUnit, lastKgByEx);
  const extra = [];
  if (res.skipped.length) extra.push(res.skipped.length + ' già presenti');
  if (res.incomplete.length) extra.push(res.incomplete.length + ' incomplete (restano in cella)');
  const warn = [];
  if (res.incomplete.length) warn.push(res.incomplete.length + ' serie incomplete (manca kg o reps): non salvate, restano in cella.');
  if (res.invalid.length) {
    extra.push(res.invalid.length + ' con valori strani');
    warn.push('Valori da controllare, non salvati (restano in cella): ' + res.invalid.slice(0, 4).map(function (x) { return x.what; }).join('; ') + (res.invalid.length > 4 ? '…' : ''));
  }
  if (res.pending.length) {
    extra.push('esercizio da scegliere');
    warn.push('Esercizio ancora da scegliere in PIANO (non salvato): ' + res.pending.join(', '));
  }
  const tail = extra.length ? ' · ' + extra.join(', ') : '';

  if (res.rows.length === 0) {
    const none = !(res.skipped.length || res.incomplete.length || res.invalid.length || res.pending.length);
    if (none) warn.push('Nessuna serie compilata (servono kg e reps). Niente salvato.');
    if (res.skipped.length) warn.push(res.skipped.length + ' serie sono già in STORICO per questa data: niente di nuovo.');
    return { msg: (none ? 'Nessun set compilato (kg + reps). Niente salvato.' : 'Niente di nuovo da salvare') + tail, saved: [], warn: warn.join('\n') };
  }

  const destFirstRow = sl + 1;
  ensureGrid_(storicoSheet, destFirstRow + res.rows.length - 1, res.rows[0].length);
  if (storicoSheet.getRange(1, 12).getValue() === '') {
    storicoSheet.getRange(1, 12, 1, 2).setValues([['Input_weight', 'Input_unit']]).setFontWeight('bold');   // valore e unità scritti
  }
  if (sl > 1) {
    storicoSheet.getRange(sl, 1, 1, res.rows[0].length)
      .copyTo(storicoSheet.getRange(destFirstRow, 1, res.rows.length, res.rows[0].length), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  storicoSheet.getRange(destFirstRow, 1, res.rows.length, res.rows[0].length).setValues(res.rows);
  SpreadsheetApp.flush();
  if (storicoSheet.getLastRow() < sl + res.rows.length) throw new Error('La scrittura in STORICO non è andata a buon fine: niente è stato pulito in SESSIONE.');
  if (res.skipped.length) warn.push(res.skipped.length + ' serie erano già in STORICO e non sono state riscritte.');
  const lbCount = res.rows.filter(function (r) { return r[12] === 'lb'; }).length;
  return { msg: 'Allenamento salvato: ' + res.rows.length + ' set' + (lbCount ? ' (' + lbCount + ' in lb)' : '') + '.' + tail, saved: res.saved, warn: warn.join('\n') };
}

function gymErr_(msg) { return { msg: msg, saved: [], warn: msg }; }

/** Pulisce SOLO le serie salvate (le incomplete e quelle già presenti restano). Se una riga resta senza input, azzera anche la sua unità (colonna Y). */
function clearSavedSets_(saved) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('SESSIONE');
  if (!sheet || !saved || !saved.length) return;
  const layout = getSetLayout_(sheet);
  const rowsDone = {};
  saved.forEach(function (p) {
    sheet.getRange(6 + p.row, layout.firstSetCol + p.set * 3, 1, 3).clearContent();
    rowsDone[p.row] = true;
  });
  Object.keys(rowsDone).forEach(function (r) {
    const left = sheet.getRange(6 + Number(r), layout.firstSetCol, 1, layout.numSetCols).getValues()[0];
    if (!left.some(function (x) { return x !== '' && x !== null && x !== undefined; })) {
      sheet.getRange(6 + Number(r), GYM_UNIT_ROW_COL).clearContent();
    }
  });
}

/** Pulisce TUTTI gli input dei set (voce di menu). */
function clearSessionInputs_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('SESSIONE');
  if (!sheet) return;
  const startRow = 6;
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return;
  const layout = getSetLayout_(sheet);
  if (layout.numSetCols === 0) return;
  sheet.getRange(startRow, layout.firstSetCol, lastRow - startRow + 1, layout.numSetCols).clearContent();
  sheet.getRange(startRow, GYM_UNIT_ROW_COL, lastRow - startRow + 1, 1).clearContent();
}

/** Voci di menu (desktop). */
function saveSessionToStoricoDesktop() {
  try {
    const res = processSession_();
    notify_('Gym', res.warn ? res.msg + '\n\n' + res.warn : res.msg);
  } catch (err) {
    notify_('Gym: errore', err && err.message ? err.message : err);
  }
}

function clearSessionInputsDesktop() {
  clearSessionInputs_();
  SpreadsheetApp.getUi().alert('Input SESSIONE puliti.');
}

/**
 * Trigger automatico: parte SOLO quando spunti la cella del named range "Gym_SaveCheckbox".
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const saveRange = getSaveCheckboxRange_();
  if (!saveRange) return;

  const r = e.range;
  const isSaveCell = r.getSheet().getName() === saveRange.getSheet().getName()
    && r.getRow() === saveRange.getRow() && r.getColumn() === saveRange.getColumn();
  if (!isSaveCell) return;

  // solo da "non spuntata" a "spuntata"
  if (e.value !== 'TRUE' || e.oldValue === 'TRUE') return;

  try {
    const res = processSession_();     // salva in STORICO
    clearSavedSets_(res.saved);        // pulisce solo le serie salvate
    saveRange.offset(1, 0).setValue(res.msg + (res.warn ? ' → ' + res.warn.replace(/\n/g, ' · ') : '') + '  [' + new Date().toLocaleString() + ']');   // esito nella cella sotto, con il motivo (dal telefono il popup non si vede)
    if (res.warn) notify_('Gym', res.warn);
  } catch (err) {
    saveRange.offset(1, 0).setValue('Errore: ' + (err && err.message ? err.message : err));
    notify_('Gym: errore', (err && err.message ? err.message : err) + '\n\nLa casella è stata tolta: sistema e spunta di nuovo.');
  } finally {
    saveRange.setValue(false);         // toglie sempre la spunta, così puoi riprovare
  }
}

// Numero da una cella: accetta numeri e testo con virgola decimale ("42,5"); altrimenti null.
function sessNum_(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.trim().replace(',', '.')); return isNaN(n) ? null : n; }
  return null;
}

// Unità scritta in una cella: 'kg', 'lb', '' (vuota) oppure null se non valida.
function sessUnit_(raw) {
  const u = String(raw === null || raw === undefined ? '' : raw).trim().toLowerCase();
  if (u === '') return '';
  if (u === 'kg' || u === 'kgs') return 'kg';
  if (u === 'lb' || u === 'lbs') return 'lb';
  return null;
}

// Peso scritto in una cella: numero (nell'unità scelta in F3) oppure testo con unità ("135lb", "60 kg", "42,5").
// Ritorna { kg, unit, input, explicit } oppure null se non è un peso. In kg arrotonda a 2 decimali (errore massimo 5 grammi).
function sessParseWeight_(raw, defaultUnit) {
  let num = null, unit = defaultUnit || 'kg', explicit = false;
  if (typeof raw === 'number') num = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') {
    const m = raw.trim().toLowerCase().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(kgs?|lbs?)?$/);
    if (!m) return null;
    num = Number(m[1].replace(',', '.'));
    if (m[2]) { unit = m[2].charAt(0) === 'l' ? 'lb' : 'kg'; explicit = true; }
  }
  if (num === null || isNaN(num)) return null;
  const kg = unit === 'lb' ? Math.round(num * LB_TO_KG * 100) / 100 : num;
  return { kg: kg, unit: unit, input: num, explicit: explicit };
}

// sessionRows: [{exercise, targetRir, notes, unit ('' = default), inputs:[kg,reps,RIR x numSets]}]; existingKeys: {'yyyy-MM-dd|giorno|esercizio|set': true}
// defaultUnit: 'kg' | 'lb'; lastKgByEx: {esercizio: ultimo peso in kg} per accorgersi di errori di unità.
// Ritorna rows (13 colonne per STORICO A:M: ..., K vuota, L = valore scritto, M = unità), saved [{row,set}], skipped (già presenti),
// incomplete (manca kg o reps), invalid (valori impossibili o sospetti) e pending (esercizi segnaposto "[ ] ..." ancora da scegliere).
function sessBuildRows_(day, dateKey, dateObj, sessionRows, existingKeys, now, numSets, defaultUnit, lastKgByEx) {
  defaultUnit = defaultUnit || 'kg'; lastKgByEx = lastKgByEx || {};
  const rows = [], saved = [], skipped = [], incomplete = [], invalid = [], pending = [];
  sessionRows.forEach(function (r, i) {
    if (!r.exercise) return;
    const anyInRow = r.inputs.some(function (x) { return x !== '' && x !== null && x !== undefined; });
    if (/^\[\s*\]/.test(r.exercise)) {                       // segnaposto non ancora scelto
      if (anyInRow && pending.indexOf(r.exercise) < 0) pending.push(r.exercise);
      return;
    }
    for (let s = 0; s < numSets; s++) {
      const rawKg = r.inputs[s * 3], rawReps = r.inputs[s * 3 + 1], rawRir = r.inputs[s * 3 + 2];
      const any = [rawKg, rawReps, rawRir].some(function (x) { return x !== '' && x !== null && x !== undefined; });
      if (!any) continue;
      const w = sessParseWeight_(rawKg, r.unit || defaultUnit), reps = sessNum_(rawReps), rir = sessNum_(rawRir);
      if (w === null || reps === null) { incomplete.push({ row: i, set: s }); continue; }
      const bad = [];
      if (w.kg < 0 || w.kg > GYM_MAX_KG) bad.push('kg ' + w.kg);
      if (reps < 1 || reps > GYM_MAX_REPS) bad.push('reps ' + reps);
      if (rir !== null && (rir < 0 || rir > GYM_MAX_RIR)) bad.push('RIR ' + rir);
      // errore di unità: il peso è circa 2,2 volte più alto o più basso dell'ultimo registrato (e non hai scritto l'unità a mano)
      const last = lastKgByEx[r.exercise];
      if (!bad.length && !w.explicit && last > 0) {
        const ratio = w.kg / last;
        if (Math.abs(ratio - 1 / LB_TO_KG) < GYM_UNIT_TOL * (1 / LB_TO_KG) || Math.abs(ratio - LB_TO_KG) < GYM_UNIT_TOL * LB_TO_KG) {   // solo ~x2,2 o ~/2,2 (±3%): un raddoppio vero (x2) passa
          bad.push(w.input + ' ' + w.unit + ' sembra un errore di unità: ultima volta ' + last + ' kg. Controlla l\'unità (F3 o colonna Y), o scrivi l\'unità nella cella (es. 60kg)');
        }
      }
      if (bad.length) { invalid.push({ row: i, set: s, what: r.exercise + ' set ' + (s + 1) + ' (' + bad.join(', ') + ')' }); continue; }
      const key = [dateKey, day, r.exercise, s + 1].join('|');
      if (existingKeys[key]) { skipped.push(key); continue; }
      rows.push([now, dateObj, day, r.exercise, s + 1, w.kg, reps, rir === null ? '' : rir,
                 r.targetRir === undefined ? '' : r.targetRir, r.notes === undefined ? '' : r.notes, '', w.input, w.unit]);
      saved.push({ row: i, set: s });
    }
  });
  return { rows: rows, saved: saved, skipped: skipped, incomplete: incomplete, invalid: invalid, pending: pending };
}

/*************************** MACROFACTOR -> STORICO_METRICS / MISURE ***************************/

const MF_FOLDER_NAME = 'MacroFactor';      // cartella in Drive con gli export
const MF_TARGET_SHEET = 'STORICO_METRICS';
const MF_MEAS_SHEET = 'MISURE';
const MF_DAYS_BACK = 60;                   // quanti giorni prima dell'ultima data presente ri-sincronizzare (alla prima esecuzione metti 9999 per importare tutto lo storico)
const MF_FIRST_DATE = '';                  // opzionale, 'yyyy-MM-dd': non importare giorni precedenti

const MF_WARNINGS = [];                    // avvisi raccolti durante la sync (valori scartati, export vecchio...)

const MF_HEADER = ['Date', 'Bodyweight_kg', 'Kcal', 'Protein_g', 'Carbs_g', 'Fat_g', 'Notes', 'Steps', 'Fat_percent'];

function mfSync() {
  MF_WARNINGS.length = 0;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    notify_('MacroFactor', 'Un\'altra sincronizzazione è già in corso. Riprova tra poco.');
    return;
  }
  try {
    mfSyncCore_();
  } catch (err) {
    notify_('MacroFactor: errore', (err && err.message ? err.message : err) + '\n\nPuoi rilanciare quando vuoi: la sincronizzazione non crea doppioni.');
  } finally {
    lock.releaseLock();
  }
}

function mfSyncCore_() {
  const ss = SpreadsheetApp.getActive();
  const target = ss.getSheetByName(MF_TARGET_SHEET);
  if (!target) throw new Error('Foglio ' + MF_TARGET_SHEET + ' non trovato.');
  const tz = ss.getSpreadsheetTimeZone();
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const scriptTz = Session.getScriptTimeZone();
  if (scriptTz && scriptTz !== tz) {
    MF_WARNINGS.push('Fuso orario diverso: foglio ' + tz + ', progetto Apps Script ' + scriptTz +
      '. Le date possono sfalsarsi di un giorno: imposta lo stesso fuso (quello del tuo telefono) in File > Impostazioni e in Impostazioni progetto.');
  }

  const exp = mfReadExport_();                       // se la lettura fallisce ci si ferma qui, prima di scrivere

  // guardie sul contenuto dell'export
  [exp.cal, exp.wt, exp.steps, exp.fat].forEach(function (m) {
    Object.keys(m).forEach(function (k) {
      if (daysBetween_(todayKey, k) > 1) { delete m[k]; MF_WARNINGS.push('giorno nel futuro scartato: ' + k); }
    });
  });
  const dayKeys = Object.keys(exp.cal).concat(Object.keys(exp.wt)).sort();
  if (!dayKeys.length) {
    throw new Error('Il file "' + exp.fileName + '" non contiene giorni con kcal o peso. Nell\'export spunta Calories & Macros e Scale Weight.');
  }
  const lastKey = dayKeys[dayKeys.length - 1];
  const age = daysBetween_(lastKey, todayKey);
  if (age > MF_STALE_DAYS) {
    MF_WARNINGS.push('L\'export più recente ("' + exp.fileName + '") arriva solo al ' + lastKey + ' (' + age + ' giorni fa): esporta di nuovo da MacroFactor.');
  }

  mfEnsureHeader_(target);                           // ricrea l'intestazione se manca (e aggiunge Steps / Fat_percent)

  const last = target.getLastRow();
  const vals = last > 1 ? target.getRange(2, 1, last - 1, 9).getValues() : [];
  const existing = vals.map(function (r, i) {
    return {
      row: i + 2,
      key: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : '',
      weight: r[1], kcal: r[2], protein: r[3], carbs: r[4], fat: r[5], steps: r[7], fatpct: r[8]
    };
  });

  const fromKey = mfFromKey_(existing, MF_DAYS_BACK, MF_FIRST_DATE);
  const res = mfMergeRows_(existing, exp.cal, exp.wt, exp.steps, exp.fat, fromKey);

  const big = res.appends.length + res.updates.length;
  if (big > MF_CONFIRM_ABOVE && !mfConfirm_('Sto per scrivere ' + res.appends.length + ' giorni nuovi e aggiornarne ' + res.updates.length +
        ' in ' + MF_TARGET_SHEET + ' (file "' + exp.fileName + '"). Continuare?')) {
    ss.toast('Annullato: non ho scritto niente.', 'MacroFactor', 6);
    return;
  }

  res.updates.forEach(function (u) {
    target.getRange(u.row, 2, 1, 5).setValues([u.values.slice(0, 5)]);      // B:F
    target.getRange(u.row, 8, 1, 2).setValues([u.values.slice(5, 7)]);      // H:I
  });
  if (res.appends.length) {
    const rows = res.appends.map(function (a) {
      const v = a.values;
      return [Utilities.parseDate(a.key, tz, 'yyyy-MM-dd'), v[0], v[1], v[2], v[3], v[4], '', v[5], v[6]];
    });
    ensureGrid_(target, last + rows.length, 9);
    if (last > 1) {
      target.getRange(last, 1, 1, 9).copyTo(target.getRange(last + 1, 1, rows.length, 9),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
    target.getRange(last + 1, 1, rows.length, 9).setValues(rows);
    // riordina per data, così anche i giorni più vecchi finiscono al posto giusto
    target.getRange(2, 1, last - 1 + rows.length, 9).sort({ column: 1, ascending: true });
    SpreadsheetApp.flush();
    if (target.getLastRow() < last + rows.length) throw new Error('La scrittura in ' + MF_TARGET_SHEET + ' non è andata a buon fine.');
  }

  const m = mfSyncMeasures_(ss, tz, exp.meas);
  ss.toast('File: ' + exp.fileName + ' · ' + res.appends.length + ' giorni nuovi, ' + res.updates.length + ' aggiornati. Misure: ' + m + '.', 'MacroFactor', 10);
  if (MF_WARNINGS.length) {
    notify_('MacroFactor: avvisi', MF_WARNINGS.slice(0, 8).join('\n') + (MF_WARNINGS.length > 8 ? '\n… e altri ' + (MF_WARNINGS.length - 8) : ''));
  }
}

// Chiede conferma (Sì/No). Se non c'è interfaccia (esecuzione da editor senza foglio aperto) procede.
function mfConfirm_(msg) {
  try {
    const ui = SpreadsheetApp.getUi();
    return ui.alert('MacroFactor', msg, ui.ButtonSet.YES_NO) === ui.Button.YES;
  } catch (e) {
    return true;
  }
}

// Foglio vuoto: scrive l'intestazione. Dati che partono dalla riga 1 (intestazione cancellata): la inserisce sopra.
// Intestazione a 7 colonne: aggiunge Steps e Fat_percent.
function mfEnsureHeader_(sh) {
  ensureGrid_(sh, 1, 9);
  const a1 = sh.getLastRow() > 0 ? sh.getRange(1, 1).getValue() : '';
  if (a1 instanceof Date) sh.insertRowBefore(1);
  else if (a1 !== '') {
    if (sh.getRange(1, 8).getValue() === '') sh.getRange(1, 8, 1, 2).setValues([MF_HEADER.slice(7)]).setFontWeight('bold');
    return;
  }
  sh.getRange(1, 1, 1, 9).setValues([MF_HEADER]).setFontWeight('bold');
}

/* ---------- logica pura (testata fuori da Google) ---------- */

// Primo giorno da sincronizzare: ultima data presente meno MF_DAYS_BACK (o MF_FIRST_DATE se più recente).
function mfFromKey_(existing, daysBack, firstKey) {
  let maxKey = '';
  existing.forEach(function (e) { if (e.key && e.key > maxKey) maxKey = e.key; });
  let from = '';
  if (maxKey) {
    const d = new Date(maxKey + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - daysBack);
    from = d.toISOString().slice(0, 10);
  }
  if (firstKey && firstKey > from) from = firstKey;
  return from;
}

// existing: [{row,key,weight,kcal,protein,carbs,fat,steps,fatpct}]
// calMap: {key:{kcal,fat,carbs,protein}}; wtMap, stepsMap, fatMap: {key:numero}
// Ritorna updates [{row, values}] e appends [{key, values}] con values = [peso, kcal, proteine, carbo, grassi, steps, fat%]
function mfMergeRows_(existing, calMap, wtMap, stepsMap, fatMap, fromKey) {
  stepsMap = stepsMap || {}; fatMap = fatMap || {};
  const byKey = {};
  existing.forEach(function (e) { if (e.key) byKey[e.key] = e; });
  const keys = {};
  [calMap, wtMap, stepsMap, fatMap].forEach(function (m) { Object.keys(m).forEach(function (k) { keys[k] = true; }); });
  const sorted = Object.keys(keys).filter(function (k) { return !fromKey || k >= fromKey; }).sort();

  const same = function (a, b) {
    const na = (typeof a === 'number'), nb = (typeof b === 'number');
    if (na && nb) return Math.abs(a - b) < 0.0001;
    return (a === '' || a == null) && (b === '' || b == null);
  };
  const pick = function (mfVal, old) { return mfVal !== undefined ? mfVal : (old === undefined ? '' : old); };
  const updates = [], appends = [];
  sorted.forEach(function (k) {
    const c = calMap[k], e = byKey[k];
    const values = [
      pick(wtMap[k], e && e.weight),
      c ? c.kcal    : pick(undefined, e && e.kcal),
      c ? c.protein : pick(undefined, e && e.protein),
      c ? c.carbs   : pick(undefined, e && e.carbs),
      c ? c.fat     : pick(undefined, e && e.fat),
      pick(stepsMap[k], e && e.steps),
      pick(fatMap[k], e && e.fatpct)
    ];
    if (e) {
      const old = [e.weight, e.kcal, e.protein, e.carbs, e.fat, e.steps, e.fatpct];
      let changed = false;
      for (let i = 0; i < values.length; i++) if (!same(old[i], values[i])) changed = true;
      if (changed) updates.push({ row: e.row, values: values });
    } else {
      appends.push({ key: k, values: values });
    }
  });
  return { updates: updates, appends: appends };
}

// Misure corporee: header = intestazione del foglio MISURE (header[0] = 'Date'); existing = [{row,key,values}] con
// values allineati all'header (senza la data); mfHeader/mfRows dall'export. Un valore vuoto in MF non sovrascrive.
function mfMergeMeasures_(header, existing, mfHeader, mfRows) {
  const hdr = header.slice();
  mfHeader.forEach(function (h, i) { if (i > 0 && hdr.indexOf(h) < 0) hdr.push(h); });
  const grew = hdr.length !== header.length;
  const byKey = {};
  existing.forEach(function (e) { if (e.key) byKey[e.key] = e; });
  const updates = [], appends = [];
  mfRows.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); }).forEach(function (m) {
    const e = byKey[m.key];
    const row = hdr.slice(1).map(function (h, j) { return e && j < e.values.length ? e.values[j] : ''; });
    let changed = !e;
    mfHeader.forEach(function (h, i) {
      if (i === 0) return;
      const v = m.values[i];
      if (v === '' || v == null) return;
      const j = hdr.indexOf(h) - 1;
      if (row[j] !== v) { row[j] = v; changed = true; }
    });
    if (!e) appends.push({ key: m.key, values: row });
    else if (changed || grew) updates.push({ row: e.row, values: row });
  });
  return { header: hdr, updates: updates, appends: appends };
}

/* ---------- misure: scrittura nel foglio MISURE ---------- */

function mfSyncMeasures_(ss, tz, meas) {
  if (!meas || !meas.rows.length) return 0;
  let sh = ss.getSheetByName(MF_MEAS_SHEET);
  if (!sh) sh = ss.insertSheet(MF_MEAS_SHEET);
  const lastRow = sh.getLastRow();
  const header = lastRow > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : ['Date'];
  const body = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, header.length).getValues() : [];
  const existing = body.map(function (r, i) {
    return { row: i + 2, key: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : '', values: r.slice(1) };
  });
  const res = mfMergeMeasures_(header, existing, meas.header, meas.rows);
  ensureGrid_(sh, 1, res.header.length);
  sh.getRange(1, 1, 1, res.header.length).setValues([res.header]).setFontWeight('bold');
  res.updates.forEach(function (u) { sh.getRange(u.row, 2, 1, u.values.length).setValues([u.values]); });
  if (res.appends.length) {
    const rows = res.appends.map(function (a) { return [Utilities.parseDate(a.key, tz, 'yyyy-MM-dd')].concat(a.values); });
    const start = Math.max(lastRow, 1) + 1;
    ensureGrid_(sh, start - 1 + rows.length, res.header.length);
    sh.getRange(start, 1, rows.length, res.header.length).setValues(rows);
    sh.getRange(2, 1, start - 2 + rows.length, res.header.length).sort({ column: 1, ascending: true });
  }
  return res.appends.length + ' nuove, ' + res.updates.length + ' aggiornate';
}

/* ---------- lettura dell'export da Drive ---------- */

function mfReadExport_() {
  const folders = DriveApp.getFoldersByName(MF_FOLDER_NAME);
  if (!folders.hasNext()) throw new Error('Cartella "' + MF_FOLDER_NAME + '" non trovata in Drive.');
  const files = folders.next().getFiles();
  let best = null;
  while (files.hasNext()) {
    const f = files.next(), mt = f.getMimeType();
    if (mt !== MimeType.GOOGLE_SHEETS && mt !== MimeType.MICROSOFT_EXCEL) continue;
    if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
  }
  if (!best) throw new Error('Nessun export (xlsx o Google Sheet) nella cartella "' + MF_FOLDER_NAME + '".');

  let tmpId = null, sheetFile;
  try {
    if (best.getMimeType() === MimeType.GOOGLE_SHEETS) {
      sheetFile = SpreadsheetApp.openById(best.getId());
    } else {
      if (typeof Drive === 'undefined') {
        throw new Error('Per leggere l\'xlsx attiva il servizio avanzato "Drive API" (Servizi > +), oppure apri il file con Fogli Google e salvalo come Google Sheet nella cartella.');
      }
      const blob = best.getBlob();
      const created = Drive.Files.create
        ? Drive.Files.create({ name: 'tmp_macrofactor_' + Date.now(), mimeType: MimeType.GOOGLE_SHEETS }, blob)
        : Drive.Files.insert({ title: 'tmp_macrofactor_' + Date.now(), mimeType: MimeType.GOOGLE_SHEETS }, blob, { convert: true });
      tmpId = created.id;
      sheetFile = SpreadsheetApp.openById(tmpId);
    }
    const tz = sheetFile.getSpreadsheetTimeZone();
    const w = mfReadWeight_(sheetFile.getSheetByName('Scale Weight'), tz);
    return {
      fileName: best.getName(),
      cal: mfReadCal_(sheetFile.getSheetByName('Calories & Macros'), tz),
      wt: w.wt,
      fat: w.fat,
      steps: mfReadSteps_(sheetFile.getSheetByName('Steps'), tz),      // opzionale
      meas: mfReadMeas_(sheetFile.getSheetByName('Body Metrics'), tz)  // opzionale
    };
  } finally {
    if (tmpId) DriveApp.getFileById(tmpId).setTrashed(true);
  }
}

function mfKey_(v, tz) {
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

// true se il valore è vuoto o un numero nel range; altrimenti lo scarta e lo annota tra gli avvisi.
function mfOk_(v, lo, hi, label, key) {
  if (v === '' || v === null || v === undefined) return true;
  if (typeof v === 'number' && v >= lo && v <= hi) return true;
  MF_WARNINGS.push(label + ' del ' + key + ' scartato (' + v + ')');
  return false;
}

function mfCol_(header, name) {
  const i = header.indexOf(name);
  if (i < 0) throw new Error('Colonna "' + name + '" non trovata nell\'export.');
  return i;
}

function mfReadCal_(sh, tz) {
  if (!sh) throw new Error('Tab "Calories & Macros" non trovato: nell\'export spunta Calories & Macros.');
  const v = sh.getDataRange().getValues(), h = v[0];
  const iD = mfCol_(h, 'Date'), iK = mfCol_(h, 'Calories (kcal)'), iF = mfCol_(h, 'Fat (g)'),
        iC = mfCol_(h, 'Carbs (g)'), iP = mfCol_(h, 'Protein (g)');
  const out = {};
  for (let r = 1; r < v.length; r++) {
    const k = mfKey_(v[r][iD], tz);
    if (!k || typeof v[r][iK] !== 'number') continue;
    if (!mfOk_(v[r][iK], 0, 15000, 'kcal', k) || !mfOk_(v[r][iF], 0, 1500, 'grassi', k) ||
        !mfOk_(v[r][iC], 0, 1500, 'carboidrati', k) || !mfOk_(v[r][iP], 0, 1500, 'proteine', k)) continue;
    out[k] = { kcal: v[r][iK], fat: v[r][iF], carbs: v[r][iC], protein: v[r][iP] };
  }
  return out;
}

function mfReadWeight_(sh, tz) {
  if (!sh) throw new Error('Tab "Scale Weight" non trovato: nell\'export spunta Scale Weight.');
  const v = sh.getDataRange().getValues(), h = v[0];
  const iD = mfCol_(h, 'Date'), iW = mfCol_(h, 'Weight (kg)'), iF = h.indexOf('Fat Percent');
  const wt = {}, fat = {};
  for (let r = 1; r < v.length; r++) {
    const k = mfKey_(v[r][iD], tz);
    if (!k) continue;
    if (typeof v[r][iW] === 'number' && mfOk_(v[r][iW], 30, 250, 'peso', k)) wt[k] = v[r][iW];
    if (iF >= 0 && typeof v[r][iF] === 'number') fat[k] = v[r][iF];
  }
  return { wt: wt, fat: fat };
}

function mfReadSteps_(sh, tz) {
  if (!sh) return {};
  const v = sh.getDataRange().getValues(), h = v[0];
  const iD = h.indexOf('Date'), iS = h.indexOf('Steps');
  if (iD < 0 || iS < 0) return {};
  const out = {};
  for (let r = 1; r < v.length; r++) {
    const k = mfKey_(v[r][iD], tz);
    if (k && typeof v[r][iS] === 'number' && v[r][iS] > 0 && mfOk_(v[r][iS], 0, 100000, 'passi', k)) out[k] = v[r][iS];   // 0 = dato mancante
  }
  return out;
}

function mfReadMeas_(sh, tz) {
  if (!sh) return null;
  const v = sh.getDataRange().getValues(), h = v[0];
  if (h[0] !== 'Date') return null;
  const rows = [];
  for (let r = 1; r < v.length; r++) {
    const k = mfKey_(v[r][0], tz);
    if (!k) continue;
    const vals = v[r].map(function (x, i) { return i === 0 ? k : (x === null || x === undefined ? '' : x); });
    if (vals.slice(1).some(function (x) { return x !== ''; })) rows.push({ key: k, values: vals });
  }
  return { header: h, rows: rows };
}


/*************************** MANUTENZIONE: CELLA UNITÀ KG/LB ***************************/

/**
 * Crea in SESSIONE le celle per scegliere l'unità: F3 = unità di default (etichetta in F2) e colonna Y = eccezione per ESERCIZIO
 * (Y5 intestazione, Y6:Y17 una scelta per riga; vuoto = usa F3). Si può rilanciare senza danni.
 */
function mfSetupUnitCell() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('SESSIONE');
  if (!sh) { notify_('Unità', 'Foglio SESSIONE non trovato.'); return; }
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['kg', 'lb'], true).setAllowInvalid(false).build();

  const c = sh.getRange(GYM_UNIT_CELL);
  sh.getRange('E3').copyTo(c, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);       // stesso aspetto della data
  c.setNumberFormat('@').setHorizontalAlignment('center');
  c.setDataValidation(rule);
  const cur = String(c.getValue()).trim().toLowerCase();
  if (cur !== 'kg' && cur !== 'lb') c.setValue('kg');
  sh.getRange('F2').setValue('Unità').setFontWeight('bold');

  sh.getRange(5, GYM_UNIT_ROW_COL).setValue('Unità').setFontWeight('bold').setHorizontalAlignment('center');
  const col = sh.getRange(6, GYM_UNIT_ROW_COL, 12, 1);
  col.setNumberFormat('@').setHorizontalAlignment('center');   // niente colore fisso: il giallo è una formattazione condizionale (solo righe con esercizio in B)
  col.setDataValidation(rule);
  ss.toast('Unità: F3 = default per tutta la seduta; colonna Y = eccezione per esercizio (vuoto = usa F3).', 'Unità', 10);
}


/*************************** RIPETIZIONI (min/max) IN PIANO ***************************/

// Range deciso il 29/10/2026 (doppia progressione: quando su tutte le serie arrivi al massimo a RIR 0-1, sali di peso e riparti dal minimo).
// Il primo che corrisponde al nome dell'esercizio vince. Ordine importante. Riconosce nomi italiani e inglesi.
const REPS_RULES = [
  { re: /alzate laterali|lateral raise/,                                min: 12, max: 20 },
  { re: /fly machine|deltoidi posteriori|rear/,                         min: 12, max: 20 },
  { re: /multipower|declined|panca inclinata/,                          min: 8,  max: 12 },
  { re: /super incline|panca piana|hack squat|shoulder press|iso-lateral incline|iso-lateral bench/, min: 6, max: 10 },
  { re: /hip extension|iperestensione|cerniera/,                        min: 10, max: 15 },
  { re: /rdl|stacco rumeno/,                                            min: 8,  max: 12 },
  { re: /larghezza|pullover|pulldown/,                                  min: 10, max: 15 },
  { re: /spessore|row|t-bar|rowing|parte alta/,                         min: 8,  max: 12 },
  { re: /croci|chest fly/,                                              min: 10, max: 15 },
  { re: /preacher|curl/,                                                min: 8,  max: 12 },
  { re: /leg press/,                                                    min: 8,  max: 12 },
  { re: /triceps|estensione sopra la testa|pushdown/,                   min: 10, max: 15 },
  { re: /leg extension/,                                                min: 10, max: 15 },
  { re: /adductor|adduttori/,                                           min: 10, max: 15 },
  { re: /calf|polpacci/,                                                min: 10, max: 15 }
];

// Range per un esercizio, oppure null se nessuna regola corrisponde.
function repsFor_(name) {
  const n = String(name || '').toLowerCase();
  for (let i = 0; i < REPS_RULES.length; i++) {
    if (REPS_RULES[i].re.test(n)) return { min: REPS_RULES[i].min, max: REPS_RULES[i].max };
  }
  return null;
}

/**
 * Scrive Reps_Min e Reps_Max in PIANO (colonne G e H) per gli esercizi con le celle vuote. Se una delle due celle è già compilata
 * la riga resta com'è. Le celle compilate perdono il giallo ("da decidere"). Segna come deciso il punto "Ripetizioni" di DA_DECIDERE.
 * Si può rilanciare: dopo aver scelto una macchina (cambiando il nome "[ ] ...") applica il range alla nuova riga.
 */
function mfApplyReps() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('PIANO');
  if (!sh) { notify_('Ripetizioni', 'Foglio PIANO non trovato.'); return; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) { notify_('Ripetizioni', 'PIANO è vuoto.'); return; }
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cEx = header.indexOf('Exercise') + 1, cMin = header.indexOf('Reps_Min') + 1, cMax = header.indexOf('Reps_Max') + 1;
  if (!cEx || !cMin || !cMax) { notify_('Ripetizioni', 'In PIANO non trovo le colonne Exercise, Reps_Min e Reps_Max.'); return; }
  const data = sh.getRange(2, 1, lastRow - 1, Math.max(cEx, cMin, cMax)).getValues();

  let done = 0;
  const skipped = [], noRule = [];
  data.forEach(function (row, i) {
    const name = String(row[cEx - 1] || '').trim();
    if (!name) return;
    const mn = row[cMin - 1], mx = row[cMax - 1];
    if ((mn !== '' && mn !== null) || (mx !== '' && mx !== null)) { skipped.push(name); return; }
    const r = repsFor_(name);
    if (!r) { noRule.push(name); return; }
    sh.getRange(i + 2, cMin).setValue(r.min).setBackground(null);
    sh.getRange(i + 2, cMax).setValue(r.max).setBackground(null);
    done++;
  });

  // DA_DECIDERE: punto "Ripetizioni" (colonna B = tema, colonna E = decisione)
  let marked = false;
  const dd = ss.getSheetByName('DA_DECIDERE');
  if (dd && dd.getLastRow() > 2) {
    const vals = dd.getRange(1, 2, dd.getLastRow(), 4).getValues();                 // B:E
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === 'Ripetizioni' && String(vals[i][3]).trim() === '') {
        const day = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy');
        dd.getRange(i + 1, 5).setValue('Deciso il ' + day + ': 6-10 pressate pesanti; 8-12 tirate, petto con manubri, bicipiti, leg curl, leg press; 10-15 isolamento; 12-20 alzate laterali e deltoidi posteriori.');
        marked = true;
        break;
      }
    }
  }

  const msg = 'Ripetizioni scritte per ' + done + ' esercizi' + (marked ? ' (punto in DA_DECIDERE segnato come deciso)' : '') + '.';
  const extra = [];
  if (skipped.length) extra.push(skipped.length + ' righe già compilate, lasciate com\'erano.');
  if (noRule.length) extra.push('Nessun range per: ' + noRule.slice(0, 5).join('; ') + (noRule.length > 5 ? '…' : ''));
  if (extra.length) notify_('Ripetizioni', msg + '\n\n' + extra.join('\n'));
  else ss.toast(msg, 'Ripetizioni', 8);
}


/*************************** VOLUME: RAMPA E SERIE PIENE ***************************/

// Piano di volume deciso il 29/10/2026 (partenza basata su ~50 serie/sett registrate nel primo bulk).
// Per ogni giorno: il primo schema che corrisponde al nome dell'esercizio vince. ramp = settimane 1-2, full = da settimana 3.
// 0 = esercizio fuori dal piano (la riga resta in PIANO ma senza serie). Riconosce nomi italiani e inglesi.
const VOL_RULES = {
  'upper a': [
    { re: /croci|chest fly/,                         ramp: 2, full: 2 },
    { re: /piana|flat|bench press/,                  ramp: 2, full: 2 },
    { re: /incline|inclinata/,                       ramp: 2, full: 3 },
    { re: /high row|parte alta/,                     ramp: 2, full: 2 },
    { re: /t-bar|spessore|row/,                      ramp: 2, full: 2 },
    { re: /pulldown|pullover|larghezza/,             ramp: 1, full: 1 },
    { re: /alzate laterali|lateral raise/,           ramp: 2, full: 3 },
    { re: /preacher/,                                ramp: 2, full: 2 },
    { re: /triceps|estensione|extension/,            ramp: 2, full: 2 }
  ],
  'upper b': [
    { re: /alzate laterali|lateral raise/,           ramp: 2, full: 3 },
    { re: /shoulder press/,                          ramp: 2, full: 2 },
    { re: /curl/,                                    ramp: 2, full: 3 },
    { re: /overhead|sopra la testa/,                 ramp: 2, full: 2 },
    { re: /parte alta|high row|opzionale/,           ramp: 0, full: 0 },
    { re: /t-bar|spessore|row/,                      ramp: 2, full: 2 },
    { re: /pulldown|pullover|larghezza/,             ramp: 2, full: 2 },
    { re: /multipower|panca inclinata|incline/,      ramp: 2, full: 2 },
    { re: /declined/,                                ramp: 2, full: 2 },
    { re: /fly machine|deltoidi posteriori|rear/,    ramp: 2, full: 2 }
  ],
  'lower a': [
    { re: /hack/,                                    ramp: 2, full: 3 },
    { re: /leg curl/,                                ramp: 0, full: 0 },
    { re: /extension/,                               ramp: 1, full: 1 },
    { re: /adductor|adduttori/,                      ramp: 2, full: 2 },
    { re: /calf|polpacci/,                           ramp: 2, full: 2 }
  ],
  'lower b': [
    { re: /rdl|cerniera|hip extension|deadlift|stacco/, ramp: 2, full: 3 },
    { re: /leg curl/,                                ramp: 2, full: 3 },
    { re: /leg press/,                               ramp: 2, full: 2 },
    { re: /calf|polpacci/,                           ramp: 2, full: 2 },
    { re: /adductor|adduttori/,                      ramp: 0, full: 0 }
  ]
};

// Target di VOLUME (min, max): il minimo è il punto di partenza, il massimo è un traguardo possibile, non un obbligo.
const VOL_TARGETS = {
  'chest': [9, 11], 'back': [9, 12], 'lateral delts': [6, 8], 'shoulders': [2, 3], 'rear delts': [2, 3],
  'biceps': [5, 6], 'triceps': [4, 6], 'quads': [7, 8], 'hamstrings': [6, 7], 'calves': [4, 6], 'adductors': [2, 4]
};

function mfApplyVolumeRamp() { mfApplyVolume_('ramp'); }
function mfApplyVolumeFull() { mfApplyVolume_('full'); }

// Serie per un esercizio di un giorno, oppure null se non c'è una regola. mode: 'ramp' | 'full'.
function volSetsFor_(dayName, exName, mode) {
  const d = String(dayName || '').toLowerCase().trim();
  const key = Object.keys(VOL_RULES).filter(function (k) { return d.indexOf(k) === 0; })[0];
  if (!key) return null;
  const n = String(exName || '').toLowerCase();
  const rules = VOL_RULES[key];
  for (let i = 0; i < rules.length; i++) if (rules[i].re.test(n)) return rules[i][mode];
  return null;
}

/**
 * Scrive in PIANO le serie (colonna Sets) del piano di volume e in VOLUME i target (min/max).
 * Non tocca nomi, ripetizioni, RIR e note. Le righe fuori piano restano a 0 serie; le righe non riconosciute restano com'erano.
 */
function mfApplyVolume_(mode) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('PIANO');
  if (!sh) { notify_('Volume', 'Foglio PIANO non trovato.'); return; }
  const lastRow = sh.getLastRow();
  if (lastRow < 2) { notify_('Volume', 'PIANO è vuoto.'); return; }
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cDay = header.indexOf('Day_Name') + 1, cEx = header.indexOf('Exercise') + 1,
        cMus = header.indexOf('Target_Muscle') + 1, cSets = header.indexOf('Sets') + 1;
  if (!cDay || !cEx || !cMus || !cSets) { notify_('Volume', 'In PIANO non trovo le colonne Day_Name, Exercise, Target_Muscle e Sets.'); return; }
  const data = sh.getRange(2, 1, lastRow - 1, Math.max(cDay, cEx, cMus, cSets)).getValues();

  const byDay = {}, byMuscle = {}, zero = [], unmatched = [];
  let total = 0, changed = 0;
  data.forEach(function (row, i) {
    const name = String(row[cEx - 1] || '').trim();
    if (!name) return;
    const day = String(row[cDay - 1] || '').trim();
    const sets = volSetsFor_(day, name, mode);
    if (sets === null) {
      unmatched.push(day + ': ' + name);
      const cur = row[cSets - 1];
      if (typeof cur === 'number') { total += cur; byDay[day] = (byDay[day] || 0) + cur; }
      return;
    }
    if (row[cSets - 1] !== sets) { sh.getRange(i + 2, cSets).setValue(sets).setBackground(null); changed++; }
    total += sets;
    byDay[day] = (byDay[day] || 0) + sets;
    const mus = String(row[cMus - 1] || '').trim();
    byMuscle[mus] = (byMuscle[mus] || 0) + sets;
    if (sets === 0) zero.push(day + ': ' + name);
  });

  // VOLUME: target min/max per distretto (colonna A = distretto, C = min, D = max)
  let targets = 0;
  const vol = ss.getSheetByName('VOLUME');
  if (vol && vol.getLastRow() >= 4) {
    const names = vol.getRange(1, 1, vol.getLastRow(), 1).getValues();
    names.forEach(function (r, i) {
      const t = VOL_TARGETS[String(r[0]).trim()];
      if (t) { vol.getRange(i + 1, 3, 1, 2).setValues([t]); targets++; }
    });
  }

  const label = mode === 'ramp' ? 'Rampa (settimane 1-2)' : 'Serie piene (da settimana 3)';
  const lines = [label + ': ' + total + ' serie a settimana.',
    Object.keys(byDay).map(function (d) { return d + ' ' + byDay[d]; }).join(' · ')];
  lines.push(changed + ' celle aggiornate in PIANO, ' + targets + ' target scritti in VOLUME.');
  if (mode === 'ramp') lines.push('In VOLUME qualche distretto risulterà "sotto" il minimo: è normale durante la rampa.');
  if (zero.length) lines.push('A 0 serie (fuori piano, puoi cancellarle o tenerle): ' + zero.join('; '));
  if (unmatched.length) lines.push('Righe non riconosciute, lasciate com\'erano: ' + unmatched.slice(0, 5).join('; ') + (unmatched.length > 5 ? '…' : ''));
  notify_('Volume', lines.join('\n'));
}


/*************************** MANUTENZIONE: "PRIMO SET" ***************************/

/**
 * "Primo Set" (SESSIONE U:W) mostra l'ultimo Set 1 salvato per quel giorno + esercizio. Si appoggia alla colonna nascosta X
 * (numero della riga di STORICO). Se vedi #N/A ("argomenti dell'array di dimensioni diverse") questa funzione riscrive X6:X17
 * provando più formule e più sintassi, e controlla ogni volta che il risultato coincida con quello calcolato qui dallo script.
 */
function mfFixPrimoSet() {
  const ss = SpreadsheetApp.getActive();
  const ses = ss.getSheetByName('SESSIONE'), his = ss.getSheetByName('STORICO');
  if (!ses || !his) { notify_('Primo Set', 'Servono i fogli SESSIONE e STORICO.'); return; }
  const first = 6, last = 17, xCol = 24;
  if (!String(ses.getRange('B3').getValue() || '').trim()) { notify_('Primo Set', 'Scegli prima il giorno in B3, poi rilancia.'); return; }

  const check = function () { SpreadsheetApp.flush(); return mfPrimoSetCheck_(ses, his, first, last); };
  const now = check();
  if (now.ok) { ss.toast('Primo Set è già a posto.', 'Primo Set', 6); return; }

  const E = 'STORICO!$C$2:$C', D = 'STORICO!$D$2:$D', S = 'STORICO!$E$2:$E';       // colonne intere: tutte della stessa lunghezza
  const candidates = [
    { name: 'FILTER', tpl: '=IF(OR($B$3="",$B{r}=""),0,IFERROR(MAX(FILTER(ROW(' + E + '),' + E + '=$B$3,' + D + '=$B{r},' + S + '=1)),0))' },
    { name: 'SUMPRODUCT', tpl: '=IF(OR($B$3="",$B{r}=""),0,SUMPRODUCT(MAX((' + E + '=$B$3)*(' + D + '=$B{r})*(' + S + '=1)*ROW(' + E + '))))' },
    { name: 'LOOKUP', tpl: '=IF(OR($B$3="",$B{r}=""),0,IFERROR(LOOKUP(2,1/((' + E + '=$B$3)*(' + D + '=$B{r})*(' + S + '=1)),ROW(' + E + ')),0))' }
  ];
  const writers = {
    en: function (rg, f) { rg.setFormula(f); },
    locale: function (rg, f) { rg.setFormula(mfLocalizeFormula_(f)); },
    digitata: function (rg, f) { rg.setValue(mfLocalizeFormula_(f)); }
  };
  for (let c = 0; c < candidates.length; c++) {
    const modes = Object.keys(writers);
    for (let m = 0; m < modes.length; m++) {
      for (let r = first; r <= last; r++) ses.getRange(r, xCol).clearContent();
      for (let r = first; r <= last; r++) writers[modes[m]](ses.getRange(r, xCol), candidates[c].tpl.replace(/\{r\}/g, String(r)));
      if (check().ok) { ss.toast('Primo Set riparato (formula ' + candidates[c].name + ', sintassi ' + modes[m] + ').', 'Primo Set', 8); return; }
    }
  }
  const last2 = check();
  notify_('Primo Set', 'Non sono riuscito a ripararlo: ' + last2.bad.slice(0, 4).join('; ') + '. Lingua del foglio: ' + ss.getSpreadsheetLocale() + '. Mandami questo messaggio.');
}

// Confronta la colonna X di SESSIONE con la riga di STORICO (ultimo Set 1 per giorno + esercizio) calcolata qui.
function mfPrimoSetCheck_(ses, his, first, last) {
  const n = last - first + 1;
  const day = String(ses.getRange('B3').getValue() || '').toLowerCase();
  const names = ses.getRange(first, 2, n, 1).getValues();
  const x = ses.getRange(first, 24, n, 1).getValues();
  const hl = his.getLastRow();
  const data = hl > 1 ? his.getRange(2, 3, hl - 1, 3).getValues() : [];       // C:E = Day, Exercise, Set
  const bad = [];
  for (let i = 0; i < n; i++) {
    const ex = String(names[i][0] || '').toLowerCase();
    let expected = 0;
    if (day && ex) {
      for (let k = data.length - 1; k >= 0; k--) {
        if (String(data[k][0]).toLowerCase() === day && String(data[k][1]).toLowerCase() === ex && Number(data[k][2]) === 1) { expected = k + 2; break; }
      }
    }
    if (x[i][0] !== expected) bad.push('X' + (first + i) + ' = ' + x[i][0] + ' (atteso ' + expected + ')');
  }
  return { ok: bad.length === 0, bad: bad };
}


/*************************** MANUTENZIONE: TAB CONTROLLO ***************************/

/**
 * Crea il tab CONTROLLO (semafori e paletti). Si ferma se il tab esiste già, per non cancellare i tuoi paletti:
 * in quel caso usa "Ripara formule CONTROLLO" (mfFixControlloFormulas) oppure rinomina/elimina il tab e rilancia.
 * Legge STORICO_METRICS, STORICO, PESO, VOLUME e BLOCCO.
 *
 * NOTA: le formule si scrivono con mfWriteControlloFormulas_, che prova più sintassi (inglese, poi quella della lingua del foglio)
 * e controlla che non ci siano errori: con setValues e la sintassi inglese un foglio in italiano dà #ERROR!.
 */
function mfSetupControllo() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName('CONTROLLO')) {
    notify_('CONTROLLO', 'Il tab CONTROLLO esiste già. Se vedi errori usa Gym > Manutenzione > Ripara formule CONTROLLO; altrimenti rinominalo o eliminalo e rilancia.');
    return;
  }
  const TZ = ss.getSpreadsheetTimeZone();
  const sh = ss.insertSheet('CONTROLLO', 0);
  sh.setTabColor('#70ad47');
  sh.setHiddenGridlines(true);
  const ROWS = 48, COLS = 15;
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setFontFamily('Arial').setFontSize(10);
  const V = [
    ["Controllo: semafori e paletti", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Si aggiorna da solo con i log (STORICO_METRICS per peso/kcal/proteine, STORICO per le serie). Celle blu = paletti che puoi cambiare. VERDE = in regola, GIALLO = attenzione, ROSSO = agisci.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Rosso = fuori dal giallo. Soglie in nero = calcolate dai paletti; soglie in blu = fisse, modificabili.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Fase (si cambia in PESO!B3)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["SEMAFORO GENERALE", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "Misure giro vita: aggiungi una riga ogni 2 settimane (col metro, a digiuno, stesso punto)", "", "", "", "", ""],
    ["PALETTI (modificabili)", "Valore", "", "", "", "", "", "Da dove viene", "", "Data", "Vita (cm)", "Note", "", "", ""],
    ["Peso tetto del bulk (kg)", 86, "", "", "", "", "", "Picco di marzo 2026 (scan 12/03/2026: 86.1 kg). Proposta mia: arrivato qui, chiudi il bulk.", "", Utilities.parseDate("2026-10-28", TZ, 'yyyy-MM-dd'), 90, "Scan Evolt 28/10/2026 (stima della macchina). Sostituisci con la prima misura col metro.", "", "", ""],
    ["Giro vita tetto (cm)", 92, "", "", "", "", "", "Proposta mia: +2 cm dalla partenza (90 cm, scan 28/10/2026). Oltre questo, chiudi il bulk.", "", "", "", "", "", "", ""],
    ["Kcal target attuale", 3000, "", "", "", "", "", "Da te: 2-3 settimane a 3000, poi sali piano verso 3400. Aggiorna questa cella quando sali.", "", "", "", "", "", "", ""],
    ["Kcal: tolleranza verde (±)", 150, "", "", "", "", "", "Mia scelta.", "", "", "", "", "", "", ""],
    ["Kcal: tolleranza gialla (±)", 300, "", "", "", "", "", "Mia scelta.", "", "", "", "", "", "", ""],
    ["Proteine minime, verde (g/kg)", 1.6, "", "", "", "", "", "Dentro il range 1.6-2.2 g/kg di solito indicato per chi si allena con i pesi. Mia scelta.", "", "", "", "", "", "", ""],
    ["Proteine minime, giallo (g/kg)", 1.4, "", "", "", "", "", "Mia scelta.", "", "", "", "", "", "", ""],
    ["Ritmo peso minimo (kg/sett)", 0.25, "", "", "", "", "", "Da te: +0.25-0.5 kg a settimana (media settimanale del peso al mattino).", "", "", "", "", "", "", ""],
    ["Ritmo peso massimo (kg/sett)", 0.5, "", "", "", "", "", "Come sopra.", "", "", "", "", "", "", ""],
    ["Ritmo peso: margine giallo (kg/sett)", 0.1, "", "", "", "", "", "Mia scelta: entro 0.1 kg fuori dal range è giallo, oltre è rosso.", "", "", "", "", "", "", ""],
    ["Serie fatte vs piano: verde da (%)", 0.85, "", "", "", "", "", "Mia scelta.", "", "", "", "", "", "", ""],
    ["Serie fatte vs piano: giallo da (%)", 0.6, "", "", "", "", "", "Mia scelta.", "", "", "", "", "", "", ""],
    ["Serie a RIR 0-1: verde da (%)", 0.7, "", "", "", "", "", "Regola tua: RIR 0-1. La quota di serie vicine al cedimento che voglio vedere: mia scelta.", "", "", "", "", "", "", ""],
    ["Serie a RIR 0-1: giallo da (%)", 0.5, "", "", "", "", "", "Mia scelta.", "", "", "", "", "", "", ""],
    ["Kcal minime per contare un giorno", 1500, "", "", "", "", "", "Giorni con meno kcal sono log incompleti (es. 218 kcal) e non entrano nelle medie. Mia scelta.", "", "", "", "", "", "", ""],
    ["Indicatore", "Valore", "Verde da", "Verde a", "Giallo da", "Giallo a", "Stato", "Cosa fare", "", "", "", "", "", "appoggio", "(kg×reps)"],
    ["PESO E CALORIE", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Ultimo log di peso (giorni fa)", "", 0, 2, "", 5, "", "", "", "", "", "", "", "", ""],
    ["Peso medio ultimi 7 giorni (kg)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Ritmo del peso (kg/sett, media di 3 settimane)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Kcal medie ultimi 7 giorni", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Proteine medie ultimi 7 giorni (g/kg)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Giorni con kcal registrate (ultimi 7)", "", 6, "", 4, "", "", "", "", "", "", "", "", "", ""],
    ["VITA", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Giro vita, ultima misura (cm)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Giorni dall'ultima misura della vita", "", "", 16, "", 30, "", "", "", "", "", "", "", "", ""],
    ["ALLENAMENTO", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Serie fatte negli ultimi 7 giorni (% del piano)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Serie a RIR 0-1, ultimi 14 giorni (%)", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Carico totale (kg×reps): ultimi 7 giorni vs 7 precedenti", "", 0, "", -0.1, "", "", "", "", "", "", "", "", "", ""],
    ["Distretti fuori target di volume (n)", "", 0, 0, 1, 2, "", "", "", "", "", "", "", "", ""],
    ["Settimana del blocco", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["COSA FARE QUANDO", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Il ritmo del peso resta sotto il minimo per 3 settimane: +150-200 kcal. Sopra il massimo: -150-200 kcal.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Il peso medio arriva al tetto o la vita supera il tetto: chiudi il bulk e inizia il cut (metti le date in BLOCCO).", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Carichi in calo per 2 sedute di fila su più esercizi, o dolore articolare: anticipa il deload.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Nelle prime 1-2 settimane il peso oscilla per acqua e glicogeno: non decidere sulla prima settimana.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Scan Evolt ogni 8 settimane, alla stessa ora e a digiuno. Il peso medio e la vita contano più del singolo scan.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Nota: i semafori di peso e kcal leggono STORICO_METRICS (alimentato da MacroFactor_Sync), quelli di allenamento leggono STORICO. Il ritmo del peso qui è in kg/sett; il foglio PESO ha il suo alert in %.", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ];
  const F = [
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
    ["General", "0.0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.00", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.00", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.00", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "0", "0", "General", "0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.0", "General", "0.0", "General", "0.0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.00", "0.00", "0.00", "0.00", "0.00", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "0", "0", "0", "0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.00", "0.00", "General", "0.00", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "0", "General", "0", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0.0", "General", "0.0", "General", "0.0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "General", "0", "General", "0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "0%", "General", "0%", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "0%", "General", "0%", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0%", "0%", "General", "0%", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "#,##0", "#,##0"],
    ["General", "0", "0", "0", "0", "0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "0", "General", "0", "General", "0", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "dd/mm/yyyy", "0.0", "General", "General", "General", "General"],
    ["General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General", "General"],
  ];
  const rng = sh.getRange(1, 1, ROWS, COLS);
  rng.setNumberFormats(F);
  rng.setValues(V);                       // solo testi, numeri e date (le formule vanno dopo, con setFormula)
  const W = {"A": 327, "B": 103, "C": 82, "D": 82, "E": 82, "F": 82, "G": 89, "H": 551, "I": 26, "J": 96, "K": 89, "L": 411, "M": 26, "N": 110, "O": 110};
  Object.keys(W).forEach(function (c) { sh.setColumnWidth(c.charCodeAt(0) - 64, W[c]); });
  const S = [
    {b: true, c: null, bg: null, al: null, sz: 12.0, r: ["A1"]},
    {b: false, c: "#000000", bg: null, al: null, sz: 11.0, r: ["B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1", "J1", "K1", "L1", "M1", "N1", "O1", "B2", "C2", "D2", "E2", "F2", "G2", "H2", "I2", "J2", "K2", "L2", "M2", "N2", "O2", "B3", "C3", "D3", "E3", "F3", "G3", "H3", "I3", "J3", "K3", "L3", "M3", "N3", "O3", "C4", "D4", "E4", "F4", "G4", "H4", "I4", "J4", "K4", "L4", "M4", "N4", "O4", "C5", "D5", "E5", "F5", "G5", "I5", "J5", "K5", "L5", "M5", "N5", "O5", "A6", "B6", "C6", "D6", "E6", "F6", "G6", "H6", "I6", "K6", "L6", "M6", "N6", "O6", "I7", "M7", "N7", "O7", "C8", "D8", "E8", "F8", "G8", "I8", "M8", "N8", "O8", "C9", "D9", "E9", "F9", "G9", "I9", "M9", "N9", "O9", "C10", "D10", "E10", "F10", "G10", "I10", "M10", "N10", "O10", "C11", "D11", "E11", "F11", "G11", "I11", "M11", "N11", "O11", "C12", "D12", "E12", "F12", "G12", "I12", "M12", "N12", "O12", "C13", "D13", "E13", "F13", "G13", "I13", "M13", "N13", "O13", "C14", "D14", "E14", "F14", "G14", "I14", "M14", "N14", "O14", "C15", "D15", "E15", "F15", "G15", "I15", "M15", "N15", "O15", "C16", "D16", "E16", "F16", "G16", "I16", "M16", "N16", "O16", "C17", "D17", "E17", "F17", "G17", "I17", "M17", "N17", "O17", "C18", "D18", "E18", "F18", "G18", "I18", "M18", "N18", "O18", "C19", "D19", "E19", "F19", "G19", "I19", "M19", "N19", "O19", "C20", "D20", "E20", "F20", "G20", "I20", "M20", "N20", "O20", "C21", "D21", "E21", "F21", "G21", "I21", "M21", "N21", "O21", "C22", "D22", "E22", "F22", "G22", "I22", "M22", "N22", "O22", "I23", "M23", "B24", "C24", "D24", "E24", "F24", "G24", "H24", "I24", "M24", "N24", "O24", "E25", "I25", "M25", "N25", "O25", "C26", "E26", "I26", "M26", "N26", "O26", "I27", "M27", "N27", "O27", "I28", "M28", "N28", "O28", "D29", "F29", "I29", "M29", "N29", "O29", "D30", "F30", "I30", "M30", "N30", "O30", "B31", "C31", "D31", "E31", "F31", "G31", "H31", "I31", "M31", "N31", "O31", "C32", "E32", "I32", "M32", "N32", "O32", "C33", "E33", "I33", "M33", "N33", "O33", "B34", "C34", "D34", "E34", "F34", "G34", "H34", "I34", "M34", "N34", "O34", "D35", "F35", "I35", "M35", "N35", "O35", "D36", "F36", "I36", "M36", "N36", "O36", "D37", "F37", "I37", "M37", "I38", "M38", "N38", "O38", "C39", "E39", "I39", "M39", "N39", "O39", "A40", "B40", "C40", "D40", "E40", "F40", "G40", "H40", "I40", "M40", "N40", "O40", "I41", "M41", "N41", "O41", "B42", "C42", "D42", "E42", "F42", "G42", "H42", "I42", "M42", "N42", "O42", "B43", "C43", "D43", "E43", "F43", "G43", "H43", "I43", "M43", "N43", "O43", "B44", "C44", "D44", "E44", "F44", "G44", "H44", "I44", "M44", "N44", "O44", "B45", "C45", "D45", "E45", "F45", "G45", "H45", "I45", "M45", "N45", "O45", "B46", "C46", "D46", "E46", "F46", "G46", "H46", "I46", "M46", "N46", "O46", "A47", "B47", "C47", "D47", "E47", "F47", "G47", "H47", "I47", "M47", "N47", "O47", "B48", "C48", "D48", "E48", "F48", "G48", "H48", "I48", "J48", "K48", "L48", "M48", "N48", "O48"]},
    {b: false, c: "#808080", bg: null, al: null, sz: 10.0, r: ["A2", "A3", "J6", "H8", "L8", "H9", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20", "H21", "H22", "N37", "O37", "A48"]},
    {b: true, c: null, bg: null, al: null, sz: 10.0, r: ["A4", "B4", "A5", "A24", "A31", "A34"]},
    {b: true, c: null, bg: null, al: "center", sz: 10.0, r: ["B5", "G25", "G26", "G27", "G28", "G29", "G30", "G32", "G33", "G35", "G36", "G37", "G38", "G39"]},
    {b: true, c: null, bg: "#d9d9d9", al: null, sz: 10.0, r: ["A7", "B7", "H7", "J7", "K7", "L7", "A23", "B23", "C23", "D23", "E23", "F23", "G23", "H23", "N23", "O23", "A41"]},
    {b: false, c: "#000000", bg: "#d9d9d9", al: null, sz: 11.0, r: ["C7", "D7", "E7", "F7", "G7", "B41", "C41", "D41", "E41", "F41", "G41", "H41"]},
    {b: false, c: "#0000ff", bg: null, al: null, sz: 10.0, r: ["B8", "J8", "K8", "B9", "J9", "K9", "L9", "B10", "J10", "K10", "L10", "B11", "J11", "K11", "L11", "B12", "J12", "K12", "L12", "B13", "J13", "K13", "L13", "B14", "J14", "K14", "L14", "B15", "J15", "K15", "L15", "B16", "J16", "K16", "L16", "B17", "J17", "K17", "L17", "B18", "J18", "K18", "L18", "B19", "J19", "K19", "L19", "B20", "J20", "K20", "L20", "B21", "J21", "K21", "L21", "B22", "J22", "K22", "L22", "J23", "K23", "L23", "J24", "K24", "L24", "C25", "D25", "F25", "J25", "K25", "L25", "J26", "K26", "L26", "J27", "K27", "L27", "J28", "K28", "L28", "J29", "K29", "L29", "C30", "E30", "J30", "K30", "L30", "J31", "K31", "L31", "J32", "K32", "L32", "D33", "F33", "J33", "K33", "L33", "J34", "K34", "L34", "J35", "K35", "L35", "J36", "K36", "L36", "C37", "E37", "J37", "K37", "L37", "C38", "D38", "E38", "F38", "J38", "K38", "L38", "J39", "K39", "L39", "J40", "K40", "L40", "J41", "K41", "L41", "J42", "K42", "L42", "J43", "K43", "L43", "J44", "K44", "L44", "J45", "K45", "L45", "J46", "K46", "L46", "J47", "K47", "L47"]},
    {b: false, c: null, bg: null, al: "right", sz: 10.0, r: ["B25", "B26", "B27", "B28", "B29", "B30", "B32", "B33", "B35", "B36", "B37", "B38", "B39"]},
  ];
  S.forEach(function (s) {
    const rl = sh.getRangeList(s.r);
    if (s.b) rl.setFontWeight('bold');
    if (s.c) rl.setFontColor(s.c);
    if (s.bg) rl.setBackground(s.bg);
    if (s.al) rl.setHorizontalAlignment(s.al);
    if (s.sz && s.sz !== 10) rl.setFontSize(s.sz);
  });
  const rules = [];
  [['VERDE', '#c6efce', '#006100'], ['GIALLO', '#ffeb9c', '#9c5700'], ['ROSSO', '#ffc7ce', '#9c0006']].forEach(function (x) {
    ['G25:G39', 'B5'].forEach(function (a) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(x[0])
        .setBackground(x[1]).setFontColor(x[2]).setBold(true).setRanges([sh.getRange(a)]).build());
    });
  });
  sh.setConditionalFormatRules(rules);

  const res = mfWriteControlloFormulas_(sh);
  SpreadsheetApp.flush();
  sh.activate();
  const bad = mfControlloErrors_(sh);
  if (res.failed.length || bad.length) {
    notify_('CONTROLLO', 'Creato, ma ' + bad.length + ' celle danno errore (' + bad.slice(0, 6).join(', ') + '). Lingua del foglio: ' + ss.getSpreadsheetLocale() +
      '. Mandami questo messaggio e uno screenshot.');
  } else {
    ss.toast('CONTROLLO creato. Imposta la data di inizio blocco in BLOCCO!B3 e aggiungi la vita nella tabella a destra.', 'Controllo', 10);
  }
}

/** Riscrive solo le formule di CONTROLLO (non tocca paletti, vita e colori). Da usare se vedi #ERROR!. */
function mfFixControlloFormulas() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('CONTROLLO');
  if (!sh) { notify_('CONTROLLO', 'Il tab CONTROLLO non esiste: usa Gym > Manutenzione > Crea tab CONTROLLO.'); return; }
  const res = mfWriteControlloFormulas_(sh);
  // la data della prima misura della vita (J8) era finita un giorno indietro per il fuso orario: la sistema solo se è ancora la riga originale
  if (String(sh.getRange('L8').getValue()).indexOf('Scan Evolt') === 0 && Number(sh.getRange('K8').getValue()) === 90) {
    sh.getRange('J8').setValue(Utilities.parseDate('2026-10-28', ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'));
  }
  SpreadsheetApp.flush();
  const bad = mfControlloErrors_(sh);
  if (res.failed.length || bad.length) {
    notify_('CONTROLLO', 'Formule riscritte, ma ' + bad.length + ' celle danno ancora errore (' + bad.slice(0, 6).join(', ') + '). Lingua del foglio: ' + ss.getSpreadsheetLocale() +
      '. Mandami questo messaggio e uno screenshot.');
  } else {
    const used = {};
    Object.keys(res.methods).forEach(function (a) { used[res.methods[a]] = (used[res.methods[a]] || 0) + 1; });
    ss.toast('Formule di CONTROLLO riparate (' + Object.keys(used).map(function (m) { return m + ': ' + used[m]; }).join(', ') + ').', 'Controllo', 8);
  }
}

/**
 * Scrive le formule di CONTROLLO provando, nell'ordine, finché non ci sono errori (solo sulle celle che ne danno):
 *  1) setFormula con la sintassi inglese (virgole);
 *  2) setFormula con la sintassi dei fogli in italiano e simili (punto e virgola, virgola decimale);
 *  3) come se le digitassi a mano (setValue, sintassi della lingua del foglio).
 * Prima di ogni tentativo svuota la cella, così Google rilegge la formula da capo.
 * Ritorna { failed: [celle ancora in errore], methods: { cella: metodo usato } }.
 */
function mfWriteControlloFormulas_(sh) {
  const FORMULAS = {
    "B4": "=PESO!B3",
    "B5": "=IF(COUNTIF(G25:G39,\"ROSSO\")>0,\"ROSSO\",IF(COUNTIF(G25:G39,\"GIALLO\")>0,\"GIALLO\",IF(COUNTIF(G25:G39,\"VERDE\")>0,\"VERDE\",\"—\")))",
    "H5": "=COUNTIF(G25:G39,\"ROSSO\")&\" rossi, \"&COUNTIF(G25:G39,\"GIALLO\")&\" gialli, \"&COUNTIF(G25:G39,\"VERDE\")&\" verdi\"",
    "B25": "=IF(PESO!$B$12=\"\",\"\",MAX(0,PESO!$B$13))",
    "G25": "=IF(B25=\"\",\"ROSSO\",IF(AND(B25>=IF(C25=\"\",-1E+99,C25),B25<=IF(D25=\"\",1E+99,D25)),\"VERDE\",IF(AND(B25>=IF(E25=\"\",-1E+99,E25),B25<=IF(F25=\"\",1E+99,F25)),\"GIALLO\",\"ROSSO\")))",
    "H25": "=IF(G25=\"VERDE\",\"ok\",\"Inserisci peso e kcal ogni giorno: senza dati i semafori sotto non valgono.\")",
    "B26": "=IF(OR(PESO!$B$12=\"\",PESO!$B$13>7,PESO!$B$14=\"\"),\"\",PESO!$B$14)",
    "D26": "=$B$8-1.5",
    "F26": "=$B$8-0.01",
    "G26": "=IF(B26=\"\",\"—\",IF(AND(B26>=IF(C26=\"\",-1E+99,C26),B26<=IF(D26=\"\",1E+99,D26)),\"VERDE\",IF(AND(B26>=IF(E26=\"\",-1E+99,E26),B26<=IF(F26=\"\",1E+99,F26)),\"GIALLO\",\"ROSSO\")))",
    "H26": "=IF(G26=\"VERDE\",\"ok\",IF(G26=\"—\",\"\",IF(B26>=$B$8,\"Tetto raggiunto: chiudi il bulk e passa al cut.\",\"Vicino al tetto: prepara l'uscita dal bulk.\")))",
    "B27": "=IF(OR($B$4<>\"Bulk\",PESO!$B$12=\"\",PESO!$B$13>7,PESO!$B$16=\"\"),\"\",PESO!$B$16)",
    "C27": "=$B$15",
    "D27": "=$B$16",
    "E27": "=$B$15-$B$17",
    "F27": "=$B$16+$B$17",
    "G27": "=IF(B27=\"\",\"—\",IF(AND(B27>=IF(C27=\"\",-1E+99,C27),B27<=IF(D27=\"\",1E+99,D27)),\"VERDE\",IF(AND(B27>=IF(E27=\"\",-1E+99,E27),B27<=IF(F27=\"\",1E+99,F27)),\"GIALLO\",\"ROSSO\")))",
    "H27": "=IF(G27=\"VERDE\",\"ok\",IF(G27=\"—\",\"Serve la fase Bulk (PESO!B3) e 3 settimane di dati.\",IF(G27=\"GIALLO\",\"Vicino ai limiti: ricontrolla tra una settimana.\",IF(B27<$B$15,\"Troppo lento: +150-200 kcal.\",\"Troppo veloce: -150-200 kcal.\"))))",
    "B28": "=IF(OR(PESO!$B$12=\"\",PESO!$B$13>7),\"\",IFERROR(AVERAGEIFS(STORICO_METRICS!$C$2:$C$20000,STORICO_METRICS!$A$2:$A$20000,\">=\"&(PESO!$B$12-6),STORICO_METRICS!$A$2:$A$20000,\"<=\"&PESO!$B$12,STORICO_METRICS!$C$2:$C$20000,\">=\"&$B$22),\"\"))",
    "C28": "=$B$10-$B$11",
    "D28": "=$B$10+$B$11",
    "E28": "=$B$10-$B$12",
    "F28": "=$B$10+$B$12",
    "G28": "=IF(B28=\"\",\"—\",IF(AND(B28>=IF(C28=\"\",-1E+99,C28),B28<=IF(D28=\"\",1E+99,D28)),\"VERDE\",IF(AND(B28>=IF(E28=\"\",-1E+99,E28),B28<=IF(F28=\"\",1E+99,F28)),\"GIALLO\",\"ROSSO\")))",
    "H28": "=IF(G28=\"VERDE\",\"ok\",IF(G28=\"—\",\"\",IF(B28<$B$10,\"Sotto il target: mangia di più.\",\"Sopra il target: riduci un po'.\")))",
    "B29": "=IF(OR(PESO!$B$12=\"\",PESO!$B$13>7,PESO!$B$14=\"\"),\"\",IFERROR(AVERAGEIFS(STORICO_METRICS!$D$2:$D$20000,STORICO_METRICS!$A$2:$A$20000,\">=\"&(PESO!$B$12-6),STORICO_METRICS!$A$2:$A$20000,\"<=\"&PESO!$B$12,STORICO_METRICS!$C$2:$C$20000,\">=\"&$B$22)/PESO!$B$14,\"\"))",
    "C29": "=$B$13",
    "E29": "=$B$14",
    "G29": "=IF(B29=\"\",\"—\",IF(AND(B29>=IF(C29=\"\",-1E+99,C29),B29<=IF(D29=\"\",1E+99,D29)),\"VERDE\",IF(AND(B29>=IF(E29=\"\",-1E+99,E29),B29<=IF(F29=\"\",1E+99,F29)),\"GIALLO\",\"ROSSO\")))",
    "H29": "=IF(G29=\"VERDE\",\"ok\",IF(G29=\"—\",\"\",IF(G29=\"GIALLO\",\"Un po' basse: aggiungi una fonte di proteine al giorno.\",\"Troppo basse: porta il totale sopra 1.6 g/kg.\")))",
    "B30": "=IF(OR(PESO!$B$12=\"\",PESO!$B$13>7),\"\",COUNTIFS(STORICO_METRICS!$A$2:$A$20000,\">=\"&(PESO!$B$12-6),STORICO_METRICS!$A$2:$A$20000,\"<=\"&PESO!$B$12,STORICO_METRICS!$C$2:$C$20000,\">=\"&$B$22))",
    "G30": "=IF(B30=\"\",\"—\",IF(AND(B30>=IF(C30=\"\",-1E+99,C30),B30<=IF(D30=\"\",1E+99,D30)),\"VERDE\",IF(AND(B30>=IF(E30=\"\",-1E+99,E30),B30<=IF(F30=\"\",1E+99,F30)),\"GIALLO\",\"ROSSO\")))",
    "H30": "=IF(G30=\"VERDE\",\"ok\",IF(G30=\"—\",\"\",\"Registra tutti i giorni: con pochi dati le medie non sono affidabili.\"))",
    "B32": "=IFERROR(INDEX($K$8:$K$47,MATCH(9.99E+307,$K$8:$K$47,1)),\"\")",
    "D32": "=$B$9-1",
    "F32": "=$B$9",
    "G32": "=IF(B32=\"\",\"—\",IF(AND(B32>=IF(C32=\"\",-1E+99,C32),B32<=IF(D32=\"\",1E+99,D32)),\"VERDE\",IF(AND(B32>=IF(E32=\"\",-1E+99,E32),B32<=IF(F32=\"\",1E+99,F32)),\"GIALLO\",\"ROSSO\")))",
    "H32": "=IF(G32=\"VERDE\",\"ok\",IF(G32=\"—\",\"Inserisci la misura nella tabella a destra.\",IF(B32>$B$9,\"Vita oltre il tetto: chiudi il bulk e passa al cut.\",\"Vicina al tetto: prepara l'uscita dal bulk.\")))",
    "B33": "=IFERROR(IF(INDEX($J$8:$J$47,MATCH(9.99E+307,$K$8:$K$47,1))=\"\",\"\",MAX(0,TODAY()-INDEX($J$8:$J$47,MATCH(9.99E+307,$K$8:$K$47,1)))),\"\")",
    "G33": "=IF(B33=\"\",\"—\",IF(AND(B33>=IF(C33=\"\",-1E+99,C33),B33<=IF(D33=\"\",1E+99,D33)),\"VERDE\",IF(AND(B33>=IF(E33=\"\",-1E+99,E33),B33<=IF(F33=\"\",1E+99,F33)),\"GIALLO\",\"ROSSO\")))",
    "H33": "=IF(G33=\"VERDE\",\"ok\",IF(G33=\"—\",\"\",\"Misura la vita col metro, a digiuno, ogni 2 settimane.\"))",
    "B35": "=IF(VOLUME!$B$15=0,\"\",COUNTIFS(STORICO!$B$2:$B$30000,\">=\"&(TODAY()-6),STORICO!$B$2:$B$30000,\"<=\"&TODAY())/VOLUME!$B$15)",
    "C35": "=$B$18",
    "E35": "=$B$19",
    "G35": "=IF(B35=\"\",\"—\",IF(AND(B35>=IF(C35=\"\",-1E+99,C35),B35<=IF(D35=\"\",1E+99,D35)),\"VERDE\",IF(AND(B35>=IF(E35=\"\",-1E+99,E35),B35<=IF(F35=\"\",1E+99,F35)),\"GIALLO\",\"ROSSO\")))",
    "H35": "=IF(G35=\"VERDE\",\"ok\",IF(G35=\"—\",\"\",\"Poche serie registrate: allenati o registra tutte le serie in SESSIONE.\"))",
    "B36": "=IF(COUNTIFS(STORICO!$B$2:$B$30000,\">=\"&(TODAY()-13),STORICO!$B$2:$B$30000,\"<=\"&TODAY(),STORICO!$H$2:$H$30000,\">=0\")=0,\"\",COUNTIFS(STORICO!$B$2:$B$30000,\">=\"&(TODAY()-13),STORICO!$B$2:$B$30000,\"<=\"&TODAY(),STORICO!$H$2:$H$30000,\">=0\",STORICO!$H$2:$H$30000,\"<=1\")/COUNTIFS(STORICO!$B$2:$B$30000,\">=\"&(TODAY()-13),STORICO!$B$2:$B$30000,\"<=\"&TODAY(),STORICO!$H$2:$H$30000,\">=0\"))",
    "C36": "=$B$20",
    "E36": "=$B$21",
    "G36": "=IF(B36=\"\",\"—\",IF(AND(B36>=IF(C36=\"\",-1E+99,C36),B36<=IF(D36=\"\",1E+99,D36)),\"VERDE\",IF(AND(B36>=IF(E36=\"\",-1E+99,E36),B36<=IF(F36=\"\",1E+99,F36)),\"GIALLO\",\"ROSSO\")))",
    "H36": "=IF(G36=\"VERDE\",\"ok\",IF(G36=\"—\",\"\",\"Troppe serie lontane dal cedimento: spingi di più (RIR 0-1).\"))",
    "B37": "=IF(AND(ISNUMBER(BLOCCO!$B$5),BLOCCO!$B$5=BLOCCO!$B$4),\"\",IF(OR($N$37=0,$O$37=0),\"\",$N$37/$O$37-1))",
    "G37": "=IF(B37=\"\",\"—\",IF(AND(B37>=IF(C37=\"\",-1E+99,C37),B37<=IF(D37=\"\",1E+99,D37)),\"VERDE\",IF(AND(B37>=IF(E37=\"\",-1E+99,E37),B37<=IF(F37=\"\",1E+99,F37)),\"GIALLO\",\"ROSSO\")))",
    "H37": "=IF(G37=\"VERDE\",\"ok\",IF(G37=\"—\",\"Vuoto in settimana di deload o se manca una delle due settimane.\",IF(G37=\"GIALLO\",\"Carichi in leggero calo: guarda sonno, kcal e recupero.\",\"Carichi in calo: se succede 2 sedute di fila su più esercizi, anticipa il deload.\")))",
    "N37": "=SUMPRODUCT((STORICO!$B$2:$B$30000>=TODAY()-6)*(STORICO!$B$2:$B$30000<=TODAY()),STORICO!$F$2:$F$30000,STORICO!$G$2:$G$30000)",
    "O37": "=SUMPRODUCT((STORICO!$B$2:$B$30000>=TODAY()-13)*(STORICO!$B$2:$B$30000<=TODAY()-7),STORICO!$F$2:$F$30000,STORICO!$G$2:$G$30000)",
    "B38": "=COUNTIF(VOLUME!$E$4:$E$14,\"sotto\")+COUNTIF(VOLUME!$E$4:$E$14,\"sopra\")+COUNTIF(VOLUME!$E$4:$E$14,\"da decidere\")",
    "G38": "=IF(B38=\"\",\"—\",IF(AND(B38>=IF(C38=\"\",-1E+99,C38),B38<=IF(D38=\"\",1E+99,D38)),\"VERDE\",IF(AND(B38>=IF(E38=\"\",-1E+99,E38),B38<=IF(F38=\"\",1E+99,F38)),\"GIALLO\",\"ROSSO\")))",
    "H38": "=IF(G38=\"VERDE\",\"ok\",\"Sistema le serie in PIANO: guarda quali distretti sono fuori in VOLUME.\")",
    "B39": "=IF(BLOCCO!$B$5=\"\",\"\",BLOCCO!$B$5)",
    "D39": "=BLOCCO!$B$4-2",
    "F39": "=BLOCCO!$B$4",
    "G39": "=IF(B39=\"\",\"—\",IF(AND(B39>=IF(C39=\"\",-1E+99,C39),B39<=IF(D39=\"\",1E+99,D39)),\"VERDE\",IF(AND(B39>=IF(E39=\"\",-1E+99,E39),B39<=IF(F39=\"\",1E+99,F39)),\"GIALLO\",\"ROSSO\")))",
    "H39": "=BLOCCO!$B$6"
};
  const writers = {
    en: function (r, f) { r.setFormula(f); },
    locale: function (r, f) { r.setFormula(mfLocalizeFormula_(f)); },
    digitata: function (r, f) { r.setValue(mfLocalizeFormula_(f)); }
  };
  let pending = Object.keys(FORMULAS);
  const methods = {};
  ['en', 'locale', 'digitata'].forEach(function (m) {
    if (!pending.length) return;
    pending.forEach(function (a) { sh.getRange(a).clearContent(); });
    pending.forEach(function (a) { writers[m](sh.getRange(a), FORMULAS[a]); });
    SpreadsheetApp.flush();
    const bad = mfControlloErrors_(sh);
    pending.forEach(function (a) { if (bad.indexOf(a) < 0) methods[a] = m; });
    pending = pending.filter(function (a) { return bad.indexOf(a) >= 0; });
  });
  return { failed: pending, methods: methods };
}

// Converte una formula dalla sintassi inglese (virgole, punto decimale) a quella dei fogli in italiano e simili
// (punto e virgola tra gli argomenti, virgola decimale). Non tocca i testi tra virgolette.
function mfLocalizeFormula_(f) {
  let out = '', inStr = false;
  for (let i = 0; i < f.length; i++) {
    const ch = f.charAt(i);
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (!inStr) {
      if (ch === ',') { out += ';'; continue; }
      if (ch === '.' && /\d/.test(f.charAt(i - 1)) && /\d/.test(f.charAt(i + 1))) { out += ','; continue; }
    }
    out += ch;
  }
  return out;
}

// Indirizzi delle celle di CONTROLLO che mostrano un errore (#ERROR!, #REF!, #NAME?...).
function mfControlloErrors_(sh) {
  const bad = [];
  sh.getRange(1, 1, 48, 15).getDisplayValues().forEach(function (row, r) {
    row.forEach(function (v, c) {
      if (/^#(ERROR|REF|NAME|VALUE|N\/A|DIV)/.test(v)) bad.push(String.fromCharCode(65 + c) + (r + 1));
    });
  });
  return bad;
}


/*************************** MANUTENZIONE: README ***************************/

/**
 * Riscrive il tab README (guida d'uso). SOSTITUISCE il contenuto del tab; se il tab è nascosto resta nascosto.
 */
function mfSetupReadme() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('README');
  const created = !sh;
  if (!sh) sh = ss.insertSheet('README');
  sh.clear();
  const ROWS = [
    ["h", "COME FUNZIONA"],
    ["t", "Due fonti di verità: STORICO_METRICS (peso, kcal, macro, passi: arrivano da MacroFactor via Drive) e STORICO (le serie di allenamento: arrivano da SESSIONE). PESO, BLOCCO, VOLUME e CONTROLLO sono calcolati da lì e non vanno scritti a mano."],
    ["t", "Schema: MacroFactor > cartella Drive \"MacroFactor\" > menu Gym > Sincronizza > STORICO_METRICS   |   SESSIONE > spunta Z2 > STORICO   |   da lì > PESO, BLOCCO, VOLUME, CONTROLLO."],
    ["b", ""],
    ["h", "USO"],
    ["t", "Ogni allenamento (tab SESSIONE): scegli il giorno in B3, metti la data in E3, scrivi kg / reps / RIR nelle celle crema (Set1-Set4) e spunta la casella Gym_SaveCheckbox (Z2). Le serie vanno in STORICO e vengono pulite; l'esito compare in Z3."],
    ["t", "• Una serie si salva se ha kg e reps (il RIR può restare vuoto). Se manca kg o reps resta nella cella. Una serie già presente in STORICO (stessa data, giorno, esercizio e numero) non viene riscritta."],
    ["t", "• Kg o libbre: F3 (accanto alla data) è l'unità di default per tutta la seduta; nella colonna Y, sulla riga di un esercizio, puoi scegliere un'eccezione solo per quell'esercizio (vuoto = usa F3). Con lb i pesi vengono convertiti in kg (1 lb = 0,45359237 kg, arrotondato a 2 decimali, cioè al massimo 5 grammi di differenza). In una singola cella puoi anche scrivere l'unità, per esempio 135lb o 60kg. L'unità della colonna Y si azzera da sola quando la riga viene salvata."],
    ["t", "• Se un peso è circa 2,2 volte più alto o più basso dell'ultima volta per quell'esercizio, probabilmente l'unità è sbagliata: la serie non viene salvata e resta in cella. Se è giusto, scrivi l'unità nella cella (es. 60kg)."],
    ["t", "Una volta a settimana (metriche): in MacroFactor vai su Più > Esportazione dati > Granular Export, periodo completo, con Calories & Macros, Scale Weight, Steps e Body Metrics spuntati. Salva il file nella cartella Drive \"MacroFactor\", poi nel foglio: menu Gym > Sincronizza MacroFactor da Drive."],
    ["t", "• Lo script legge solo il file più recente della cartella (per ultima modifica): i vecchi export possono restare lì, non vengono letti. Non mettere lì il file del diario degli alimenti (foglio \"Sheet1\"): non ha i tab giusti."],
    ["t", "Quando vuoi: guarda CONTROLLO (semafori verde / giallo / rosso su peso, kcal, proteine, vita, serie, RIR, carichi, volume e deload)."],
    ["b", ""],
    ["h", "I TAB"],
    ["t", "• CONTROLLO: semafori e paletti. Celle blu in alto (B8:B22) = soglie modificabili. Tabella della vita a destra (J:L). Fase e ritmo del peso: kg a settimana."],
    ["t", "• DA_DECIDERE: elenco di ciò che resta da decidere e tabella per annotare le prove in palestra."],
    ["t", "• PIANO: è la fonte degli esercizi. Cambi esercizi lì e SESSIONE si aggiorna da sola. Giallo = da decidere. Un esercizio che inizia con \"[ ]\" è ancora da scegliere e non viene salvato."],
    ["t", "• SESSIONE: dove scrivi i log. Header dei set alla riga 5 da colonna I (Set1..Set4, tre colonne ciascuno: kg / reps / RIR). Range con nome Gym_SaveCheckbox = Z2, stato del salvataggio in Z3. \"Primo Set\" (U:W) mostra l'ultimo Set 1 salvato per quel giorno + esercizio."],
    ["t", "• STORICO (può essere nascosto): tutte le serie salvate. Il peso è sempre in kg (Weight_kg); le colonne L e M (Input_weight, Input_unit) conservano il valore e l'unità che hai scritto. Cresce sempre: non va cancellato."],
    ["t", "• STORICO_METRICS: una riga per giorno. A Date, B Bodyweight_kg, C Kcal, D Protein_g, E Carbs_g, F Fat_g, G Notes (tue, lo script non le tocca), H Steps, I Fat_percent. Alimentato da MacroFactor. Non va cancellato né rinominato."],
    ["t", "• MISURE (può essere nascosto): misure corporee da MacroFactor (Body Metrics), una riga per data. Lo script le aggiorna; un valore che scrivi a mano non viene cancellato da una cella vuota."],
    ["t", "• VOLUME: serie a settimana per distretto, calcolate da PIANO, con target min/max (celle blu)."],
    ["t", "• PESO: scegli la fase (Bulk/Cut/Mantenimento); l'ALERT dice TROPPO VELOCE / TROPPO LENTO sulla media di 3 settimane. Soglie in % nelle celle blu. CONTROLLO ha le sue soglie in kg a settimana: i due possono dare giudizi un po' diversi."],
    ["t", "• BLOCCO: data di inizio blocco (B3), deload alla settimana 7 e cicli (Bulk 1, Cut, Bulk 2) con peso medio."],
    ["b", ""],
    ["h", "SCRIPT (Estensioni > Apps Script)"],
    ["t", "• File unico (Gym_MacroFactor_Completo.gs): menu Gym, salvataggio SESSIONE > STORICO (onEdit sulla casella) e sincronizzazione MacroFactor. Non servono trigger da installare."],
    ["t", "• Per leggere l'xlsx serve il servizio avanzato \"Drive API\" (Servizi > +). La prima volta Google chiede i permessi."],
    ["t", "• Prima importazione di tutto lo storico: metti MF_DAYS_BACK = 9999, lancia la sincronizzazione, poi riportalo a 60."],
    ["t", "• Tutto sta in un unico file: incolla sempre l'intero file al posto del vecchio. Menu Gym > Manutenzione: Aggiungi scelta unità kg/lb (F3 e colonna Y), Ripara Primo Set (se vedi #N/A in U:W), Applica ripetizioni a PIANO, Volume: rampa e serie piene, Crea tab CONTROLLO (una volta, si ferma se esiste), Ripara formule CONTROLLO (se vedi #ERROR!) e Riscrivi README."],
    ["b", ""],
    ["h", "GUARDIE (popup di errore)"],
    ["t", "• SESSIONE: data in E3 vuota, nel futuro o più vecchia di 45 giorni; kg sopra 500, reps sopra 100 o sotto 1, RIR sopra 10; sospetto errore di unità (kg/lb); esercizi ancora da scegliere. In questi casi la serie non viene salvata e resta in cella. Se la scrittura in STORICO non riesce, SESSIONE non viene pulita."],
    ["t", "• MacroFactor: cartella, file o tab mancanti (non scrive niente); più di 150 righe da scrivere (chiede conferma); export più vecchio di 7 giorni; peso fuori da 30-250 kg, kcal sopra 15000, macro sopra 1500 g, passi sopra 100000, giorni nel futuro (scartati con avviso)."],
    ["t", "• Soglie: costanti in alto nello script (GYM_MAX_PAST_DAYS, GYM_MAX_KG, MF_CONFIRM_ABOVE, MF_STALE_DAYS)."],
    ["b", ""],
    ["h", "REGOLE SUI DATI"],
    ["t", "• Steps = 0 in MacroFactor è un dato mancante (prima del 2026 ci sono mesi di zeri): resta vuoto."],
    ["t", "• I giorni con meno kcal del minimo (CONTROLLO!B22, ora 1500) sono log incompleti: non entrano nelle medie di kcal e proteine."],
    ["t", "• Esporta sempre il periodo completo: lo script abbina i giorni per data, aggiorna quelli presenti e aggiunge i nuovi, senza doppioni."],
    ["t", "• Usa una sola fonte per le metriche: MacroFactor. DAILY_METRICS non esiste più."],
    ["t", "• Il fuso orario del foglio (File > Impostazioni) e quello del progetto Apps Script (Impostazioni progetto) devono essere uguali a quello del tuo telefono: MacroFactor data i giorni col fuso del telefono. Se non coincidono, \"oggi\" e le date si sfalsano di un giorno."],
    ["t", "• Le formule sono semplici (INDEX/MATCH/SUMPRODUCT), senza FILTER/SORT."],
    ["b", ""],
    ["h", "DA DECIDERE (celle gialle)"],
    ["t", "Giorni della settimana · data di inizio blocco e fasi (BLOCCO, PESO). Esercizi decisi il 29/10/2026. Ripetizioni: decise il 29/10/2026 (6-10 pressate pesanti; 8-12 tirate, petto con manubri, bicipiti, leg curl, leg press; 10-15 isolamento; 12-20 alzate laterali e deltoidi posteriori), si applicano a PIANO dal menu Gym > Manutenzione. Volume: si parte dalle serie che facevi davvero (circa 50 a settimana): rampa di 51 serie nelle settimane 1-2, poi 58 serie piene da settimana 3 (menu Gym > Manutenzione > Volume). Poi guardi la performance e, se serve, rimodelli le serie a mano in PIANO."],
    ["b", ""],
    ["h", "ASSUNZIONI"],
    ["t", "Le serie di Upper A e B sono una mia bozza, non decise. Target_RIR \"0-1\" è la regola generale che hai indicato. Target di volume e deload alla settimana 7 sono proposte mie."],
    ["t", "Paletti di CONTROLLO: kcal target 3000 e ritmo del peso 0.25-0.5 kg a settimana vengono da te; peso tetto 86 kg, vita tetto 92 cm, proteine almeno 1.6 g/kg, kcal minime 1500 e le soglie delle guardie sono scelte mie, da confermare."],
    ["b", ""],
    ["h", "ESEMPIO DI RIGA COMPILATA (valori inventati, solo per il formato)"],
  ];
  const EX = [["Esercizio", "Set1 kg", "Set1 reps", "Set1 RIR", "Set2 kg", "Set2 reps", "Set2 RIR"], ["Hammer iso-laterale panca piana", 60, 10, 1, 60, 8, 0]];
  const n = ROWS.length;
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setFontFamily('Arial').setFontSize(10);
  sh.getRange(1, 1, n, 1).setValues(ROWS.map(function (r) { return [r[1]]; }));
  const heads = [];
  ROWS.forEach(function (r, i) { if (r[0] === 'h') heads.push('A' + (i + 1)); });
  sh.getRangeList(heads).setFontWeight('bold');
  sh.setColumnWidth(1, 780);
  for (let c = 2; c <= 7; c++) sh.setColumnWidth(c, 80);
  sh.getRange(1, 1, n, 1).setWrap(true).setVerticalAlignment('top');
  sh.getRange(n + 1, 1, EX.length, 7).setValues(EX);
  sh.getRange(n + 1, 1, 1, 7).setFontWeight('bold');
  if (created) sh.hideSheet();
  ss.toast('README aggiornato.', 'README', 5);
}
/*************************** WEB APP PER IL TELEFONO (Galaxy Z Fold / iPhone) ***************************/
// Pagina HTML servita da questo script: legge PIANO e scrive ogni serie in STORICO con le stesse guardie di SESSIONE
// (data, valori impossibili, errore kg/lb, niente doppioni). SESSIONE continua a funzionare come prima.
// Interfaccia in inglese. Una sola app per più persone:
//  - Leonardo: deployment "solo io" (nessuna chiave nel link) -> il suo foglio.
//  - Altri: deployment "chiunque" + chiave personale nel link (?k=...) -> il loro foglio (GYMAPP_USERS).
//    Senza una chiave valida il deployment pubblico non apre niente.
// Dopo una modifica allo script: Esegui il deployment > Gestisci deployment > matita > Versione: nuova versione
// (per OGNI deployment attivo).

const GYMAPP_SS_ID = '14F5-d0tIYVBMWqGeWmjAWBAocvW8sWrkJpl7kpU2euk';   // foglio di Leonardo
const GYMAPP_OWNER = 'leonardo752010@gmail.com';
const GYMAPP_USERS = {                                                    // chiave nel link -> foglio
  'REPLACE_WITH_PERSONAL_KEY': { name: 'Raina', ssId: '1Fhx694V20C3qyC7tPkEnOM-BfDhuqlNHDDxTfUjTyvU' }   // THE COMEBACK of the beast MFS (il suo file: può usare l'app o la sua SESSIONE)
};
const GYMAPP_UNDO_MINUTES = 30;   // una serie salvata dall'app si può annullare entro tanti minuti

function doGet(e) {
  const k = String((e && e.parameter && e.parameter.k) || '').replace(/[^A-Za-z0-9_-]/g, '');
  const html = GYMAPP_HTML.replace("const GYM_KEY = '__GYM_KEY__';", "const GYM_KEY = '" + k + "';");
  return HtmlService.createHtmlOutput(html)
    .setTitle('Gym')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // così l'app installabile (PWA) può mostrarla a schermo intero
}

// Foglio di chi usa l'app: chiave valida -> il suo foglio; nessuna chiave -> solo Leonardo, il suo foglio.
function gymSS_(k) {
  k = String(k || '');
  if (k) {
    const u = GYMAPP_USERS[k];
    if (!u) throw new Error('This link is not valid. Ask Leonardo for your link.');
    return SpreadsheetApp.openById(u.ssId);
  }
  let me = '';
  try { me = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { /* anonimo */ }
  if (me !== GYMAPP_OWNER) throw new Error('This link is not valid. Ask Leonardo for your link.');
  return SpreadsheetApp.openById(GYMAPP_SS_ID);
}

// Esercizi da PIANO: [{name, code, exercises:[{order,name,muscle,sets,min,max,rir,notes,pending}]}]
function gymAppPlan_(ss) {
  const sh = ss.getSheetByName('PIANO');
  if (!sh) throw new Error('PIANO tab not found.');
  const v = sh.getDataRange().getValues();
  const head = v[0].map(function (h) { return String(h).trim(); });
  const ix = function (n) { const i = head.indexOf(n); if (i < 0) throw new Error('PIANO: column missing: ' + n); return i; };
  const c = { code: ix('Day_Code'), day: ix('Day_Name'), order: ix('Order'), ex: ix('Exercise'), mus: ix('Target_Muscle'),
              sets: ix('Sets'), rir: ix('Target_RIR'), notes: ix('Notes'),
              min: head.indexOf('Reps_Min'), max: head.indexOf('Reps_Max'), reps: head.indexOf('Target_Reps') };
  if ((c.min < 0 || c.max < 0) && c.reps < 0) throw new Error('PIANO: column missing: Reps_Min/Reps_Max or Target_Reps');
  // numeri dentro una cella: 3 -> [3], "2-3" -> [2, 3], "10-12" -> [10, 12]; un "10-12" diventato data -> giorno e mese
  const nums = function (x) {
    if (x instanceof Date) return [x.getDate(), x.getMonth() + 1];
    const m = String(x === null || x === undefined ? '' : x).match(/\d+(?:[.,]\d+)?/g);
    return m ? m.map(function (s) { return Number(s.replace(',', '.')); }) : [];
  };
  const txt = function (x) { return x instanceof Date ? x.getDate() + '-' + (x.getMonth() + 1) : String(x || ''); };
  const days = [], byName = {};
  v.slice(1).forEach(function (r) {
    const day = String(r[c.day] || '').trim(), ex = String(r[c.ex] || '').trim();
    if (!day || !ex) return;
    if (!byName[day]) { byName[day] = { name: day, code: String(r[c.code] || ''), exercises: [] }; days.push(byName[day]); }
    byName[day].exercises.push({
      order: Number(r[c.order]) || 0, name: ex, muscle: String(r[c.mus] || ''),
      sets: nums(r[c.sets])[0] || 0,                                       // "2-3" -> 2 (la 3a si aggiunge con + extra set)
      min: c.min >= 0 ? (Number(r[c.min]) || '') : (nums(r[c.reps])[0] || ''),
      max: c.max >= 0 ? (Number(r[c.max]) || '') : (nums(r[c.reps]).slice(-1)[0] || ''),
      rir: txt(r[c.rir]), notes: String(r[c.notes] || ''), pending: /^\[\s*\]/.test(ex)
    });
  });
  days.forEach(function (d) { d.exercises.sort(function (a, b) { return a.order - b.order; }); });
  return days;
}

// Legge STORICO una volta: righe con data valida -> {key, ts, day, ex, set, kg, reps, rir, row}
function gymAppStorico_(ss, tz) {
  const st = ss.getSheetByName('STORICO');
  if (!st) throw new Error('STORICO tab not found.');
  const sl = st.getLastRow();
  if (sl < 2) return { sheet: st, rows: [] };
  const rows = [];
  st.getRange(2, 1, sl - 1, 8).getValues().forEach(function (r, i) {
    if (!(r[1] instanceof Date)) return;
    rows.push({ row: i + 2, ts: r[0] instanceof Date ? r[0].getTime() : 0, key: Utilities.formatDate(r[1], tz, 'yyyy-MM-dd'),
                day: String(r[2]).trim(), ex: String(r[3]).trim(), set: Number(r[4]),
                kg: typeof r[5] === 'number' ? r[5] : null, reps: typeof r[6] === 'number' ? r[6] : null,
                rir: typeof r[7] === 'number' ? r[7] : null });
  });
  return { sheet: st, rows: rows };
}

/** Dati per la pagina: piano, serie già fatte nella data scelta, ultima seduta per esercizio. */
function gymAppData(dateKey, k) {
  const ss = gymSS_(k), tz = ss.getSpreadsheetTimeZone();
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) dateKey = todayKey;
  const days = gymAppPlan_(ss);
  const sto = gymAppStorico_(ss, tz);
  const now = Date.now();

  const done = {};      // giorno -> esercizio -> [serie]
  const hist = {};      // esercizio -> data -> [serie]  (solo date precedenti a quella scelta)
  sto.rows.forEach(function (r) {
    if (r.kg === null || r.reps === null) return;
    const s = { set: r.set, kg: r.kg, reps: r.reps, rir: r.rir };
    if (r.key === dateKey) {
      s.undo = r.ts && (now - r.ts) < GYMAPP_UNDO_MINUTES * 60000;
      ((done[r.day] = done[r.day] || {})[r.ex] = done[r.day][r.ex] || []).push(s);
    } else if (r.key < dateKey) {
      ((hist[r.ex] = hist[r.ex] || {})[r.key] = hist[r.ex][r.key] || []).push(s);
    }
  });
  const last = {};
  Object.keys(hist).forEach(function (ex) {
    const keys = Object.keys(hist[ex]).sort();
    const kk = keys[keys.length - 1];
    last[ex] = { date: kk, sets: hist[ex][kk].sort(function (a, b) { return a.set - b.set; }) };
  });
  Object.keys(done).forEach(function (d) { Object.keys(done[d]).forEach(function (e) { done[d][e].sort(function (a, b) { return a.set - b.set; }); }); });

  let defaultDay = '', unit = 'kg';
  const ses = ss.getSheetByName('SESSIONE');
  if (ses) {
    defaultDay = String(ses.getRange('B3').getValue() || '').trim();
    unit = sessUnit_(ses.getRange(GYM_UNIT_CELL).getValue()) || 'kg';
  }
  return { today: todayKey, date: dateKey, days: days, done: done, last: last, defaultDay: defaultDay, unit: unit };
}

/**
 * Salva UNA serie in STORICO. p = {date, day, exercise, set, kg, reps, rir, unit, force, k}
 * force = true salta solo la guardia kg/lb (il peso viene trattato come scritto con l'unità a mano).
 */
function gymAppSaveSet(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, msg: 'Another save is in progress: try again.' };
  try {
    const ss = gymSS_(p.k), tz = ss.getSpreadsheetTimeZone();
    const dateKey = String(p.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: false, msg: 'Invalid date.' };
    const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const diff = daysBetween_(dateKey, todayKey);
    if (diff < -1) return { ok: false, msg: 'The date is in the future: fix it at the top.' };
    if (diff > GYM_MAX_PAST_DAYS) return { ok: false, msg: 'The date is more than ' + GYM_MAX_PAST_DAYS + ' days ago: fix it at the top.' };

    const plan = gymAppPlan_(ss).filter(function (d) { return d.name === p.day; })[0];
    const ex = plan && plan.exercises.filter(function (e) { return e.name === p.exercise; })[0];
    if (!ex) return { ok: false, msg: 'Exercise not found in the plan for ' + p.day + ': reload the app.' };
    if (ex.pending) return { ok: false, msg: 'Exercise not chosen yet in the plan.' };
    const setNo = Math.round(Number(p.set));
    if (!(setNo >= 1 && setNo <= 20)) return { ok: false, msg: 'Invalid set number.' };
    const unit = sessUnit_(p.unit) || 'kg';

    const sto = gymAppStorico_(ss, tz);
    const existing = {}, lastKg = {};
    sto.rows.forEach(function (r) {
      if (r.key === dateKey) existing[[dateKey, r.day, r.ex, r.set].join('|')] = true;
      if (r.kg !== null) {
        const cur = lastKg[r.ex];
        if (!cur || r.key > cur.key) lastKg[r.ex] = { key: r.key, kg: r.kg };
        else if (r.key === cur.key && r.kg > cur.kg) cur.kg = r.kg;
      }
    });
    const lastKgByEx = {};
    Object.keys(lastKg).forEach(function (e) { lastKgByEx[e] = lastKg[e].kg; });

    const inputs = [];
    for (let i = 0; i < setNo * 3; i++) inputs.push('');
    inputs[(setNo - 1) * 3] = p.force ? String(p.kg).replace('.', ',') + unit : p.kg;
    inputs[(setNo - 1) * 3 + 1] = p.reps;
    inputs[(setNo - 1) * 3 + 2] = (p.rir === '' || p.rir === null || p.rir === undefined) ? '' : p.rir;

    const dateObj = Utilities.parseDate(dateKey, tz, 'yyyy-MM-dd');
    const res = sessBuildRows_(p.day, dateKey, dateObj,
      [{ unit: unit, exercise: ex.name, targetRir: ex.rir, notes: ex.notes, inputs: inputs }],
      existing, new Date(), setNo, unit, lastKgByEx);

    if (res.skipped.length) return { ok: false, dup: true, msg: 'Set ' + setNo + ' is already saved for this date: reloading.' };
    if (res.incomplete.length) return { ok: false, msg: 'Weight and reps must be numbers.' };
    if (res.invalid.length) {
      const what = res.invalid[0].what;
      if (/unità/.test(what)) {
        return { ok: false, unitWarn: true, msg: p.kg + ' ' + unit + ' looks like a kg/lb mix-up: last time it was ' +
                 lastKgByEx[ex.name] + ' kg. Check the kg/lb switch at the top, or save anyway.' };
      }
      return { ok: false, msg: 'These numbers look wrong (max ' + GYM_MAX_KG + ' kg, reps 1-' + GYM_MAX_REPS + ', RIR 0-' + GYM_MAX_RIR + ').' };
    }
    if (res.rows.length !== 1) return { ok: false, msg: 'Nothing to save.' };

    const st = sto.sheet, sl = st.getLastRow();
    // se lo STORICO ha meno colonne (es. il file di lei: 10, senza Input_weight/Input_unit) scrive solo quelle
    const hdrN = st.getRange(1, 1, 1, Math.max(st.getLastColumn(), 1)).getValues()[0].filter(function (h) { return String(h).trim() !== ''; }).length;
    const row = res.rows[0].slice(0, hdrN >= 13 ? 13 : Math.max(hdrN, 10));
    ensureGrid_(st, sl + 1, row.length);
    if (sl > 1) st.getRange(sl, 1, 1, row.length).copyTo(st.getRange(sl + 1, 1, 1, row.length), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    st.getRange(sl + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true, set: { set: setNo, kg: row[5], reps: row[6], rir: row[7] === '' ? null : row[7], undo: true } };
  } catch (err) {
    return { ok: false, msg: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Modifica una serie già salvata (kg, reps, RIR) con gli stessi controlli del salvataggio.
 * p = {date, day, exercise, set, kg, reps, rir, unit, force, k}
 */
function gymAppUpdateSet(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, msg: 'Another save is in progress: try again.' };
  try {
    const ss = gymSS_(p.k), tz = ss.getSpreadsheetTimeZone();
    const dateKey = String(p.date || '');
    const setNo = Math.round(Number(p.set));
    const unit = sessUnit_(p.unit) || 'kg';
    const sto = gymAppStorico_(ss, tz);
    const hit = sto.rows.filter(function (r) {
      return r.key === dateKey && r.day === p.day && r.ex === p.exercise && r.set === setNo;
    }).pop();
    if (!hit) return { ok: false, msg: 'Set not found: reload the app.' };

    const plan = gymAppPlan_(ss).filter(function (d) { return d.name === p.day; })[0];
    const ex = (plan && plan.exercises.filter(function (e) { return e.name === p.exercise; })[0]) || { name: p.exercise, rir: '', notes: '' };

    const lastKg = {};                                         // ultimo peso per esercizio, senza la riga che sto modificando
    sto.rows.forEach(function (r) {
      if (r.row === hit.row || r.kg === null) return;
      const cur = lastKg[r.ex];
      if (!cur || r.key > cur.key) lastKg[r.ex] = { key: r.key, kg: r.kg };
      else if (r.key === cur.key && r.kg > cur.kg) cur.kg = r.kg;
    });
    const lastKgByEx = {};
    Object.keys(lastKg).forEach(function (e) { lastKgByEx[e] = lastKg[e].kg; });

    const inputs = [];
    for (let i = 0; i < setNo * 3; i++) inputs.push('');
    inputs[(setNo - 1) * 3] = p.force ? String(p.kg).replace('.', ',') + unit : p.kg;
    inputs[(setNo - 1) * 3 + 1] = p.reps;
    inputs[(setNo - 1) * 3 + 2] = (p.rir === '' || p.rir === null || p.rir === undefined) ? '' : p.rir;
    const dateObj = Utilities.parseDate(dateKey, tz, 'yyyy-MM-dd');
    const res = sessBuildRows_(p.day, dateKey, dateObj,
      [{ unit: unit, exercise: ex.name, targetRir: ex.rir, notes: ex.notes, inputs: inputs }],
      {}, new Date(), setNo, unit, lastKgByEx);
    if (res.incomplete.length) return { ok: false, msg: 'Weight and reps must be numbers.' };
    if (res.invalid.length) {
      const what = res.invalid[0].what;
      if (/unità/.test(what)) {
        return { ok: false, unitWarn: true, msg: p.kg + ' ' + unit + ' looks like a kg/lb mix-up: last time it was ' +
                 lastKgByEx[ex.name] + ' kg. Check the kg/lb switch at the top, or save anyway.' };
      }
      return { ok: false, msg: 'These numbers look wrong (max ' + GYM_MAX_KG + ' kg, reps 1-' + GYM_MAX_REPS + ', RIR 0-' + GYM_MAX_RIR + ').' };
    }
    const row = res.rows[0], st = sto.sheet;
    st.getRange(hit.row, 6, 1, 3).setValues([[row[5], row[6], row[7]]]);                       // F:H = kg, reps, RIR
    const hdrN = st.getRange(1, 1, 1, Math.max(st.getLastColumn(), 1)).getValues()[0].filter(function (h) { return String(h).trim() !== ''; }).length;
    if (hdrN >= 13) st.getRange(hit.row, 12, 1, 2).setValues([[row[11], row[12]]]);            // L:M = valore e unità scritti
    SpreadsheetApp.flush();
    return { ok: true, set: { set: setNo, kg: row[5], reps: row[6], rir: row[7] === '' ? null : row[7] } };
  } catch (err) {
    return { ok: false, msg: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina una serie salvata (qualsiasi data): toglie la riga da STORICO. p = {date, day, exercise, set, k} */
function gymAppDeleteSet(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, msg: 'Another save is in progress: try again.' };
  try {
    const ss = gymSS_(p.k), tz = ss.getSpreadsheetTimeZone();
    const sto = gymAppStorico_(ss, tz);
    const now = Date.now();
    const hit = sto.rows.filter(function (r) {
      return r.key === p.date && r.day === p.day && r.ex === p.exercise && r.set === Number(p.set);
    }).pop();
    if (!hit) return { ok: false, msg: 'Set not found.' };
    sto.sheet.deleteRow(hit.row);
    return { ok: true };
  } catch (err) {
    return { ok: false, msg: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}
// HTML della pagina (generato: non serve toccarlo a mano)
const GYMAPP_HTML = [
  "<!doctype html>",
  "<html lang=\"it\">",
  "<head>",
  "<meta charset=\"utf-8\">",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
  "<link href=\"https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800;1,900&family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">",
  "<style>",
  "/* NOTTE (default) */",
  ":root{",
  "  --bg:#121110; --card:#1c1a18; --card2:#24211e; --chip:#2c2925; --line:#2e2a26;",
  "  --tx:#f6efe3; --mu:#a39a8e; --mu2:#6d665d;",
  "  --ac:#d4412c; --acTx:#fff6ea; --acSoft:rgba(212,65,44,.16); --glow:0 10px 26px rgba(212,65,44,.35);",
  "  --cream:#f6e6c4; --creamTx:#2a2118;",
  "  --ok:#4b5e22; --okTx:#eef3d8; --okIc:#b9d36b;",
  "  --warn:#e9a23b; --shadow:0 12px 40px rgba(0,0,0,.55);",
  "  color-scheme:dark;",
  "}",
  "/* GIORNO */",
  ":root[data-theme=\"light\"]{",
  "  --bg:#f4ede1; --card:#fbf7f0; --card2:#efe7d9; --chip:#e9dfcf; --line:#e4d9c7;",
  "  --tx:#1f1a14; --mu:#6f655a; --mu2:#a69b8d;",
  "  --ac:#c9382a; --acTx:#fff8ee; --acSoft:rgba(201,56,42,.10); --glow:0 10px 24px rgba(201,56,42,.28);",
  "  --cream:#f3dfb4; --creamTx:#2a2118;",
  "  --ok:#cfe2b0; --okTx:#22300d; --okIc:#3e6b12;",
  "  --warn:#e09a2d; --shadow:0 12px 34px rgba(40,30,20,.16);",
  "  color-scheme:light;",
  "}",
  "*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
  "html,body{margin:0;background:var(--bg);color:var(--tx);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-feature-settings:\"tnum\" 1}",
  "html{transition:background .2s}",
  "body{min-height:100vh;padding-bottom:calc(100px + env(safe-area-inset-bottom))}",
  "button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}",
  "input{font:inherit;color:inherit}",
  ".hide{display:none!important}",
  "",
  "/* testata */",
  ".top{padding:calc(14px + env(safe-area-inset-top)) 16px 4px;max-width:1100px;margin:0 auto}",
  ".hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}",
  ".brand{display:flex;flex-direction:column;gap:4px}",
  ".blogo{width:96px;height:96px;border-radius:50%;box-shadow:0 6px 22px rgba(212,65,44,.25)}",
  ".btitle{font-weight:800;font-size:15px;letter-spacing:.08em}",
  ".ctrls{display:flex;align-items:center;gap:8px;padding-top:6px;flex-wrap:wrap;justify-content:flex-end}",
  ".pill{height:36px;padding:0 14px;border-radius:12px;background:var(--chip);display:inline-flex;align-items:center;font-size:13px;font-weight:800;letter-spacing:.06em;position:relative}",
  ".pill input[type=date]{position:absolute;inset:0;opacity:0;width:100%;height:100%}",
  ".theme{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:var(--tx)}",
  ".theme svg{width:24px;height:24px}",
  ".seg{display:inline-flex;background:var(--chip);border-radius:12px;padding:3px;height:36px}",
  ".seg button{padding:0 9px;border-radius:9px;font-size:12px;font-weight:800;color:var(--mu)}",
  ".seg button.on{background:var(--card);color:var(--tx)}",
  ".days{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0 12px}",
  ".day{min-height:42px;padding:6px 10px;border-radius:12px;background:var(--chip);font-size:15px;font-weight:800;color:var(--tx);line-height:1.15}",
  ".day.on{background:var(--ac);color:var(--acTx);box-shadow:var(--glow)}",
  ".day small{display:block;font-size:11px;font-weight:700;opacity:.75}",
  ".prog{font-size:14px;font-weight:600;margin:2px 0 8px}",
  ".bar{display:flex;gap:4px}",
  ".bar button{flex:1;height:7px;border-radius:4px;background:var(--chip);padding:0}",
  ".bar button.full{background:var(--ac);opacity:.55}",
  ".bar button.cur{background:var(--ac);opacity:1}",
  "",
  "/* layout */",
  ".wrap{padding:10px 16px 0;max-width:1100px;margin:0 auto}",
  ".list{display:none}",
  "@media (min-width:700px){",
  "  .wrap{display:grid;grid-template-columns:minmax(250px,34%) 1fr;gap:18px;align-items:start}",
  "  .list{display:block;position:sticky;top:12px}",
  "  .days{grid-template-columns:repeat(4,1fr)}",
  "}",
  ".li{width:100%;display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:14px;text-align:left;margin-bottom:4px}",
  ".li.cur{background:var(--card)}",
  ".li .n{width:28px;height:28px;flex:none;border-radius:9px;background:var(--chip);display:grid;place-items:center;font-size:13px;font-weight:800;color:var(--mu)}",
  ".li.cur .n{background:var(--ac);color:var(--acTx)}",
  ".li.full .n{background:var(--ok);color:var(--okTx)}",
  ".li .t{flex:1;min-width:0}",
  ".li .t b{display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".li .t span{font-size:12px;color:var(--mu)}",
  ".li.off{opacity:.45}",
  "",
  "/* scheda esercizio */",
  ".card{background:var(--card);border-radius:22px;padding:18px 16px 16px;box-shadow:0 1px 0 var(--line)}",
  ".ex{font-family:'Barlow Condensed',Inter,sans-serif;font-style:italic;font-weight:900;font-size:40px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;margin:0}",
  ".sub{font-size:17px;font-weight:600;margin:4px 0 12px}",
  ".chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}",
  ".chips span{font-size:14px;font-weight:700;padding:6px 12px;border-radius:9px;background:var(--chip)}",
  ".notes{font-size:14px;line-height:1.45;color:var(--mu);margin:0 0 12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
  ".notes.open{display:block}",
  ".last{background:var(--card2);border-radius:14px;padding:11px 14px;margin-bottom:12px}",
  ".last b{font-size:14px}",
  ".last .lv{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:4px;font-size:17px;font-weight:700}",
  ".last .lv em{font-style:normal;color:var(--mu);font-size:12px;font-weight:600;margin-left:3px}",
  ".hint{margin-top:8px;font-size:13px;font-weight:700;color:var(--ac)}",
  "",
  ".done{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--ok);color:var(--okTx);margin-bottom:8px;text-align:left}",
  ".done .ck{color:var(--okIc);font-weight:900;font-size:18px;width:20px}",
  ".done .sn{font-size:16px;font-weight:700;flex:1}",
  ".done .sv{font-size:16px;font-weight:800}",
  ".done .sv small{font-weight:600;opacity:.75;margin-left:6px;font-size:12px}",
  ".done.editing{outline:2px solid var(--ac)}",
  "",
  ".ed{background:var(--card2);border-radius:16px;padding:14px;margin-bottom:8px}",
  ".edh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}",
  ".edh b{font-size:19px;font-weight:800}",
  ".edh span{font-size:13px;color:var(--mu);font-weight:600}",
  ".boxes{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".box{background:var(--card);border-radius:14px;padding:8px 8px 8px}",
  ".box .lbl{font-size:13px;font-weight:800;letter-spacing:.06em;margin:2px 0 0 6px}",
  ".box input{width:100%;text-align:center;background:none;border:0;outline:0;font-size:44px;font-weight:800;letter-spacing:-.02em;padding:2px 0 6px}",
  ".pm{display:grid;grid-template-columns:1fr 1fr;gap:4px}",
  ".pm button{height:42px;border-radius:9px;background:var(--chip);font-size:26px;font-weight:500;line-height:1}",
  ".pm button:active{transform:scale(.96)}",
  ".rirrow{display:flex;align-items:center;gap:8px;margin-top:12px}",
  ".rirrow>span{font-size:15px;font-weight:800;width:38px}",
  ".r5{flex:1;display:grid;grid-template-columns:repeat(5,1fr);gap:6px}",
  ".r5 button{height:42px;border-radius:10px;background:var(--chip);font-weight:800;font-size:17px}",
  ".r5 button.on{background:var(--cream);color:var(--creamTx)}",
  ".save{margin-top:14px;width:100%;height:56px;border-radius:14px;background:var(--ac);color:var(--acTx);font-size:20px;font-weight:800;box-shadow:var(--glow)}",
  ".save:disabled{opacity:.55}",
  ".save:active{transform:scale(.99)}",
  ".edbtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}",
  ".edbtns button{height:46px;border-radius:12px;font-weight:800;font-size:15px;background:var(--chip)}",
  ".edbtns .del{color:var(--ac);background:var(--acSoft)}",
  ".todo{display:flex;justify-content:space-between;padding:12px 14px;border-radius:12px;background:var(--card2);color:var(--mu2);font-weight:700;margin-bottom:8px}",
  ".extra{width:100%;height:46px;border-radius:12px;border:1.5px dashed var(--line);color:var(--mu);font-weight:700;font-size:14px;margin-top:2px}",
  ".offnote{font-size:14px;color:var(--mu);background:var(--card2);border-radius:12px;padding:12px;margin-bottom:10px}",
  ".navrow{display:flex;gap:8px;margin-top:12px}",
  ".navrow .back{width:56px;border-radius:18px;background:var(--card);font-size:24px;font-weight:700}",
  ".next{flex:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-radius:18px;background:var(--card);text-align:left}",
  ".next span{display:block;font-size:13px;color:var(--mu);font-weight:600}",
  ".next b{display:block;font-size:17px;font-weight:800}",
  ".next i{font-style:normal;font-size:26px}",
  ".finish{flex:1;padding:14px 16px;border-radius:18px;background:var(--card);font-weight:800;text-align:center}",
  "",
  "/* timer */",
  ".timer{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:30;background:var(--card2);border:1px solid var(--line);border-radius:20px;padding:10px 10px 10px 16px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow);overflow:hidden;max-width:560px;margin:0 auto}",
  ".timer .pg{position:absolute;left:0;bottom:0;height:3px;background:var(--ac);transition:width 1s linear}",
  ".timer .tt{flex:1}",
  ".timer .tt span{display:block;font-size:11px;color:var(--mu);font-weight:800;letter-spacing:.06em;text-transform:uppercase}",
  ".timer .tt b{font-size:26px;font-weight:800}",
  ".timer.zero{background:var(--acSoft);border-color:var(--ac);animation:flag 1s ease-in-out infinite}",
  "@keyframes flag{50%{box-shadow:0 0 0 6px var(--acSoft),var(--shadow)}}",
  ".timer button{height:42px;min-width:48px;padding:0 10px;border-radius:12px;background:var(--chip);font-weight:800;font-size:14px}",
  "",
  "/* avvisi */",
  ".toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translate(-50%,-160%);visibility:hidden;z-index:50;background:var(--tx);color:var(--bg);padding:11px 16px;border-radius:14px;font-size:14px;font-weight:700;max-width:calc(100% - 32px);transition:transform .25s}",
  ".toast.show{transform:translate(-50%,0);visibility:visible}",
  ".toast.bad{background:var(--ac);color:#fff}",
  ".sheetBg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:flex-end;justify-content:center}",
  ".sheet{background:var(--card);border-radius:24px 24px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom));width:100%;max-width:520px}",
  ".sheet h2{margin:0 0 8px;font-size:19px}",
  ".sheet p{margin:0 0 18px;color:var(--mu);font-size:14px;line-height:1.45}",
  ".sheet .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".sheet .row button{height:52px;border-radius:14px;font-weight:800;background:var(--chip)}",
  ".sheet .row button.p{background:var(--ac);color:var(--acTx)}",
  "",
  ".load{display:grid;place-items:center;height:50vh;color:var(--mu);font-size:14px;gap:12px}",
  ".spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--chip);border-top-color:var(--ac);animation:sp .8s linear infinite}",
  "@keyframes sp{to{transform:rotate(360deg)}}",
  ".err{color:var(--ac);text-align:center;padding:0 24px;line-height:1.5}",
  "</style>",
  "</head>",
  "<body>",
  "<header class=\"top\">",
  "  <div class=\"hdr\">",
  "    <div class=\"brand\">",
  "      <img class=\"blogo\" src=\"https://leonardo752010-coder.github.io/gym-app/icon-512.png\" alt=\"Gym\">",
  "      <div class=\"btitle\" id=\"tWorkout\">ALLENAMENTO</div>",
  "    </div>",
  "    <div class=\"ctrls\">",
  "      <label class=\"pill\"><span id=\"dateTxt\"></span><input type=\"date\" id=\"dateIn\"></label>",
  "      <button class=\"theme\" id=\"themeBtn\" aria-label=\"Giorno / notte\"></button>",
  "      <div class=\"seg\" id=\"unitSeg\"><button data-u=\"kg\">kg</button><button data-u=\"lb\">lb</button></div>",
  "    </div>",
  "  </div>",
  "  <div class=\"days\" id=\"days\"></div>",
  "  <div id=\"progBox\"></div>",
  "</header>",
  "<main class=\"wrap\" id=\"wrap\"><div class=\"load\" style=\"grid-column:1/-1\"><div class=\"spin\"></div><span id=\"loadTxt\"></span></div></main>",
  "<div class=\"timer hide\" id=\"timer\"><div class=\"pg\" id=\"tPg\"></div><div class=\"tt\"><span id=\"tLab\"></span><b id=\"tTxt\">0:00</b></div><button id=\"tMinus\">−15</button><button id=\"tPlus\">+15</button><button id=\"tStop\">✕</button></div>",
  "<div class=\"toast\" id=\"toast\"></div>",
  "<div id=\"sheetHost\"></div>",
  "",
  "<script>",
  "// Chiave personale (vuota per Leonardo): la inserisce il server, decide quale foglio usare",
  "const GYM_KEY = '__GYM_KEY__';",
  "// Lingua: italiano per Leonardo, inglese con la chiave personale",
  "const T = GYM_KEY ? {",
  "  workout:'WORKOUT', today:'Today', loading:'Loading your plan…', loadingShort:'Loading…', cant:'Can&#39;t open your log.',",
  "  exOf:(i,n)=>'Exercise ' + i + ' of ' + n, rep:'reps', last:'Last session', set:'Set', target:'Target', save:'Save set',",
  "  update:'Update set', del:'Delete', cancel:'Cancel', next:'Next', extra:'+ extra set', finished:'Session done. Great work 💪',",
  "  notPlan:'Not in the plan (0 sets). You can still log an extra set.', pending:'Exercise not chosen yet in the plan.',",
  "  hint:'↑ You hit the top of the range: add weight', rest:'Rest', go:'Go!', saved:n=>'Set ' + n + ' saved', updated:n=>'Set ' + n + ' updated',",
  "  deleted:n=>'Set ' + n + ' deleted', needs:u=>u + ' and reps needed', checkW:'Check the weight', fix:'Fix it', anyway:'Save anyway',",
  "  delQ:n=>'Delete set ' + n + '?', delP:'It will be removed from your log.', listOff:'not in plan', listPending:'not chosen yet', sets:'sets',",
  "  conn:'Connection: ', notSaved:'Not saved', saving:'Saving…', locale:'en-GB', dayNight:'Day / night'",
  "} : {",
  "  workout:'ALLENAMENTO', today:'Oggi', loading:'Carico il piano…', loadingShort:'Carico…', cant:'Non riesco ad aprire il log.',",
  "  exOf:(i,n)=>'Esercizio ' + i + ' di ' + n, rep:'rep', last:'Ultima sessione', set:'Serie', target:'Target', save:'Salva serie',",
  "  update:'Aggiorna serie', del:'Elimina', cancel:'Annulla', next:'Prossimo', extra:'+ serie extra', finished:'Allenamento completato 💪',",
  "  notPlan:'Fuori piano (0 serie). Puoi comunque registrare una serie extra.', pending:'Esercizio ancora da scegliere nel PIANO.',",
  "  hint:'↑ Hai chiuso il range: aumenta il peso', rest:'Recupero', go:'Vai!', saved:n=>'Serie ' + n + ' salvata', updated:n=>'Serie ' + n + ' aggiornata',",
  "  deleted:n=>'Serie ' + n + ' eliminata', needs:u=>'Servono ' + u + ' e rep', checkW:'Controlla il peso', fix:'Correggo', anyway:'Salva così',",
  "  delQ:n=>'Eliminare la serie ' + n + '?', delP:'Verrà tolta dallo STORICO.', listOff:'fuori piano', listPending:'da scegliere', sets:'serie',",
  "  conn:'Connessione: ', notSaved:'Non salvato', saving:'Salvo…', locale:'it-IT', dayNight:'Giorno / notte'",
  "};",
  "document.documentElement.lang = GYM_KEY ? 'en' : 'it';",
  "",
  "const S = { data:null, date:null, day:null, unit:'kg', idx:0, draft:{}, edit:null, busy:false, timer:null, tEnd:0, tTot:0, openNotes:false };",
  "const $ = id => document.getElementById(id);",
  "const esc = s => String(s == null ? '' : s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));",
  "const fmtN = n => (n == null || n === '') ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ',');",
  "const parseN = s => { const n = Number(String(s).trim().replace(',', '.')); return String(s).trim() === '' || isNaN(n) ? null : n; };",
  "const store = { get(k){ try { return localStorage.getItem('gym.' + k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem('gym.' + k, v); } catch(e){} } };",
  "",
  "$('tWorkout').textContent = T.workout;",
  "$('loadTxt').textContent = T.loading;",
  "$('tLab').textContent = T.rest;",
  "$('themeBtn').setAttribute('aria-label', T.dayNight);",
  "",
  "// Giorno / notte: ricorda la scelta; la prima volta segue il telefono",
  "const ICON_SUN = '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4.5\" fill=\"currentColor\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/></svg>';",
  "const ICON_MOON = '<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z\"/></svg>';",
  "function applyTheme(t){",
  "  document.documentElement.dataset.theme = t;",
  "  $('themeBtn').innerHTML = t === 'light' ? ICON_MOON : ICON_SUN;",
  "}",
  "applyTheme(store.get('theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));",
  "$('themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; store.set('theme', t); applyTheme(t); buzz(8); };",
  "",
  "function call(fn, ...args){",
  "  return new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...args));",
  "}",
  "function toast(msg, bad){",
  "  const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');",
  "  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast' + (bad ? ' bad' : ''), bad ? 4500 : 2200);",
  "}",
  "function buzz(p){ try { navigator.vibrate && navigator.vibrate(p); } catch(e){} }",
  "",
  "function niceDate(k){",
  "  if (!k) return '';",
  "  const [y,m,d] = k.split('-').map(Number);",
  "  return new Date(y, m-1, d).toLocaleDateString(T.locale, { day:'numeric', month:'short' }).replace('.', '').toUpperCase();",
  "}",
  "function shortDate(k){ const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString(T.locale, { day:'numeric', month:'short' }); }",
  "",
  "// \"Hammer Strenght Select lateral raises\" -> titolo \"lateral raises\", sotto \"Hammer Strength Select\"",
  "const BRANDS = /^(hammer\\s+stren\\w*\\s+select|hammer\\s+stren\\w*|nautilus\\s+humansport|nautilus|panatta|atlantis|gymleco(?:\\s+\\d+)?|cybex\\s+og|cybex|life\\s+fitness|technogym|matrix)\\s+(.+)$/i;",
  "function splitName(name){",
  "  let title = String(name), brand = '', extra = '';",
  "  const p = title.match(/^(.*?)\\s*\\(([^)]*)\\)\\s*$/); if (p) { title = p[1]; extra = p[2]; }",
  "  const m = title.match(BRANDS); if (m) { brand = m[1].replace(/strenght/i, 'Strength'); title = m[2]; }",
  "  return { title: title, sub: [brand, extra].filter(Boolean).join(' · '), short: (brand ? brand.replace(/\\s+\\d+$/, '') + ' ' : '') + title };",
  "}",
  "",
  "async function load(date){",
  "  try {",
  "    S.data = await call('gymAppData', date || '', GYM_KEY);",
  "  } catch(e) {",
  "    $('wrap').innerHTML = '<div class=\"load err\" style=\"grid-column:1/-1\">' + T.cant + '<br>' + esc(e && e.message || e) + '</div>';",
  "    return;",
  "  }",
  "  S.date = S.data.date;",
  "  const names = S.data.days.map(d => d.name);",
  "  const pref = S.day || store.get('day') || S.data.defaultDay;",
  "  S.day = names.includes(pref) ? pref : names[0];",
  "  if (!S.unitSet) S.unit = S.data.unit || 'kg';",
  "  if (!date) S.idx = firstOpenIdx();",
  "  S.edit = null;",
  "  render();",
  "}",
  "",
  "function dayObj(){ return S.data.days.find(d => d.name === S.day) || S.data.days[0]; }",
  "function doneOf(ex){ return ((S.data.done[S.day] || {})[ex] || []); }",
  "function active(e){ return e.sets > 0 && !e.pending; }",
  "function firstOpenIdx(){",
  "  const ex = dayObj().exercises;",
  "  const i = ex.findIndex(e => active(e) && doneOf(e.name).length < e.sets);",
  "  return i < 0 ? 0 : i;",
  "}",
  "function restFor(e){ const mx = Number(e.max) || 12; return mx <= 10 ? 150 : mx <= 15 ? 120 : 90; }",
  "const toU = kg => kg == null ? '' : S.unit === 'lb' ? Math.round(kg / 0.45359237 * 2) / 2 : kg;",
  "",
  "function draftFor(e){",
  "  if (S.edit && S.edit.ex === e.name) return S.edit;",
  "  const done = doneOf(e.name);",
  "  const key = S.day + '|' + e.name;",
  "  const setNo = (done.length ? Math.max(...done.map(s => s.set)) : 0) + 1;",
  "  const d = S.draft[key];",
  "  if (d && d.set === setNo) return d;",
  "  const prev = done[done.length - 1];",
  "  const last = S.data.last[e.name];",
  "  const ls = last ? (last.sets.find(s => s.set === setNo) || last.sets[last.sets.length - 1]) : null;",
  "  const nd = { set: setNo,",
  "    kg: prev ? toU(prev.kg) : ls ? toU(ls.kg) : '',",
  "    reps: prev ? prev.reps : ls ? ls.reps : (e.min || ''),",
  "    rir: prev && prev.rir != null ? prev.rir : 0 };",
  "  S.draft[key] = nd;",
  "  return nd;",
  "}",
  "",
  "function render(){",
  "  $('dateTxt').textContent = S.date === S.data.today ? T.today.toUpperCase() + ' · ' + niceDate(S.date) : niceDate(S.date);",
  "  $('dateIn').value = S.date;",
  "  [...$('unitSeg').children].forEach(b => b.classList.toggle('on', b.dataset.u === S.unit));",
  "  $('days').innerHTML = S.data.days.map(d => {",
  "    const act = d.exercises.filter(active), tot = act.reduce((a, e) => a + e.sets, 0);",
  "    const dn = act.reduce((a, e) => a + Math.min(((S.data.done[d.name] || {})[e.name] || []).length, e.sets), 0);",
  "    return '<button class=\"day' + (d.name === S.day ? ' on' : '') + '\" data-day=\"' + esc(d.name) + '\">' + esc(d.name) +",
  "      (dn ? '<small>' + dn + '/' + tot + '</small>' : '') + '</button>';",
  "  }).join('');",
  "",
  "  const exs = dayObj().exercises;",
  "  if (S.idx >= exs.length) S.idx = 0;",
  "  const e = exs[S.idx];",
  "  const prog = x => { const n = doneOf(x.name).length; return active(x) ? Math.min(n / x.sets, 1) : 0; };",
  "  $('progBox').innerHTML = '<div class=\"prog\">' + T.exOf(S.idx + 1, exs.length) + '</div><div class=\"bar\">' +",
  "    exs.map((x, i) => '<button data-idx=\"' + i + '\" class=\"' + (i === S.idx ? 'cur' : prog(x) >= 1 ? 'full' : '') + '\" aria-label=\"' + esc(x.name) + '\"></button>').join('') + '</div>';",
  "",
  "  const list = '<aside class=\"list\">' + exs.map((x, i) => {",
  "    const n = doneOf(x.name).length, p = prog(x);",
  "    const cls = 'li' + (i === S.idx ? ' cur' : '') + (p >= 1 ? ' full' : '') + (!active(x) && !n ? ' off' : '');",
  "    const sub = !active(x) ? (x.pending ? T.listPending : T.listOff) : (n + '/' + x.sets + ' ' + T.sets + ' · ' + x.min + '–' + x.max);",
  "    return '<button class=\"' + cls + '\" data-idx=\"' + i + '\"><span class=\"n\">' + (p >= 1 ? '✓' : (i + 1)) + '</span><span class=\"t\"><b>' +",
  "      esc(x.name) + '</b><span>' + sub + '</span></span></button>';",
  "  }).join('') + '</aside>';",
  "",
  "  $('wrap').innerHTML = list + '<section>' + card(e) + navRow(exs) + '</section>';",
  "}",
  "",
  "function navRow(exs){",
  "  let h = '<div class=\"navrow\">';",
  "  if (S.idx > 0) h += '<button class=\"back\" data-go=\"-1\" aria-label=\"back\">‹</button>';",
  "  if (S.idx < exs.length - 1) {",
  "    const nx = splitName(exs[S.idx + 1].name);",
  "    h += '<button class=\"next\" data-go=\"1\"><span><span>' + T.next + '</span><b>' + esc(nx.short) + '</b></span><i>→</i></button>';",
  "  } else {",
  "    const allDone = exs.every(x => !active(x) || doneOf(x.name).length >= x.sets);",
  "    h += '<div class=\"finish\">' + (allDone ? T.finished : '') + '</div>';",
  "  }",
  "  return h + '</div>';",
  "}",
  "",
  "function card(e){",
  "  const done = doneOf(e.name), last = S.data.last[e.name], nm = splitName(e.name);",
  "  let h = '<div class=\"card\"><h1 class=\"ex\">' + esc(nm.title) + '</h1>' +",
  "          (nm.sub ? '<div class=\"sub\">' + esc(nm.sub) + '</div>' : '<div class=\"sub\"></div>') +",
  "          '<div class=\"chips\"><span>' + e.sets + ' × ' + e.min + (e.max && e.max !== e.min ? '–' + e.max : '') + ' ' + T.rep + '</span>' +",
  "          (e.rir ? '<span>RIR ' + esc(e.rir) + '</span>' : '') + (e.muscle ? '<span>' + esc(e.muscle) + '</span>' : '') + '</div>';",
  "  if (e.notes) h += '<p class=\"notes' + (S.openNotes ? ' open' : '') + '\" id=\"notes\">' + esc(e.notes) + '</p>';",
  "",
  "  if (last) {",
  "    const lastMax = Math.max(...last.sets.map(s => s.kg));",
  "    const topped = e.max && last.sets.length && last.sets.every(s => s.reps >= e.max) && !done.some(s => s.kg > lastMax);",
  "    h += '<div class=\"last\"><b>' + T.last + ' · ' + shortDate(last.date) + '</b><div class=\"lv\">' +",
  "      last.sets.map(s => '<span>' + fmtN(s.kg) + ' × ' + s.reps + (s.rir != null ? '<em>@' + s.rir + '</em>' : '') + '</span>').join('') + '</div>' +",
  "      (topped ? '<div class=\"hint\">' + T.hint + '</div>' : '') + '</div>';",
  "  }",
  "",
  "  if (e.pending) return h + '<div class=\"offnote\">' + T.pending + '</div></div>';",
  "  if (!active(e) && !done.length) h += '<div class=\"offnote\">' + T.notPlan + '</div>';",
  "",
  "  const editing = S.edit && S.edit.ex === e.name;",
  "  done.forEach(s => {",
  "    const isEd = editing && S.edit.set === s.set;",
  "    h += '<button class=\"done' + (isEd ? ' editing' : '') + '\" data-edit=\"' + s.set + '\"><span class=\"ck\">✓</span><span class=\"sn\">' + T.set + ' ' + s.set +",
  "      '</span><span class=\"sv\">' + fmtN(s.kg) + ' kg × ' + s.reps + (s.rir != null ? '<small>RIR ' + s.rir + '</small>' : '') + '</span></button>';",
  "    if (isEd) h += editor(e, S.edit, true);",
  "  });",
  "",
  "  const allDone = done.length >= e.sets;",
  "  if (!editing && (!allDone || S.extraOpen === S.day + '|' + e.name)) {",
  "    const d = draftFor(e);",
  "    h += editor(e, d, false);",
  "    for (let n = d.set + 1; n <= e.sets; n++) h += '<div class=\"todo\"><span>' + T.set + ' ' + n + '</span><span>—</span></div>';",
  "  }",
  "  if (!editing && allDone && S.extraOpen !== S.day + '|' + e.name) h += '<button class=\"extra\" id=\"extra\">' + T.extra + '</button>';",
  "  return h + '</div>';",
  "}",
  "",
  "function editor(e, d, isEdit){",
  "  return '<div class=\"ed\"><div class=\"edh\"><b>' + T.set + ' ' + d.set + (d.set > e.sets ? ' (extra)' : '') + '</b><span>' + T.target + ' ' + e.min + (e.max && e.max !== e.min ? '–' + e.max : '') + ' ' + T.rep + '</span></div>' +",
  "    '<div class=\"boxes\">' +",
  "      '<div class=\"box\"><div class=\"lbl\">' + S.unit.toUpperCase() + '</div><input id=\"inKg\" inputmode=\"decimal\" value=\"' + esc(fmtN(d.kg)) + '\" placeholder=\"0\">' +",
  "        '<div class=\"pm\"><button data-st=\"kg\" data-d=\"-1\">−</button><button data-st=\"kg\" data-d=\"1\">+</button></div></div>' +",
  "      '<div class=\"box\"><div class=\"lbl\">' + T.rep.toUpperCase() + '</div><input id=\"inReps\" inputmode=\"numeric\" value=\"' + esc(d.reps) + '\" placeholder=\"0\">' +",
  "        '<div class=\"pm\"><button data-st=\"reps\" data-d=\"-1\">−</button><button data-st=\"reps\" data-d=\"1\">+</button></div></div>' +",
  "    '</div>' +",
  "    '<div class=\"rirrow\"><span>RIR</span><div class=\"r5\">' + [0,1,2,3,4].map(n => '<button data-rir=\"' + n + '\" class=\"' + (d.rir === n ? 'on' : '') + '\">' + (n === 4 ? '4+' : n) + '</button>').join('') + '</div></div>' +",
  "    (isEdit",
  "      ? '<button class=\"save\" id=\"update\"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? T.saving : T.update) + '</button>' +",
  "        '<div class=\"edbtns\"><button class=\"del\" id=\"delSet\">' + T.del + '</button><button id=\"cancelEd\">' + T.cancel + '</button></div>'",
  "      : '<button class=\"save\" id=\"save\"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? T.saving : T.save) + '</button>') +",
  "    '</div>';",
  "}",
  "",
  "function curEx(){ return dayObj().exercises[S.idx]; }",
  "function readInputs(){",
  "  const e = curEx(); if (!e) return null;",
  "  const d = draftFor(e);",
  "  const k = $('inKg'), r = $('inReps');",
  "  if (k) d.kg = k.value.trim() === '' ? '' : (parseN(k.value) ?? k.value);",
  "  if (r) d.reps = r.value.trim() === '' ? '' : (parseN(r.value) ?? r.value);",
  "  return d;",
  "}",
  "",
  "async function save(force, isUpdate){",
  "  const e = curEx(), d = readInputs();",
  "  const kg = parseN(d.kg), reps = parseN(d.reps);",
  "  if (kg === null || reps === null) { toast(T.needs(S.unit), true); return; }",
  "  S.busy = true; render();",
  "  let r;",
  "  try {",
  "    r = await call(isUpdate ? 'gymAppUpdateSet' : 'gymAppSaveSet',",
  "      { date: S.date, day: S.day, exercise: e.name, set: d.set, kg: kg, reps: reps, rir: d.rir, unit: S.unit, force: !!force, k: GYM_KEY });",
  "  } catch(err) { r = { ok:false, msg: T.conn + (err && err.message || err) }; }",
  "  S.busy = false;",
  "  if (r.ok) {",
  "    const dn = ((S.data.done[S.day] = S.data.done[S.day] || {})[e.name] = S.data.done[S.day][e.name] || []);",
  "    const i = dn.findIndex(s => s.set === r.set.set);",
  "    if (i >= 0) dn[i] = r.set; else dn.push(r.set);",
  "    dn.sort((a, b) => a.set - b.set);",
  "    S.extraOpen = null; S.edit = null;",
  "    buzz(30);",
  "    toast(isUpdate ? T.updated(r.set.set) : T.saved(r.set.set));",
  "    if (!isUpdate) startTimer(restFor(e));",
  "    render();",
  "  } else if (r.unitWarn) {",
  "    render(); askForce(r.msg, isUpdate);",
  "  } else {",
  "    render(); toast(r.msg || T.notSaved, true);",
  "    if (r.dup) load(S.date);",
  "  }",
  "}",
  "",
  "function sheet(title, msg, noTxt, yesTxt, onYes){",
  "  $('sheetHost').innerHTML = '<div class=\"sheetBg\" id=\"sbg\"><div class=\"sheet\"><h2>' + esc(title) + '</h2><p>' + esc(msg) +",
  "    '</p><div class=\"row\"><button id=\"fNo\">' + noTxt + '</button><button class=\"p\" id=\"fYes\">' + yesTxt + '</button></div></div></div>';",
  "  const close = () => $('sheetHost').innerHTML = '';",
  "  $('fNo').onclick = close;",
  "  $('sbg').onclick = ev => { if (ev.target.id === 'sbg') close(); };",
  "  $('fYes').onclick = () => { close(); onYes(); };",
  "}",
  "function askForce(msg, isUpdate){ sheet(T.checkW, msg, T.fix, T.anyway, () => save(true, isUpdate)); }",
  "",
  "function askDelete(){",
  "  const e = curEx(), setNo = S.edit.set;",
  "  sheet(T.delQ(setNo), T.delP, T.cancel, T.del, async () => {",
  "    let r;",
  "    try { r = await call('gymAppDeleteSet', { date: S.date, day: S.day, exercise: e.name, set: setNo, k: GYM_KEY }); }",
  "    catch(err) { r = { ok:false, msg: String(err && err.message || err) }; }",
  "    if (!r.ok) { toast(r.msg, true); return; }",
  "    const dn = (S.data.done[S.day] || {})[e.name] || [];",
  "    const i = dn.findIndex(s => s.set === setNo); if (i >= 0) dn.splice(i, 1);",
  "    delete S.draft[S.day + '|' + e.name]; S.edit = null;",
  "    buzz(20); toast(T.deleted(setNo)); render();",
  "  });",
  "}",
  "",
  "/* timer */",
  "function startTimer(sec){",
  "  S.tTot = sec; S.tEnd = Date.now() + sec * 1000; S.tBuzzed = false;",
  "  $('timer').classList.remove('hide'); tick();",
  "  clearInterval(S.timer); S.timer = setInterval(tick, 250);",
  "}",
  "function tick(){",
  "  const left = Math.round((S.tEnd - Date.now()) / 1000), t = $('timer');",
  "  const a = Math.abs(left);",
  "  $('tTxt').textContent = (left < 0 ? '+' : '') + Math.floor(a / 60) + ':' + String(a % 60).padStart(2, '0');",
  "  $('tLab').textContent = left > 0 ? T.rest : T.go;",
  "  $('tPg').style.width = Math.max(0, Math.min(100, (1 - left / S.tTot) * 100)) + '%';",
  "  t.classList.toggle('zero', left <= 0);",
  "  if (left <= 0 && !S.tBuzzed) { S.tBuzzed = true; buzz([200, 100, 200]); }",
  "}",
  "$('tMinus').onclick = () => { S.tEnd -= 15000; tick(); };",
  "$('tPlus').onclick = () => { S.tEnd += 15000; S.tTot += 15; tick(); };",
  "$('tStop').onclick = () => { clearInterval(S.timer); $('timer').classList.add('hide'); };",
  "",
  "function goTo(i){ if (curEx()) readInputs(); S.idx = i; S.extraOpen = null; S.edit = null; render(); }",
  "",
  "/* eventi */",
  "document.addEventListener('click', ev => {",
  "  const b = ev.target.closest('button, #notes'); if (!b || !S.data) return;",
  "  if (b.id === 'notes') { S.openNotes = !S.openNotes; b.classList.toggle('open', S.openNotes); return; }",
  "  if (b.id === 'themeBtn' || b.closest('.timer')) return;",
  "  const e = curEx();",
  "  if (b.dataset.day) { S.day = b.dataset.day; store.set('day', S.day); S.idx = firstOpenIdx(); S.extraOpen = null; S.edit = null; render(); return; }",
  "  if (b.dataset.idx !== undefined) { goTo(Number(b.dataset.idx)); return; }",
  "  if (b.dataset.go) { goTo(S.idx + Number(b.dataset.go)); scrollTo(0, 0); return; }",
  "  if (b.dataset.u) {",
  "    if (e) readInputs();",
  "    if (b.dataset.u !== S.unit) { S.unit = b.dataset.u; S.unitSet = true; S.draft = {}; S.edit = null; render(); }",
  "    return;",
  "  }",
  "  if (b.dataset.edit) {",
  "    const n = Number(b.dataset.edit);",
  "    if (S.edit && S.edit.ex === e.name && S.edit.set === n) { S.edit = null; render(); return; }",
  "    const s = doneOf(e.name).find(x => x.set === n);",
  "    S.edit = { ex: e.name, set: n, kg: toU(s.kg), reps: s.reps, rir: s.rir == null ? 0 : s.rir };",
  "    render(); return;",
  "  }",
  "  if (b.dataset.st) {",
  "    const d = readInputs(), f = b.dataset.st, dir = Number(b.dataset.d);",
  "    const stepKg = S.unit === 'lb' ? 5 : 2.5;",
  "    const cur = parseN(d[f]) ?? 0;",
  "    d[f] = Math.max(0, Math.round((cur + dir * (f === 'kg' ? stepKg : 1)) * 100) / 100);",
  "    $(f === 'kg' ? 'inKg' : 'inReps').value = fmtN(d[f]); buzz(8); return;",
  "  }",
  "  if (b.dataset.rir !== undefined) {",
  "    const d = readInputs(); d.rir = Number(b.dataset.rir);",
  "    [...b.parentNode.children].forEach(x => x.classList.toggle('on', x === b)); buzz(8); return;",
  "  }",
  "  if (b.id === 'save') { save(false, false); return; }",
  "  if (b.id === 'update') { save(false, true); return; }",
  "  if (b.id === 'delSet') { askDelete(); return; }",
  "  if (b.id === 'cancelEd') { S.edit = null; render(); return; }",
  "  if (b.id === 'extra') { S.extraOpen = S.day + '|' + e.name; render(); return; }",
  "});",
  "$('dateIn').addEventListener('change', ev => { if (ev.target.value) { S.draft = {}; S.edit = null; $('wrap').innerHTML = '<div class=\"load\" style=\"grid-column:1/-1\"><div class=\"spin\"></div>' + T.loadingShort + '</div>'; load(ev.target.value); } });",
  "",
  "// swipe orizzontale tra esercizi (schermo chiuso)",
  "let sx = null, sy = null;",
  "document.addEventListener('touchstart', ev => { if (ev.target.closest('input,.days,.bar')) { sx = null; return; } sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });",
  "document.addEventListener('touchend', ev => {",
  "  if (sx === null || !S.data || innerWidth >= 700) return;",
  "  const dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy;",
  "  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {",
  "    const n = dayObj().exercises.length, ni = S.idx + (dx < 0 ? 1 : -1);",
  "    if (ni >= 0 && ni < n) goTo(ni);",
  "  }",
  "  sx = null;",
  "}, { passive: true });",
  "",
  "// tornando sull'app dopo un po' (telefono in tasca), ricarica le serie",
  "document.addEventListener('visibilitychange', () => { if (!document.hidden && S.data && Date.now() - (S.loadedAt || 0) > 600000) { S.loadedAt = Date.now(); load(S.date); } });",
  "",
  "S.loadedAt = Date.now();",
  "load('');",
  "try { window.top.postMessage({ gymApp: 'ready' }, '*'); } catch (e) {}   // avvisa l'app installata che la pagina è caricata",
  "</script>",
  "</body>",
  "</html>",
  ""
].join('\n');
