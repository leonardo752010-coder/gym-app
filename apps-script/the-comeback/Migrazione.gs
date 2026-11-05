/*******************************
 * MIGRATION — STORICO wide → long
 *
 * Converts an OLD wide-format STORICO (one row per exercise, S1_kg..S4_RIR)
 * into the LONG format (one row per SET):
 *   Timestamp | Date | Day | Exercise | Set | Weight_kg | Reps | RIR | Target_RIR_Pattern | Notes
 *
 * Includes data cleanup:
 * - Target_RIR values coerced by Sheets into dates (e.g. "3-4" -> 2026-04-03)
 *   are reversed back to "d-m" pattern strings.
 * - Weight/Reps/RIR cells that are date/time objects (corrupted) -> blanked.
 * - Unit typos in numeric cells ("0Kg", "10reps", "3RIR", "3,75") -> numbers.
 *
 * HOW TO RUN (one-shot):
 *  1) First run "Archive old STORICO (fresh structure)" in the main script,
 *     so the old data lives in STORICO_ARCHIVE_<stamp> and a fresh empty
 *     STORICO exists.
 *  2) Then run this function once: open the Apps Script editor, select
 *     `migrateWideStoricoToLong` and press Run ▶ (a prompt will confirm the
 *     source sheet). Or add the menu line shown at the bottom to your onOpen.
 *******************************/

const MIG = {
  TARGET_SHEET: "STORICO",
  MAX_SETS: 4,
  HEADERS: [
    "Timestamp","Date","Day","Exercise","Set",
    "Weight_kg","Reps","RIR","Target_RIR_Pattern","Notes"
  ],
  // Source column names in the old wide STORICO
  SRC: {
    TIMESTAMP: "Timestamp",
    DATE:      "Session_Date",
    DAY_NAME:  "Day_Name",
    DAY_CODE:  "Day_Code",
    EXERCISE:  "Exercise",
    NOTES:     "Notes",
    PATTERN:   "Target_RIR"
  }
};

function migrateWideStoricoToLong() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();

  const source = pickSourceSheet_(ss, ui);
  if (!source) return;

  const target = ss.getSheetByName(MIG.TARGET_SHEET) || ss.insertSheet(MIG.TARGET_SHEET);
  ensureLongHeaders_(target);

  const wideRows = readWideRows_(source);
  if (!wideRows.length) { ui.alert(`Source "${source.getName()}" has no data rows.`); return; }

  const out = convertWideToLong_(wideRows);
  if (!out.length) { ui.alert("No set data found to migrate."); return; }

  const startRow = target.getLastRow() + 1;
  target.getRange(startRow, 1, out.length, MIG.HEADERS.length).setValues(out);

  ui.alert(
    `Migrated ${out.length} set-rows\n` +
    `from "${source.getName()}"\n` +
    `into "${target.getName()}" ✅`
  );
}

/* ---------------- source selection ---------------- */

function pickSourceSheet_(ss, ui) {
  const archives = ss.getSheets()
    .map(s => s.getName())
    .filter(n => /^STORICO_ARCHIVE_/.test(n))
    .sort(); // yyyyMMdd_HHmm sorts chronologically; last = most recent

  const defaultName = archives.length ? archives[archives.length - 1] : "";

  const resp = ui.prompt(
    "Migrate wide STORICO → long",
    "Enter the SOURCE sheet name (old wide-format STORICO)." +
      (defaultName ? `\n\nDetected: ${defaultName}\n(leave blank to use it)` : ""),
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return null;

  const name = (resp.getResponseText() || "").trim() || defaultName;
  if (!name) { ui.alert("No source sheet specified."); return null; }

  const sh = ss.getSheetByName(name);
  if (!sh) { ui.alert(`Sheet "${name}" not found.`); return null; }
  if (sh.getName() === MIG.TARGET_SHEET) {
    ui.alert("Source and target are the same sheet. Archive the old STORICO first.");
    return null;
  }
  return sh;
}

/* ---------------- target header guard ---------------- */

function ensureLongHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
  const isEmpty = existing.every(v => v === "");

  if (isEmpty) {
    sheet.getRange(1, 1, 1, MIG.HEADERS.length).setValues([MIG.HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return;
  }

  const nonEmpty = existing.filter(Boolean);
  const matches = nonEmpty.length === MIG.HEADERS.length &&
                  MIG.HEADERS.every((h, i) => existing[i] === h);
  if (matches) return;

  const hasData = sheet.getLastRow() > 1;
  if (!hasData) {
    sheet.getRange(1, 1, 1, existing.length).clearContent();
    sheet.getRange(1, 1, 1, MIG.HEADERS.length).setValues([MIG.HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return;
  }

  throw new Error(
    `Target "${MIG.TARGET_SHEET}" already has a different structure with data. ` +
    `Run "Archive old STORICO (fresh structure)" first so a clean STORICO exists.`
  );
}

/* ---------------- read + convert ---------------- */

function readWideRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(v => String(v || "").trim());
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.join("").trim() === "") continue;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    out.push(obj);
  }
  return out;
}

function convertWideToLong_(wideRows) {
  const tz = Session.getScriptTimeZone();
  const recs = [];
  let seq = 0;

  wideRows.forEach(o => {
    const exercise = String(o[MIG.SRC.EXERCISE] || "").trim();
    if (!exercise) return;

    const dateObj = toDateObj_(o[MIG.SRC.DATE]);
    const dateStr = dateObj ? Utilities.formatDate(dateObj, tz, "dd/MM/yyyy") : String(o[MIG.SRC.DATE] || "");

    const tsObj = toDateObj_(o[MIG.SRC.TIMESTAMP]);
    const tsStr = tsObj ? Utilities.formatDate(tsObj, tz, "dd/MM/yyyy") : String(o[MIG.SRC.TIMESTAMP] || "");

    const day = String(o[MIG.SRC.DAY_NAME] || o[MIG.SRC.DAY_CODE] || "").trim();
    const notes = (o[MIG.SRC.NOTES] != null) ? o[MIG.SRC.NOTES] : "";
    const pattern = normPattern_(o[MIG.SRC.PATTERN], tz);

    for (let n = 1; n <= MIG.MAX_SETS; n++) {
      const kg   = o[`S${n}_kg`];
      const reps = o[`S${n}_reps`];
      const rir  = o[`S${n}_RIR`];

      if (!(notEmpty_(kg) || notEmpty_(reps) || notEmpty_(rir))) continue;

      recs.push({
        sortKey: dateObj ? dateObj.getTime() : 0,
        seq: seq++,
        row: {
          "Timestamp":          tsStr,
          "Date":               dateStr,
          "Day":                day,
          "Exercise":           exercise,
          "Set":                n,
          "Weight_kg":          normSet_(kg),
          "Reps":               normSet_(reps),
          "RIR":                normSet_(rir),
          "Target_RIR_Pattern": pattern,
          "Notes":              notes
        }
      });
    }
  });

  // chronological, stable within same date (preserves session/exercise/set order)
  recs.sort((a, b) => (a.sortKey - b.sortKey) || (a.seq - b.seq));

  return recs.map(rec => MIG.HEADERS.map(h => (rec.row[h] != null ? rec.row[h] : "")));
}

/* ---------------- cleanup helpers ---------------- */

function toDateObj_(v) {
  if (v == null || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function notEmpty_(v) {
  return v != null && String(v).trim() !== "";
}

/**
 * Numeric set cell cleanup.
 * - date/time object -> "" (corrupted)
 * - "3,75" -> 3.75
 * - "0Kg" / "10reps" / "3RIR" -> 0 / 10 / 3
 * - clean numbers pass through; anything else kept as-is
 */
function normSet_(v) {
  if (v == null || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]") return "";
  if (typeof v === "number") return v;

  let s = String(v).trim();
  if (s === "") return "";
  s = s.replace(",", ".");
  s = s.replace(/\s*(kg|reps?|rir|x)\s*$/i, "").trim();

  if (/^\d+(\.\d*)?$/.test(s)) return parseFloat(s);
  return v; // leave unusual values untouched
}

/**
 * Target_RIR_Pattern cleanup.
 * A pattern like "3-4" is often coerced by Sheets into a Date (dd-mm).
 * Reverse it: 2026-04-03 -> "3-4".
 */
function normPattern_(v, tz) {
  if (v == null) return "";
  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
    return `${v.getDate()}-${v.getMonth() + 1}`;
  }
  return v;
}

/*
 * OPTIONAL menu integration — add this line inside your existing onOpen(),
 * after the other addItem calls (do NOT create a second onOpen):
 *
 *   .addItem("Migrate wide STORICO → long", "migrateWideStoricoToLong")
 */
