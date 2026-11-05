/*******************************
 * Gym Logger (Mobile) — BOMPROOF DATE GATE
 * Source: PIANO
 * Outputs: SESSIONE, STORICO
 *
 * STORICO structure = LONG format, one row per SET:
 *   Timestamp | Date | Day | Exercise | Set | Weight_kg | Reps | RIR | Target_RIR_Pattern | Notes
 *
 * UX:
 * - User MUST enter Session_Date in SESSIONE!B2
 * - Selecting Day_Code in SESSIONE!B1 loads session ONLY if date exists
 * - When date is entered, it auto-loads the selected Day_Code in B1
 * - Tick checkbox in SESSIONE!E1 -> Save to STORICO + Clear inputs + untick
 *******************************/

const CFG = {
  PLAN_SHEET: "PIANO",
  SESSION_SHEET: "SESSIONE",
  HISTORY_SHEET: "STORICO",

  // Controls (cells)
  SELECTOR_A1: "B1",            // Day_Code dropdown
  SESSION_DATE_CELL: "B2",      // user MUST fill (date)
  STATUS_CELL: "C2",            // warning message appears here (auto clears)

  // Header/data layout
  SESSION_HEADER_ROW: 3,
  SESSION_FIRST_DATA_ROW: 4,

  // Save checkbox
  SAVE_LABEL_CELL: "D1",
  SAVE_CHECK_CELL: "E1",

  // Gate behavior
  REQUIRE_DATE_BEFORE_LOAD: true,
  REQUIRE_DATE_BEFORE_SAVE: true,

  MAX_SETS: 4,

  // PIANO headers
  PLAN_REQUIRED_HEADERS: [
    "Day_Code","Day_Name","Order","Exercise","Target_Muscle","Sets",
    "Target_Reps","Target_RIR","Notes"
  ],

  PLAN_OPTIONAL_HEADERS: [],
};

// STORICO canonical structure (LONG format, one row per set)
const STORICO_HEADERS = [
  "Timestamp",
  "Date",
  "Day",
  "Exercise",
  "Set",
  "Weight_kg",
  "Reps",
  "RIR",
  "Target_RIR_Pattern",
  "Notes"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Gym")
    .addItem("Setup / Update (safe)", "setupGymSheets")
    .addSeparator()
    .addItem("Save SESSIONE → STORICO", "saveSessionToStorico")
    .addItem("Clear SESSIONE inputs", "clearSessionInputs")
    .addSeparator()
    .addItem("Refresh Day_Code dropdown", "refreshDayCodeDropdown")
    .addItem("Archive old STORICO (fresh structure)", "archiveOldStorico")
    .addToUi();
}

/**
 * BOMPROOF:
 * - If edit B1 (Day_Code) and date missing -> DO NOT LOAD, show warning
 * - If edit B2 (date) and now valid -> clear warning + auto-load current B1
 * - If tick E1 -> save (only if date valid), else warning and untick
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== CFG.SESSION_SHEET) return;

    const a1 = e.range.getA1Notation();

    // 1) Day_Code changed
    if (a1 === CFG.SELECTOR_A1) {
      const dayCode = String(e.range.getValue() || "").trim();
      if (!dayCode) return;

      if (CFG.REQUIRE_DATE_BEFORE_LOAD) {
        const ds = getManualSessionDateStr_(sh, true);
        if (!ds) {
          clearSessionData_(sh); // no old junk
          return;
        }
      }

      clearDateWarning_(sh);
      loadDayCodeToSession_(dayCode);
      return;
    }

    // 2) Date changed
    if (a1 === CFG.SESSION_DATE_CELL) {
      const ds = getManualSessionDateStr_(sh, true);
      if (!ds) {
        clearSessionData_(sh);
        return;
      }

      clearDateWarning_(sh);
      stampSessionDateIntoSessionRows_(sh, ds);

      const dayCode = String(sh.getRange(CFG.SELECTOR_A1).getValue() || "").trim();
      if (dayCode) loadDayCodeToSession_(dayCode);
      return;
    }

    // 3) Save checkbox ticked
    if (a1 === CFG.SAVE_CHECK_CELL) {
      const v = e.range.getValue();
      if (v !== true) return;

      if (CFG.REQUIRE_DATE_BEFORE_SAVE) {
        const ds = getManualSessionDateStr_(sh, true);
        if (!ds) {
          e.range.setValue(false);
          return;
        }
      }

      saveSessionToStorico_(true); // silent toast
      e.range.setValue(false);     // untick
      return;
    }

  } catch (err) {
    console.error(err);
  }
}

/**
 * SAFE setup: creates sheets if missing, sets dropdown + checkbox + date validation.
 * Does NOT wipe STORICO.
 */
function setupGymSheets() {
  const ss = SpreadsheetApp.getActive();
  const plan = ss.getSheetByName(CFG.PLAN_SHEET);
  if (!plan) throw new Error(`Missing sheet: ${CFG.PLAN_SHEET}`);

  const session = getOrCreateSheet_(ss, CFG.SESSION_SHEET);
  const history = getOrCreateSheet_(ss, CFG.HISTORY_SHEET);

  // B1 label (A1)
  const selectorCell = session.getRange(CFG.SELECTOR_A1);
  const labelCell = selectorCell.offset(0, -1);
  if (!String(labelCell.getValue() || "").trim()) {
    labelCell.setValue("Day_Code:").setFontWeight("bold");
  }

  // Date label (A2) + B2 validation
  const dateCell = session.getRange(CFG.SESSION_DATE_CELL);
  const dateLabel = dateCell.offset(0, -1);
  dateLabel.setValue("Session_Date:").setFontWeight("bold");
  dateCell.setNumberFormat("yyyy-mm-dd");
  dateCell.setNote("Insert date manually (required). Format: dd-mm-yyyy");
  const dateRule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();
  dateCell.setDataValidation(dateRule);

  // Status cell (C2)
  session.getRange(CFG.STATUS_CELL).setValue("").setFontWeight("bold");

  // Save checkbox label + checkbox
  session.getRange(CFG.SAVE_LABEL_CELL).setValue("Save + Clear").setFontWeight("bold");
  session.getRange(CFG.SAVE_CHECK_CELL).insertCheckboxes();
  session.getRange(CFG.SAVE_CHECK_CELL).setValue(false);

  // Dropdown Day_Code
  rebuildDayCodeDropdown_(plan, session);

  // Ensure STORICO headers (long structure)
  ensureHistoryHeaders_(history);

  // Freeze rows
  if (session.getLastRow() >= CFG.SESSION_HEADER_ROW) session.setFrozenRows(CFG.SESSION_HEADER_ROW);
  history.setFrozenRows(1);

  ss.toast("Setup ✅ 1) Insert Session_Date in B2  2) Select Day_Code in B1  3) Tick E1 to Save+Clear");
}

function refreshDayCodeDropdown() {
  const ss = SpreadsheetApp.getActive();
  const plan = ss.getSheetByName(CFG.PLAN_SHEET);
  const session = ss.getSheetByName(CFG.SESSION_SHEET);
  if (!plan || !session) throw new Error("Missing PIANO or SESSIONE.");
  rebuildDayCodeDropdown_(plan, session);
  ss.toast("Dropdown refreshed ✅");
}

/**
 * LOAD day -> writes into SESSIONE using current SESSIONE headers (header-driven).
 */
function loadDayCodeToSession_(dayCode) {
  const ss = SpreadsheetApp.getActive();
  const plan = ss.getSheetByName(CFG.PLAN_SHEET);
  const session = ss.getSheetByName(CFG.SESSION_SHEET);
  if (!plan || !session) throw new Error("Missing PIANO or SESSIONE.");

  const planRows = readPlanRows_(plan);
  const rowsForDay = planRows
    .filter(r => String(r.Day_Code).trim() === String(dayCode).trim())
    .sort((a,b) => Number(a.Order) - Number(b.Order));

  if (!rowsForDay.length) return;

  clearSessionData_(session);

  const headers = getSessionHeaders_(session);
  const h = headerMap_(headers);

  const dateStr = getManualSessionDateStr_(session, false) || "";

  const out = rowsForDay.map(r => {
    const row = new Array(headers.length).fill("");

    setIf_(row, h, "Session_Date", dateStr);

    setIf_(row, h, "Day_Code", r.Day_Code);
    setIf_(row, h, "Day_Name", r.Day_Name);
    setIf_(row, h, "Order", r.Order);
    setIf_(row, h, "Exercise", r.Exercise);
    setIf_(row, h, "Target_Muscle", r.Target_Muscle);
    setIf_(row, h, "Sets", r.Sets);
    setIf_(row, h, "Target_Reps", r.Target_Reps);
    setIf_(row, h, "Target_RIR", r.Target_RIR);
    setIf_(row, h, "Notes", r.Notes);

    for (let i = 1; i <= CFG.MAX_SETS; i++) {
      setIf_(row, h, `S${i}_kg`, "");
      setIf_(row, h, `S${i}_reps`, "");
      setIf_(row, h, `S${i}_RIR`, "");
    }

    setIf_(row, h, "Session_Notes", "");

    return row;
  });

  session.getRange(CFG.SESSION_FIRST_DATA_ROW, 1, out.length, headers.length).setValues(out);

  applyValidations_(session);
}

/**
 * Public menu action
 */
function saveSessionToStorico() {
  saveSessionToStorico_(false);
}

/**
 * Saves SESSIONE -> STORICO in LONG format (one row per set).
 * silent=true -> toast
 */
function saveSessionToStorico_(silent) {
  const ss = SpreadsheetApp.getActive();
  const session = ss.getSheetByName(CFG.SESSION_SHEET);
  const history = ss.getSheetByName(CFG.HISTORY_SHEET);
  const plan = ss.getSheetByName(CFG.PLAN_SHEET);
  if (!session || !history || !plan) throw new Error("Missing SESSIONE / STORICO / PIANO.");

  // Gate
  const manualDate = getManualSessionDateStr_(session, true); // yyyy-MM-dd
  if (!manualDate) return;

  ensureHistoryHeaders_(history);

  const sessionHeaders = getSessionHeaders_(session);
  const historyHeaders = history.getRange(1,1,1,history.getLastColumn())
    .getValues()[0].map(v => String(v || "").trim());

  const lastRow = session.getLastRow();
  if (lastRow < CFG.SESSION_FIRST_DATA_ROW) {
    if (!silent) SpreadsheetApp.getUi().alert("SESSIONE is empty.");
    else ss.toast("SESSIONE is empty.");
    return;
  }

  const data = session.getRange(
    CFG.SESSION_FIRST_DATA_ROW,
    1,
    lastRow - (CFG.SESSION_FIRST_DATA_ROW - 1),
    sessionHeaders.length
  ).getValues();

  const hSession = headerMap_(sessionHeaders);
  const exIdx = hSession["Exercise"];
  if (exIdx == null) throw new Error('SESSIONE missing header "Exercise".');

  const exerciseRows = data.filter(r => String(r[exIdx] || "").trim() !== "");
  if (!exerciseRows.length) {
    if (!silent) SpreadsheetApp.getUi().alert("No rows found to save.");
    else ss.toast("No rows found to save.");
    return;
  }

  const tz = Session.getScriptTimeZone();
  const stampDate = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
  const sessionDate = Utilities.formatDate(new Date(manualDate + "T00:00:00"), tz, "dd/MM/yyyy");

  const dayCode = String(session.getRange(CFG.SELECTOR_A1).getValue() || "").trim();
  const meta = getPlanMetaForDay_(plan, dayCode);
  const dayLabel = meta.Day_Name || dayCode || "";

  // No duplicates: a set already in STORICO (same Date + Day + Exercise + Set) is never written again.
  // This also covers sets saved from the Gym app.
  const existingKeys = readHistoryKeys_(history, historyHeaders, tz);
  let skipped = 0;

  // Explode each exercise into one row per logged set
  const out = [];
  exerciseRows.forEach(r => {
    const rowMap = {};
    sessionHeaders.forEach((name, i) => { rowMap[name] = r[i]; });

    const exercise = String(rowMap["Exercise"] || "").trim();
    const notes    = (rowMap["Notes"] != null) ? rowMap["Notes"] : "";
    const pattern  = (rowMap["Target_RIR"] != null) ? rowMap["Target_RIR"] : "";

    for (let n = 1; n <= CFG.MAX_SETS; n++) {
      const kg   = rowMap[`S${n}_kg`];
      const reps = rowMap[`S${n}_reps`];
      const rir  = rowMap[`S${n}_RIR`];

      const hasData =
        (kg   != null && kg   !== "") ||
        (reps != null && reps !== "") ||
        (rir  != null && rir  !== "");
      if (!hasData) continue;

      const key = [sessionDate, String(dayLabel).trim(), exercise, n].join("|");
      if (existingKeys[key]) { skipped++; continue; }
      existingKeys[key] = true;

      const record = {
        "Timestamp":          stampDate,
        "Date":               sessionDate,
        "Day":                dayLabel,
        "Exercise":           exercise,
        "Set":                n,
        "Weight_kg":          (kg   == null ? "" : kg),
        "Reps":               (reps == null ? "" : reps),
        "RIR":                (rir  == null ? "" : rir),
        "Target_RIR_Pattern": pattern,
        "Notes":              notes
      };

      const outRow = new Array(historyHeaders.length).fill("");
      historyHeaders.forEach((name, i) => {
        if (record[name] != null) outRow[i] = record[name];
      });
      out.push(outRow);
    }
  });

  if (!out.length) {
    const msg = skipped
      ? "All " + skipped + " sets were already in STORICO: nothing new saved."
      : "No set data found to save.";
    if (skipped) clearSessionInputs();   // already saved: safe to clear
    if (!silent) SpreadsheetApp.getUi().alert(msg);
    else ss.toast(msg);
    return;
  }

  history.getRange(history.getLastRow() + 1, 1, out.length, historyHeaders.length).setValues(out);

  clearSessionInputs();

  const skipMsg = skipped ? " (" + skipped + " already in STORICO, skipped)" : "";
  if (silent) ss.toast("Saved " + out.length + " set-rows ✅" + skipMsg);
  else SpreadsheetApp.getUi().alert("Saved " + out.length + " set-rows to STORICO ✅" + skipMsg);
}

/**
 * Keys of the sets already in STORICO: "dd/MM/yyyy|Day|Exercise|Set" -> true.
 */
function readHistoryKeys_(history, headers, tz) {
  const keys = {};
  const last = history.getLastRow();
  if (last < 2) return keys;
  const h = headerMap_(headers);
  const vals = history.getRange(2, 1, last - 1, headers.length).getValues();
  vals.forEach(r => {
    const d = r[h["Date"]];
    const ds = (Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d.getTime()))
      ? Utilities.formatDate(d, tz, "dd/MM/yyyy")
      : String(d || "").trim();
    const key = [ds, String(r[h["Day"]] || "").trim(), String(r[h["Exercise"]] || "").trim(), Number(r[h["Set"]])].join("|");
    keys[key] = true;
  });
  return keys;
}

function clearSessionInputs() {
  const ss = SpreadsheetApp.getActive();
  const session = ss.getSheetByName(CFG.SESSION_SHEET);
  if (!session) throw new Error("Missing SESSIONE.");

  const headers = getSessionHeaders_(session);
  const colsToClear = [];

  headers.forEach((name, i) => {
    const h = String(name).trim();
    const isSetInput = /^S\d+_(kg|reps|RIR)$/.test(h);
    const isNotes    = h === "Session_Notes";
    if (isSetInput || isNotes) colsToClear.push(i + 1);
  });

  const lastRow = session.getLastRow();
  if (lastRow < CFG.SESSION_FIRST_DATA_ROW) return;

  colsToClear.forEach(col => {
    session.getRange(CFG.SESSION_FIRST_DATA_ROW, col, lastRow - (CFG.SESSION_FIRST_DATA_ROW - 1), 1).clearContent();
  });
}

/* ---------------- DATE GATE UX ---------------- */

function showMissingDate_(sessionSheet) {
  const msg = "inserisci la data AMORE MIOOOO♥";
  sessionSheet.getRange(CFG.STATUS_CELL)
    .setValue(msg)
    .setFontWeight("bold");
  SpreadsheetApp.getActive().toast(msg);
}

function clearDateWarning_(sessionSheet) {
  sessionSheet.getRange(CFG.STATUS_CELL).clearContent();
}

/**
 * Returns yyyy-MM-dd (string) or "" if missing/invalid.
 * warn=true => showMissingDate_()
 */
function getManualSessionDateStr_(sessionSheet, warn) {
  const v = sessionSheet.getRange(CFG.SESSION_DATE_CELL).getValue();
  if (!v) {
    if (warn) showMissingDate_(sessionSheet);
    return "";
  }

  let d = null;
  const isDateObj = Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime());
  if (isDateObj) d = v;
  else {
    const tryD = new Date(v);
    if (!isNaN(tryD.getTime())) d = tryD;
  }

  if (!d) {
    if (warn) showMissingDate_(sessionSheet);
    return "";
  }

  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, "yyyy-MM-dd");
}

function stampSessionDateIntoSessionRows_(sessionSheet, dateStr) {
  const headers = getSessionHeaders_(sessionSheet);
  const h = headerMap_(headers);
  const colIdx = h["Session_Date"];
  if (colIdx == null) return;

  const lastRow = sessionSheet.getLastRow();
  if (lastRow < CFG.SESSION_FIRST_DATA_ROW) return;

  const exIdx = h["Exercise"];
  if (exIdx == null) return;

  const numRows = lastRow - (CFG.SESSION_FIRST_DATA_ROW - 1);
  const vals = sessionSheet.getRange(CFG.SESSION_FIRST_DATA_ROW, 1, numRows, headers.length).getValues();

  const out = vals.map(r => {
    if (String(r[exIdx] || "").trim() !== "") r[colIdx] = dateStr;
    return r;
  });

  sessionSheet.getRange(CFG.SESSION_FIRST_DATA_ROW, 1, numRows, headers.length).setValues(out);
}

/* ---------------- STORICO headers (LONG structure) ---------------- */

function getCanonicalHistoryHeaders_() {
  return STORICO_HEADERS.slice();
}

/**
 * Ensures STORICO has the LONG-format header row.
 * - Empty header -> writes canonical.
 * - Already canonical -> no-op.
 * - Header present but no data -> overwrites safely.
 * - Header differs AND has data -> throws (protects old wide-format data).
 */
function ensureHistoryHeaders_(historySheet) {
  const canonical = getCanonicalHistoryHeaders_();

  const lastCol = Math.max(historySheet.getLastColumn(), 1);
  const existing = historySheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
  const isEmptyHeader = existing.every(v => v === "");

  if (isEmptyHeader) {
    historySheet.getRange(1, 1, 1, canonical.length).setValues([canonical]).setFontWeight("bold");
    return;
  }

  const existingNonEmpty = existing.filter(Boolean);
  const matches = existingNonEmpty.length === canonical.length &&
                  canonical.every((h, i) => existing[i] === h);
  if (matches) return;

  const hasData = historySheet.getLastRow() > 1;
  if (!hasData) {
    historySheet.getRange(1, 1, 1, existing.length).clearContent();
    historySheet.getRange(1, 1, 1, canonical.length).setValues([canonical]).setFontWeight("bold");
    return;
  }

  throw new Error(
    'STORICO ha una struttura diversa (vecchio formato). ' +
    'Esegui "Gym → Archive old STORICO (fresh structure)" per creare una tabella pulita con la nuova struttura.'
  );
}

/**
 * Non-destructive: renames current STORICO to STORICO_ARCHIVE_<timestamp>
 * and creates a fresh STORICO with the LONG-format headers.
 */
function archiveOldStorico() {
  const ss = SpreadsheetApp.getActive();
  const tz = Session.getScriptTimeZone();
  const stamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmm");

  const old = ss.getSheetByName(CFG.HISTORY_SHEET);
  if (old) old.setName(`${CFG.HISTORY_SHEET}_ARCHIVE_${stamp}`);

  const fresh = ss.insertSheet(CFG.HISTORY_SHEET);
  ensureHistoryHeaders_(fresh);
  fresh.setFrozenRows(1);

  ss.toast("Old STORICO archived ✅ Fresh STORICO created with new structure.");
}

/* ---------------- PIANO helpers ---------------- */

function readPlanRows_(planSheet) {
  const values = planSheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const idx = {};

  CFG.PLAN_REQUIRED_HEADERS.forEach(h => {
    const i = headers.indexOf(h);
    if (i === -1) throw new Error(`PIANO missing required header: ${h}`);
    idx[h] = i;
  });

  CFG.PLAN_OPTIONAL_HEADERS.forEach(h => {
    const i = headers.indexOf(h);
    if (i !== -1) idx[h] = i;
  });

  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.join("").trim() === "") continue;

    const obj = {};
    CFG.PLAN_REQUIRED_HEADERS.forEach(h => obj[h] = row[idx[h]]);
    CFG.PLAN_OPTIONAL_HEADERS.forEach(h => obj[h] = (idx[h] != null ? row[idx[h]] : ""));
    out.push(obj);
  }
  return out;
}

function getPlanMetaForDay_(planSheet, dayCode) {
  const rows = readPlanRows_(planSheet).filter(r => String(r.Day_Code).trim() === String(dayCode).trim());
  if (!rows.length) return {};

  const r0 = rows.sort((a,b) => Number(a.Order) - Number(b.Order))[0];
  return {
    Day_Code: String(dayCode).trim(),
    Day_Name: r0.Day_Name || ""
  };
}

function rebuildDayCodeDropdown_(planSheet, sessionSheet) {
  const planRows = readPlanRows_(planSheet);
  const codes = [...new Set(planRows.map(r => String(r.Day_Code).trim()).filter(Boolean))].sort();

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(codes, true)
    .setAllowInvalid(false)
    .build();

  const cell = sessionSheet.getRange(CFG.SELECTOR_A1);
  cell.setDataValidation(rule);
  if (!cell.getValue() && codes.length) cell.setValue(codes[0]);
}

/* ---------------- Validations ---------------- */

function applyValidations_(sheet) {
  const headers = getSessionHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < CFG.SESSION_FIRST_DATA_ROW) return;

  const numRows = lastRow - (CFG.SESSION_FIRST_DATA_ROW - 1);

  const rirRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 5)
    .setAllowInvalid(true)
    .build();

  headers.forEach((h, i) => {
    if (/^S\d+_RIR$/.test(String(h))) {
      sheet.getRange(CFG.SESSION_FIRST_DATA_ROW, i + 1, numRows, 1).setDataValidation(rirRule);
    }
  });
}

/* ---------------- Generic helpers ---------------- */

function getSessionHeaders_(sessionSheet) {
  const lastCol = sessionSheet.getLastColumn();
  if (lastCol < 1) throw new Error("SESSIONE has no columns.");
  const headers = sessionSheet.getRange(CFG.SESSION_HEADER_ROW, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
  if (headers.every(h => h === "")) throw new Error("SESSIONE header row is empty.");
  return headers;
}

function clearSessionData_(sheet) {
  const lr = sheet.getLastRow();
  if (lr >= CFG.SESSION_FIRST_DATA_ROW) {
    sheet.getRange(
      CFG.SESSION_FIRST_DATA_ROW,
      1,
      lr - (CFG.SESSION_FIRST_DATA_ROW - 1),
      sheet.getLastColumn()
    ).clearContent();
  }
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function headerMap_(headers) {
  const map = {};
  headers.forEach((h, i) => map[String(h).trim()] = i);
  return map;
}

function setIf_(rowArr, hMap, key, value) {
  if (hMap[key] == null) return;
  rowArr[hMap[key]] = value;
}
