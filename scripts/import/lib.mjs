// =====================================================================
// Import dai fogli Google (passo 3): funzioni comuni.
// Legge un file .xlsx scaricato dal foglio (schede PIANO e STORICO),
// controlla i dati, li collega a esercizi e macchine (file "collegamenti")
// e prepara l'SQL da eseguire con la CLI di Supabase.
// Nessun dato vero in questo file: i dati veri restano fuori dal repository.
// =====================================================================
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_REF = 'kclgcqwmvqqkogkhycgb';            // gym-app: l'unico progetto online ammesso
export const CARTELLA_IMPORT = path.join(os.homedir(), 'Documents', 'gym-app-import');
export const FUSO = 'Pacific/Auckland';                      // fuso dei fogli e dello script Apps Script
export const TETTO_GIORNI = 92;                               // tetto: al massimo 3 mesi di storico per import
const LB_TO_KG = 0.45359237;
const NS = '6f1c2a5e-3b7d-5c48-9a0e-2d4f6b8c1e37';            // spazio dei nomi fisso per gli ID (UUID v5)

export const MUSCOLI = ['chest', 'lats', 'upper-back', 'traps', 'front-delts', 'side-delts', 'rear-delts', 'biceps',
  'triceps', 'forearms', 'abs', 'obliques', 'lower-back', 'glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves'];
export const ATTREZZI = ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight', 'kettlebell', 'band', 'other'];
export const TIPI_MACCHINA = ['selectorized', 'plate-loaded', 'cable', 'smith', 'free-weight', 'bodyweight', 'other'];
export const STATI = ['da controllare', 'da decidere', 'ok', 'ignora'];

// ---------------------------------------------------------------------
// Piccole utilità
// ---------------------------------------------------------------------

/** UUID v5 (SHA-1): stesso testo -> stesso ID. Così rilanciare l'import non crea doppioni. */
export function uuidv5(name) {
  const h = crypto.createHash('sha1').update(Buffer.concat([Buffer.from(NS.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf8')])).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Nome pulito: spazi doppi e spazi ai bordi tolti. */
export const pulisci = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Codice: minuscole, senza accenti, parole separate da "-". */
export function codice(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}
export const eCodice = (s) => typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 80;

const vuoto = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const dataKey = (d) => d.toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');

/** Data 'aaaa-mm-gg' valida? */
export function eData(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && dataKey(d) === s;
}
export const giorniTra = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Il percorso è dentro il repository (ma non in tests/out, che git ignora)? */
export function dentroRepo(p) {
  const rel = path.relative(REPO, path.resolve(p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return !rel.split(path.sep).slice(0, 2).join('/').startsWith('tests/out');
}

// ---------------------------------------------------------------------
// Lettura del file .xlsx
// ---------------------------------------------------------------------

// Valore di una cella di exceljs: formule -> risultato, testo ricco -> testo, errori -> { errore }.
function valore(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return valore(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return { errore: v.error };
    return null;
  }
  return v;
}

/** Legge le schede richieste: { NOME: { intestazione: [...], righe: [{ riga, celle: {nome: valore} }] } } */
export async function leggiFile(file, schede) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out = {};
  for (const nome of schede) {
    const ws = wb.getWorksheet(nome);
    if (!ws) throw new Error(`Nel file non c'è la scheda ${nome}.`);
    const intest = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { intest[col] = pulisci(valore(c.value)); });
    const righe = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const celle = {};
      intest.forEach((h, col) => { if (h) celle[h.toLowerCase()] = valore(row.getCell(col).value); });
      righe.push({ riga: n, celle });
    });
    out[nome] = { intestazione: intest.filter(Boolean), righe };
  }
  return out;
}

/** Controlla che il file sia il foglio GYM (l'unico che si importa); rifiuta il foglio THE COMEBACK. */
export function controllaFormato(dati, formato) {
  const h = (scheda) => (dati[scheda]?.intestazione || []).map((x) => x.toLowerCase());
  const piano = h('PIANO');
  const base = ['day_code', 'day_name', 'order', 'exercise', 'target_muscle', 'sets', 'target_rir', 'notes'];
  const manca = base.filter((c) => !piano.includes(c));
  if (manca.length) throw new Error(`PIANO: mancano le colonne ${manca.join(', ')}.`);
  if (formato !== 'gym') throw new Error('Formato sconosciuto: si importa solo il foglio GYM (--formato gym).');
  if (piano.includes('target_reps')) throw new Error('Questo sembra il foglio THE COMEBACK (di Raina): non si importa. Formato sbagliato?');
  if (!piano.includes('reps_min') || !piano.includes('reps_max')) throw new Error('Il file non sembra il foglio GYM (PIANO senza Reps_Min/Reps_Max). Formato sbagliato?');
  if (dati.STORICO) {
    const st = h('STORICO');
    const serve = ['timestamp', 'date', 'day', 'exercise', 'set', 'weight_kg', 'reps', 'rir', 'target_rir_pattern', 'notes', 'personal notes', 'input_weight', 'input_unit'];
    const m = serve.filter((c) => !st.includes(c));
    if (m.length) throw new Error(`STORICO: mancano le colonne ${m.join(', ')} (il foglio GYM ne ha 13). Formato sbagliato?`);
  }
}

// ---------------------------------------------------------------------
// Numeri e date dentro le celle
// ---------------------------------------------------------------------

// Numero da una cella. Ritorna { n, corretto } oppure { errore }.
// Accetta "42,5", "60kg", "10reps", "3RIR" (corretto = true). Una data al posto di un numero è un errore.
export function numero(v, { unitaPeso = false } = {}) {
  if (vuoto(v)) return { n: null };
  if (typeof v === 'number') return isFinite(v) ? { n: v } : { errore: 'numero non valido' };
  if (v instanceof Date) return { errore: 'la cella è diventata una data' };
  if (typeof v === 'object') return { errore: 'errore nella cella' };
  let s = String(v).trim().toLowerCase();
  if (unitaPeso && /lbs?$/.test(s)) return { errore: 'peso scritto in lb nella colonna dei kg' };
  s = s.replace(/\s*(kgs?|reps?|rir|x)\s*$/, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { errore: `"${String(v).slice(0, 20)}" non è un numero` };
  return { n: Number(s), corretto: true };
}

// Tutti i numeri in una cella ("2-3" -> [2,3], "10-12" -> [10,12]). Una data (Fogli trasforma "10-12" in 10 dicembre) -> [giorno, mese].
export function numeri(v) {
  if (vuoto(v)) return { lista: [] };
  if (v instanceof Date) return { lista: [v.getUTCDate(), v.getUTCMonth() + 1], daData: true };
  const m = String(v).match(/\d+(?:[.,]\d+)?/g);
  return { lista: m ? m.map((x) => Number(x.replace(',', '.'))) : [] };
}

// Data della seduta: cella data, oppure testo "aaaa-mm-gg" o "gg/mm/aaaa".
export function dataCella(v) {
  if (v instanceof Date && !isNaN(v)) return { data: dataKey(v) };
  if (typeof v === 'string') {
    const s = v.trim();
    if (eData(s)) return { data: s, testo: true };
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { const k = `${m[3]}-${pad(m[2])}-${pad(m[1])}`; if (eData(k)) return { data: k, testo: true }; }
  }
  return { data: null };
}

// Ora del salvataggio (colonna Timestamp) come ora locale del foglio: 'aaaa-mm-gg hh:mm:ss'.
function oraCella(v) {
  if (!(v instanceof Date) || isNaN(v)) return null;
  return `${dataKey(v)} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
}

// RIR dal piano o dal pattern ("1-2", "2", "0-1"; una data -> giorno-mese). Ritorna { min, max, avviso }.
export function rirDa(v) {
  const { lista, daData } = numeri(v);
  if (!lista.length) return { min: null, max: null, avviso: vuoto(v) ? null : 'RIR non leggibile' };
  if (lista.some((x) => x < 0 || x > 10)) return { min: null, max: null, avviso: 'RIR fuori da 0-10' };
  return { min: Math.min(...lista), max: Math.max(...lista),
    avviso: daData ? 'RIR diventato una data nel foglio (letto come giorno-mese)' : lista.length > 2 ? 'RIR con più di 2 numeri: presi minimo e massimo' : null };
}

// ---------------------------------------------------------------------
// PIANO
// ---------------------------------------------------------------------

/** Legge PIANO. Ritorna { giorni:[{nome, codice, righe:[...]}], nomi:Set, problemi:{errori, avvisi, saltate} } */
export function leggiPiano(scheda) {
  const errori = [], avvisi = [], saltate = [];
  const giorni = [], perNome = {};
  scheda.righe.forEach(({ riga, celle }) => {
    const giorno = pulisci(celle.day_name), nome = pulisci(celle.exercise);
    if (!giorno && !nome) return;
    if (!giorno || !nome) { errori.push({ riga, cosa: 'manca il giorno o l\'esercizio' }); return; }
    if (/^\[\s*\]/.test(nome)) { saltate.push({ riga, cosa: 'esercizio ancora da scegliere ("[ ]")', nome }); return; }
    const s = numeri(celle.sets);
    if (s.daData) avvisi.push({ riga, cosa: 'Sets diventato una data nel foglio (letto come giorno-mese)' });
    const serie = s.lista[0], serieMax = s.lista.length > 1 ? s.lista[s.lista.length - 1] : null;
    if (!Number.isInteger(serie) || serie < 0 || serie > 20) { errori.push({ riga, cosa: 'Sets non valido', nome }); return; }
    // righe con 0 serie ("fuori piano"): non si importano (decisione di Leonardo, 2026-11-06)
    if (serie === 0 && !serieMax) { saltate.push({ riga, cosa: '0 serie (fuori piano)', nome }); return; }
    const a = numero(celle.reps_min), b = numero(celle.reps_max);
    if (a.errore || b.errore) { errori.push({ riga, cosa: 'Reps_Min/Reps_Max non validi', nome }); return; }
    const rmin = a.n, rmax = b.n;
    const repsOk = (x) => x === null || (Number.isInteger(x) && x >= 1 && x <= 200);
    if (!repsOk(rmin) || !repsOk(rmax) || (rmin !== null && rmax !== null && rmax < rmin)) { errori.push({ riga, cosa: 'ripetizioni non valide', nome }); return; }
    const rir = rirDa(celle.target_rir);
    if (rir.avviso) avvisi.push({ riga, cosa: rir.avviso, nome });
    if (!perNome[giorno]) { perNome[giorno] = { nome: giorno, codice: pulisci(celle.day_code).slice(0, 20) || null, righe: [] }; giorni.push(perNome[giorno]); }
    const ordine = numero(celle.order).n;
    perNome[giorno].righe.push({
      riga, nome, muscolo: pulisci(celle.target_muscle), ordine: ordine ?? 9999,
      serie, serieMax: serieMax !== null && serieMax > serie && serieMax <= 20 ? serieMax : null,
      repsMin: rmin, repsMax: rmax, rirMin: rir.min, rirMax: rir.max,
      note: pulisci(celle.notes) || null
    });
  });
  if (giorni.length > 50) errori.push({ riga: 0, cosa: 'più di 50 giorni nel piano' });
  giorni.forEach((g) => {
    g.righe.sort((a, b) => a.ordine - b.ordine || a.riga - b.riga);
    if (g.righe.length > 100) errori.push({ riga: 0, cosa: `giorno ${g.nome}: più di 100 esercizi` });
  });
  return { giorni, problemi: { errori, avvisi, saltate } };
}

// ---------------------------------------------------------------------
// STORICO (solo foglio GYM)
// ---------------------------------------------------------------------

/** Legge STORICO e tiene solo le serie con data tra dal e al (comprese). */
export function leggiStorico(scheda, dal, al) {
  const errori = [], avvisi = [], saltate = [];
  let vuote = 0, fuoriPeriodo = 0;
  const perChiave = new Map();
  scheda.righe.forEach(({ riga, celle }) => {
    const valori = Object.values(celle);
    if (valori.every(vuoto)) { vuote++; return; }
    const nome = pulisci(celle.exercise);
    const d = dataCella(celle.date);
    if (!d.data) {
      if (!nome) { vuote++; return; }
      errori.push({ riga, cosa: 'data non valida' }); return;
    }
    if (d.data < dal || d.data > al) { fuoriPeriodo++; return; }
    if (d.testo) avvisi.push({ riga, cosa: 'data scritta come testo' });
    if (!nome) { errori.push({ riga, cosa: 'manca l\'esercizio' }); return; }
    if (/^\[\s*\]/.test(nome)) { saltate.push({ riga, cosa: 'esercizio ancora da scegliere ("[ ]")', nome }); return; }
    const giorno = pulisci(celle.day);
    if (!giorno) { errori.push({ riga, cosa: 'manca il giorno', nome }); return; }
    const set = numero(celle.set).n;
    if (!Number.isInteger(set) || set < 1 || set > 50) { errori.push({ riga, cosa: 'numero di serie non valido', nome }); return; }
    const kg = numero(celle.weight_kg, { unitaPeso: true }), reps = numero(celle.reps), rir = numero(celle.rir);
    const bad = [];
    if (kg.errore) bad.push('kg: ' + kg.errore); else if (kg.n === null) bad.push('manca il peso'); else if (kg.n < 0 || kg.n > 500) bad.push('peso fuori da 0-500');
    if (reps.errore) bad.push('reps: ' + reps.errore); else if (reps.n === null) bad.push('mancano le reps'); else if (!Number.isInteger(reps.n) || reps.n < 1 || reps.n > 100) bad.push('reps fuori da 1-100');
    if (rir.errore) bad.push('RIR: ' + rir.errore); else if (rir.n !== null && (rir.n < 0 || rir.n > 10)) bad.push('RIR fuori da 0-10');
    if (bad.length) { errori.push({ riga, cosa: bad.join('; '), nome }); return; }
    if (kg.corretto || reps.corretto || rir.corretto) avvisi.push({ riga, cosa: 'numero scritto come testo, corretto', nome });

    // valore e unità scritti (colonne L:M): devono corrispondere al peso in kg
    let inPeso = null, inUnita = null;
    const iw = numero(celle.input_weight), iu = pulisci(celle.input_unit).toLowerCase();
    if (!vuoto(celle.input_weight) || iu) {
      if (iw.errore || iw.n === null || !['kg', 'lb'].includes(iu)) avvisi.push({ riga, cosa: 'valore/unità scritti incompleti: ignorati', nome });
      else {
        const atteso = iu === 'lb' ? Math.round(iw.n * LB_TO_KG * 100) / 100 : iw.n;
        if (Math.abs(atteso - kg.n) > 0.011) { errori.push({ riga, cosa: 'peso in kg e valore scritto non corrispondono', nome }); return; }
        inPeso = iw.n; inUnita = iu;
      }
    }
    const pat = rirDa(celle.target_rir_pattern);
    const s = {
      riga, data: d.data, giorno, nome, set, kg: kg.n, reps: reps.n, rir: rir.n,
      inPeso, inUnita, ora: oraCella(celle.timestamp), note: pulisci(celle['personal notes']) || null,
      rirMin: pat.min, rirMax: pat.max
    };
    const chiave = [s.data, s.giorno, s.nome, s.set].join('|');
    const prima = perChiave.get(chiave);
    if (prima) {
      if (prima.kg === s.kg && prima.reps === s.reps && prima.rir === s.rir) saltate.push({ riga, cosa: `doppione identico della riga ${prima.riga}`, nome });
      else errori.push({ riga, cosa: `doppione con valori diversi dalla riga ${prima.riga}`, nome });
      return;
    }
    perChiave.set(chiave, s);
  });
  return { serie: [...perChiave.values()], problemi: { errori, avvisi, saltate }, conteggi: { righe: scheda.righe.length, vuote, fuoriPeriodo } };
}

// ---------------------------------------------------------------------
// Collegamenti: nome nel foglio -> esercizio (+ macchina)
// ---------------------------------------------------------------------

// Marche note (come in web-app.html): "Hammer Strenght Select lateral raises" -> marca + titolo.
const MARCHE = /^(hammer\s+stren\w*\s+select|hammer\s+stren\w*|nautilus\s+humansport|nautilus|panatta|atlantis|gymleco(?:\s+\d+)?|cybex\s+og|cybex|life\s+fitness|technogym|matrix)\s+(.+)$/i;
const MUSCOLI_FOGLIO = {
  chest: 'chest', petto: 'chest', 'lateral delts': 'side-delts', 'side delts': 'side-delts', shoulders: 'front-delts',
  'front delts': 'front-delts', 'rear delts': 'rear-delts', biceps: 'biceps', triceps: 'triceps', quads: 'quads',
  hamstrings: 'hamstrings', calves: 'calves', adductors: 'adductors', abductors: 'abductors', glutes: 'glutes',
  abs: 'abs', lats: 'lats', traps: 'traps', forearms: 'forearms'
};

function proposta(nome, muscoloFoglio) {
  let titolo = nome, marca = '';
  const p = titolo.match(/^(.*?)\s*\(([^)]*)\)\s*$/); if (p) titolo = p[1];
  const m = titolo.match(MARCHE); if (m) { marca = m[1].replace(/strenght/i, 'Strength'); titolo = m[2]; }
  const t = titolo.toLowerCase();
  let muscolo = MUSCOLI_FOGLIO[String(muscoloFoglio || '').toLowerCase()] || null;
  if (String(muscoloFoglio || '').toLowerCase() === 'back') muscolo = /pulldown|pull-?up|pullover|lat\b|larghezza/.test(t) ? 'lats' : 'upper-back';
  const attrezzo = marca ? 'machine' : /cable|cavo/.test(t) ? 'cable' : /dumbbell|manubri/.test(t) ? 'dumbbell'
    : /barbell|bilanciere/.test(t) ? 'barbell' : /multipower|smith/.test(t) ? 'smith' : /machine|macchina/.test(t) ? 'machine' : 'other';
  return { titolo: titolo.trim(), marca, muscolo, attrezzo };
}

/** Aggiunge alla bozza i nomi nuovi (quelli già presenti restano come sono). Ritorna quanti nomi ha aggiunto. */
export function aggiornaBozza(col, nomi) {
  col.versione = 1;
  col.esercizi = col.esercizi || {};
  col.macchine = col.macchine || {};
  col.nomi = col.nomi || {};
  let nuovi = 0;
  for (const [nome, muscoloFoglio] of nomi) {
    if (col.nomi[nome]) continue;
    const pr = proposta(nome, muscoloFoglio);
    const ec = codice(pr.titolo) || 'esercizio';
    if (!col.esercizi[ec]) col.esercizi[ec] = { it: pr.titolo, en: pr.titolo, attrezzo: pr.attrezzo, muscolo: pr.muscolo, secondari: [] };
    let mc = null;
    if (pr.marca) {
      mc = codice(pr.marca + ' ' + pr.titolo);
      if (!col.macchine[mc]) col.macchine[mc] = { marca: pr.marca, modello: pr.titolo, tipo: 'other' };
    }
    col.nomi[nome] = { esercizio: ec, macchina: mc, stato: / \/ /.test(nome) ? 'da decidere' : 'da controllare' };
    nuovi++;
  }
  return nuovi;
}

/** Controlla il file dei collegamenti per i nomi usati. Ritorna la lista dei problemi (vuota = tutto ok). */
export function controllaCollegamenti(col, nomiUsati) {
  const p = [];
  if (!col || col.versione !== 1) return ['file dei collegamenti mancante o di versione sconosciuta'];
  for (const [c, e] of Object.entries(col.esercizi || {})) {
    if (!eCodice(c)) p.push(`esercizio "${c}": codice non valido (solo a-z, 0-9 e "-")`);
    if (!pulisci(e.it) && !pulisci(e.en)) p.push(`esercizio ${c}: manca il nome`);
    if (!ATTREZZI.includes(e.attrezzo)) p.push(`esercizio ${c}: attrezzo non valido`);
    if (!MUSCOLI.includes(e.muscolo)) p.push(`esercizio ${c}: muscolo principale mancante o non valido`);
    for (const s of e.secondari || []) if (!MUSCOLI.includes(s) || s === e.muscolo) p.push(`esercizio ${c}: muscolo secondario "${s}" non valido`);
  }
  for (const [c, m] of Object.entries(col.macchine || {})) {
    if (!eCodice(c)) p.push(`macchina "${c}": codice non valido`);
    if (!pulisci(m.marca) && !pulisci(m.modello)) p.push(`macchina ${c}: servono marca o modello`);
    if (!TIPI_MACCHINA.includes(m.tipo)) p.push(`macchina ${c}: tipo non valido`);
    if (m.codice_marca !== undefined && (!pulisci(m.codice_marca) || pulisci(m.codice_marca).length > 80)) p.push(`macchina ${c}: codice della macchina non valido`);
  }
  // palestra (facoltativa): privata di chi importa, con le macchine usate
  if (col.palestra !== undefined && (!pulisci(col.palestra?.nome) || pulisci(col.palestra.nome).length > 120)) p.push('palestra: nome mancante o troppo lungo');
  for (const nome of nomiUsati) {
    const n = col.nomi?.[nome];
    if (!n) { p.push(`nome non collegato: "${nome}"`); continue; }
    if (!STATI.includes(n.stato)) { p.push(`"${nome}": stato sconosciuto`); continue; }
    if (n.stato === 'ignora') continue;
    if (n.stato !== 'ok') { p.push(`"${nome}": ${n.stato}`); continue; }
    if (!col.esercizi?.[n.esercizio]) p.push(`"${nome}": esercizio ${n.esercizio} non definito`);
    if (n.macchina && !col.macchine?.[n.macchina]) p.push(`"${nome}": macchina ${n.macchina} non definita`);
  }
  return p;
}

// ---------------------------------------------------------------------
// Modello dell'import: righe con gli ID fissi
// ---------------------------------------------------------------------

/** Costruisce cosa scrivere: libreria, piano, sedute, esercizi della seduta, serie. */
export function costruisci({ uid, col, piano, serie, nomePiano }) {
  const usato = (nome) => col.nomi[nome] && col.nomi[nome].stato === 'ok';
  const esercizi = new Set(), macchine = new Set(), coppie = new Set();
  const segna = (nome) => {
    const n = col.nomi[nome];
    esercizi.add(n.esercizio);
    if (n.macchina) { macchine.add(n.macchina); coppie.add(n.macchina + '|' + n.esercizio); }
  };
  const ignorate = [];

  // Piano
  let p = null;
  if (piano) {
    const id = uuidv5(`${uid}|piano|${nomePiano}`);
    p = { id, nome: nomePiano, giorni: [], esercizi: [] };
    piano.giorni.forEach((g, gi) => {
      const gid = uuidv5(`${id}|giorno|${gi + 1}`);
      p.giorni.push({ id: gid, pos: gi + 1, codice: g.codice, nome: g.nome });
      let pos = 0;
      g.righe.forEach((r) => {
        if (!usato(r.nome)) { ignorate.push({ riga: r.riga, cosa: 'PIANO: nome segnato "ignora"', nome: r.nome }); return; }
        segna(r.nome);
        pos++;
        p.esercizi.push({ id: uuidv5(`${gid}|esercizio|${pos}`), giorno: gid, pos, ex: col.nomi[r.nome].esercizio, mac: col.nomi[r.nome].macchina || null,
          serie: r.serie, serieMax: r.serieMax, repsMin: r.repsMin, repsMax: r.repsMax, rirMin: r.rirMin, rirMax: r.rirMax, note: r.note });
      });
    });
  }

  // Storico
  const sedute = new Map(), eseSed = new Map(), righe = [];
  (serie || []).sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || '')) || a.riga - b.riga).forEach((s) => {
    if (!usato(s.nome)) { ignorate.push({ riga: s.riga, cosa: 'STORICO: nome segnato "ignora"', nome: s.nome }); return; }
    segna(s.nome);
    const ks = `${uid}|seduta|${s.data}|${s.giorno}`;
    if (!sedute.has(ks)) sedute.set(ks, { id: uuidv5(ks), data: s.data, giorno: s.giorno, n: 0 });
    const sed = sedute.get(ks);
    const ke = `${ks}|${s.nome}`;
    if (!eseSed.has(ke)) {
      sed.n++;
      eseSed.set(ke, { id: uuidv5(ke), seduta: sed.id, pos: sed.n, ex: col.nomi[s.nome].esercizio, mac: col.nomi[s.nome].macchina || null, rirMin: s.rirMin, rirMax: s.rirMax });
    }
    const se = eseSed.get(ke);
    righe.push({ id: uuidv5(`${ke}|serie|${s.set}`), se: se.id, data: s.data, giorno: s.giorno, ex: se.ex, mac: se.mac, set: s.set,
      kg: s.kg, reps: s.reps, rir: s.rir, inPeso: s.inPeso, inUnita: s.inUnita, ora: s.ora, note: s.note });
  });
  if ([...sedute.values()].some((s) => s.n > 100)) throw new Error('Una seduta ha più di 100 esercizi: controlla il foglio.');

  const libreria = {
    esercizi: [...esercizi].sort().map((c) => ({ codice: c, ...col.esercizi[c] })),
    macchine: [...macchine].sort().map((c) => ({ codice: c, ...col.macchine[c] })),
    coppie: [...coppie].sort().map((x) => x.split('|'))
  };
  const palestra = col.palestra ? { id: uuidv5(`${uid}|palestra|${pulisci(col.palestra.nome).toLowerCase()}`), nome: pulisci(col.palestra.nome) } : null;
  return { piano: p, sedute: [...sedute.values()], eseSed: [...eseSed.values()], serie: righe, libreria, palestra, ignorate };
}

// Totali attesi, calcolati dalle serie del foglio (volume in grammi per evitare errori di arrotondamento).
export function totali(serie) {
  const g = (kg) => Math.round((kg ?? 0) * 1000);
  const perEs = new Map(), perMese = new Map();
  for (const s of serie) {
    const ke = s.ex + '|' + (s.mac || '');
    const e = perEs.get(ke) || { ex: s.ex, mac: s.mac, n: 0, reps: 0, vol: 0, max: null };
    e.n++; e.reps += s.reps; e.vol += g(s.kg) * s.reps; e.max = e.max === null ? s.kg : Math.max(e.max, s.kg);
    perEs.set(ke, e);
    const mese = s.data.slice(0, 7);
    const m = perMese.get(mese) || { mese, sedute: new Set(), n: 0, vol: 0 };
    m.sedute.add(s.data + '|' + s.giorno); m.n++; m.vol += g(s.kg) * s.reps;
    perMese.set(mese, m);
  }
  return {
    esercizi: [...perEs.values()].map((e) => ({ ...e, vol: e.vol / 1000 })),
    mesi: [...perMese.values()].map((m) => ({ mese: m.mese, sedute: m.sedute.size, n: m.n, vol: m.vol / 1000 }))
  };
}

// ---------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------

const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') { if (!isFinite(v)) throw new Error('numero non valido'); return String(v); }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const t = (v, tipo) => `${lit(v)}::${tipo}`;
// Tabella di valori; con zero righe una select vuota con le stesse colonne.
function valori(cols, righe) {
  if (!righe.length) return `select ${cols.map(([n, tp]) => `null::${tp} as ${n}`).join(', ')} where false`;
  return `select * from (values ${righe.map((r) => '(' + r.map((v, i) => t(v, cols[i][1])).join(', ') + ')').join(',\n  ')}) as v(${cols.map(([n]) => n).join(', ')})`;
}
const i18n = (e) => JSON.stringify(Object.fromEntries([['it', pulisci(e.it)], ['en', pulisci(e.en)]].filter(([, v]) => v)));

const COL_SERIE = [['set_id', 'uuid'], ['session_date', 'date'], ['day_name', 'text'], ['ex_code', 'text'], ['mac_code', 'text'], ['set_number', 'int'],
  ['weight_kg', 'numeric'], ['reps', 'int'], ['rir', 'numeric'], ['input_weight', 'numeric'], ['input_unit', 'text'], ['notes', 'text']];

/** Query di controllo (una sola SELECT, va bene anche in sola lettura). Ritorna un jsonb. */
export function sqlControlli({ uid, dal, al, modello, tot }) {
  const parti = [];
  const ctes = [];
  if (dal) {
    ctes.push(`att as (${valori(COL_SERIE, modello.serie.map((s) => [s.id, s.data, s.giorno, s.ex, s.mac, s.set, s.kg, s.reps, s.rir, s.inPeso, s.inUnita, s.note]))})`);
    ctes.push(`db as (
      select s.id as set_id, ss.id as session_id, ss.session_date, ss.day_name, e.code as ex_code, m.code as mac_code, s.set_number,
             s.weight_kg, s.reps::int as reps, s.rir, s.input_weight, s.input_unit, s.notes, s.session_exercise_id
      from public.sets s
      join public.session_exercises se on se.id = s.session_exercise_id
      join public.sessions ss on ss.id = se.session_id
      join public.exercises e on e.id = se.exercise_id
      left join public.machines m on m.id = se.machine_id
      where s.user_id = ${t(uid, 'uuid')} and ss.session_date between ${t(dal, 'date')} and ${t(al, 'date')}
        and s.deleted_at is null and se.deleted_at is null and ss.deleted_at is null)`);
    ctes.push(`att_es as (${valori([['ex_code', 'text'], ['mac_code', 'text'], ['n', 'int'], ['reps', 'int'], ['vol', 'numeric'], ['mx', 'numeric']],
      tot.esercizi.map((e) => [e.ex, e.mac, e.n, e.reps, e.vol, e.max]))})`);
    ctes.push(`db_es as (select ex_code, mac_code, count(*)::int as n, sum(reps)::int as reps, round(sum(coalesce(weight_kg, 0) * reps), 3) as vol, max(weight_kg) as mx from db group by 1, 2)`);
    ctes.push(`att_mese as (${valori([['mese', 'text'], ['sedute', 'int'], ['n', 'int'], ['vol', 'numeric']], tot.mesi.map((m) => [m.mese, m.sedute, m.n, m.vol]))})`);
    ctes.push(`db_mese as (select to_char(session_date, 'YYYY-MM') as mese, count(distinct session_id)::int as sedute, count(*)::int as n, round(sum(coalesce(weight_kg, 0) * reps), 3) as vol from db group by 1)`);
    parti.push(`select 'serie: numero totale', (select count(*) from att)::bigint, (select count(*) from db)::bigint`);
    parti.push(`select 'sedute: numero totale', (select count(distinct (session_date, day_name)) from att)::bigint, (select count(distinct session_id) from db)::bigint`);
    parti.push(`select 'serie: confronto riga per riga (righe diverse)', 0::bigint, (select count(*) from att a full join db d on d.set_id = a.set_id
      where a.set_id is null or d.set_id is null
         or row(a.session_date, a.day_name, a.ex_code, a.mac_code, a.set_number, a.weight_kg, a.reps, a.rir, a.input_weight, a.input_unit, a.notes)
            is distinct from row(d.session_date, d.day_name, d.ex_code, d.mac_code, d.set_number, d.weight_kg, d.reps, d.rir, d.input_weight, d.input_unit, d.notes))::bigint`);
    parti.push(`select 'totali per esercizio (esercizi diversi)', 0::bigint, (select count(*) from att_es a full join db_es d on d.ex_code = a.ex_code and d.mac_code is not distinct from a.mac_code
      where row(a.n, a.reps, a.vol, a.mx) is distinct from row(d.n, d.reps, d.vol, d.mx))::bigint`);
    parti.push(`select 'totali per mese (mesi diversi)', 0::bigint, (select count(*) from att_mese a full join db_mese d on d.mese = a.mese
      where row(a.sedute, a.n, a.vol) is distinct from row(d.sedute, d.n, d.vol))::bigint`);
    parti.push(`select 'stesso numero di serie due volte nello stesso esercizio', 0::bigint, (select count(*) from (
      select 1 from public.sets where user_id = ${t(uid, 'uuid')} and deleted_at is null group by session_exercise_id, set_number having count(*) > 1) x)::bigint`);
  }
  if (modello.piano) {
    const p = modello.piano;
    ctes.push(`att_g as (${valori([['id', 'uuid'], ['pos', 'int'], ['code', 'text'], ['name', 'text']], p.giorni.map((g) => [g.id, g.pos, g.codice, g.nome]))})`);
    const club = modello.palestra;
    ctes.push(`att_pe as (${valori([['id', 'uuid'], ['day_id', 'uuid'], ['pos', 'int'], ['ex_code', 'text'], ['mac_code', 'text'], ['sets', 'int'], ['sets_max', 'int'], ['reps_min', 'int'], ['reps_max', 'int'], ['rir_min', 'numeric'], ['rir_max', 'numeric'], ['notes', 'text']],
      p.esercizi.map((e) => [e.id, e.giorno, e.pos, e.ex, club ? e.mac : null, e.serie, e.serieMax, e.repsMin, e.repsMax, e.rirMin, e.rirMax, e.note]))})`);
    ctes.push(`db_g as (select id, position::int as pos, code, name from public.plan_days where plan_id = ${t(p.id, 'uuid')} and user_id = ${t(uid, 'uuid')})`);
    ctes.push(`db_pe as (select pe.id, pe.plan_day_id as day_id, pe.position::int as pos, e.code as ex_code, m.code as mac_code, pe.sets::int as sets, pe.sets_max::int as sets_max,
      pe.reps_min::int as reps_min, pe.reps_max::int as reps_max, pe.rir_min, pe.rir_max, pe.notes
      from public.plan_exercises pe join public.exercises e on e.id = pe.exercise_id join db_g g on g.id = pe.plan_day_id
      left join public.plan_exercise_machines pem on pem.plan_exercise_id = pe.id and pem.club_id = ${club ? t(club.id, 'uuid') : 'null::uuid'}
      left join public.machines m on m.id = pem.machine_id)`);
    parti.push(`select 'piano: giorni diversi', 0::bigint, (select count(*) from att_g a full join db_g d on d.id = a.id where row(a.pos, a.code, a.name) is distinct from row(d.pos, d.code, d.name))::bigint`);
    parti.push(`select 'piano: esercizi diversi (macchina compresa)', 0::bigint, (select count(*) from att_pe a full join db_pe d on d.id = a.id
      where row(a.day_id, a.pos, a.ex_code, a.mac_code, a.sets, a.sets_max, a.reps_min, a.reps_max, a.rir_min, a.rir_max, a.notes)
            is distinct from row(d.day_id, d.pos, d.ex_code, d.mac_code, d.sets, d.sets_max, d.reps_min, d.reps_max, d.rir_min, d.rir_max, d.notes))::bigint`);
    parti.push(`select 'piano: serie a settimana', (select coalesce(sum(sets), 0) from att_pe)::bigint, (select coalesce(sum(sets), 0) from db_pe)::bigint`);
  }
  if (modello.palestra) {
    const C = t(modello.palestra.id, 'uuid'), codici = modello.libreria.macchine.map((m) => m.codice);
    parti.push(`select 'palestra privata di questa persona, principale', 1::bigint, (select count(*) from public.clubs c join public.user_clubs uc on uc.club_id = c.id
      where c.id = ${C} and c.created_by = ${t(uid, 'uuid')} and c.visibility = 'private' and uc.user_id = ${t(uid, 'uuid')})::bigint`);
    parti.push(`select 'palestra: macchine usate collegate', ${codici.length}::bigint, (select count(*) from public.club_machines cm join public.machines m on m.id = cm.machine_id
      where cm.club_id = ${C} and m.code = any(string_to_array(${lit(codici.join(','))}, ',')))::bigint`);
    if (dal) parti.push(`select 'sedute nella palestra', (select count(distinct (session_date, day_name)) from att)::bigint,
      (select count(*) from public.sessions where id in (select session_id from db) and club_id = ${C})::bigint`);
  }
  parti.push(`select 'righe di altre persone negli import di questa persona', 0::bigint, (
      (select count(*) from public.sessions x join public.import_batches b on b.id = x.import_id where b.user_id = ${t(uid, 'uuid')} and x.user_id <> b.user_id)
    + (select count(*) from public.session_exercises x join public.import_batches b on b.id = x.import_id where b.user_id = ${t(uid, 'uuid')} and x.user_id <> b.user_id)
    + (select count(*) from public.sets x join public.import_batches b on b.id = x.import_id where b.user_id = ${t(uid, 'uuid')} and x.user_id <> b.user_id))::bigint`);
  return `with ${ctes.length ? ctes.join(',\n') + ',\n' : ''}c(nome, atteso, trovato) as (\n${parti.join('\nunion all\n')}\n)
select jsonb_build_object('controlli', (select jsonb_agg(jsonb_build_object('nome', nome, 'atteso', atteso, 'trovato', trovato, 'ok', atteso = trovato)) from c)) as risultato`;
}

/** Blocco unico (DO): libreria, piano, storico e controlli. Se un controllo fallisce non resta niente. */
export function sqlImport({ uid, email, batch, fonte, file, modello, controlli, prova, righeLette, righeScartate, fuso = FUSO }) {
  const p = modello.piano, lib = modello.libreria;
  const kind = p && modello.serie.length ? 'mixed' : p ? 'plan' : 'training';
  const U = t(uid, 'uuid');
  const ex = lib.esercizi, mac = lib.macchine;
  const corpo = [];
  corpo.push(`perform set_config('role', 'postgres', true);`);
  corpo.push(`if (select count(*) from auth.users where id = ${U} and lower(email) = lower(${lit(email)})) <> 1 then raise exception 'IMPORT-ERRORE: account non trovato'; end if;`);
  corpo.push(`if not exists (select 1 from public.profiles where id = ${U}) then raise exception 'IMPORT-ERRORE: profilo mancante'; end if;`);
  corpo.push(`insert into public.import_batches (id, user_id, source, kind, file_name, status, rows_read, rows_skipped)
    values (${t(batch, 'uuid')}, ${U}, ${lit(fonte)}, ${lit(kind)}, ${lit(path.basename(file).slice(0, 255))}, 'running', ${righeLette}, ${righeScartate});`);
  if (ex.length) {
    corpo.push(`with nuovi as (
      insert into public.exercises (code, name, equipment, visibility, verified)
      ${valori([['code', 'text'], ['name', 'jsonb'], ['equipment', 'text'], ['visibility', 'text'], ['verified', 'boolean']], ex.map((e) => [e.codice, i18n(e), e.attrezzo, 'public', false]))}
      on conflict (code) do nothing returning id, code),
    mus as (insert into public.exercise_muscles (exercise_id, muscle_code, role, weight)
      select n.id, m.muscle, m.role, m.weight from nuovi n join (${valori([['code', 'text'], ['muscle', 'text'], ['role', 'text'], ['weight', 'numeric']],
        ex.flatMap((e) => [[e.codice, e.muscolo, 'primary', 1], ...(e.secondari || []).map((s) => [e.codice, s, 'secondary', 0.5])]))}) m on m.code = n.code
      returning 1)
    select count(*) into v_es from nuovi;`);
    corpo.push(`if (select count(*) from public.exercises where code = any(string_to_array(${lit(ex.map((e) => e.codice).join(','))}, ','))
        and (visibility = 'public' or created_by = ${U}) and archived_at is null) <> ${ex.length}
      then raise exception 'IMPORT-ERRORE: alcuni esercizi della libreria non sono usabili (privati di altri o archiviati)'; end if;`);
  }
  if (mac.length) {
    corpo.push(`with nuove as (
      insert into public.machines (code, brand, model, brand_code, machine_type, visibility, verified)
      ${valori([['code', 'text'], ['brand', 'text'], ['model', 'text'], ['brand_code', 'text'], ['machine_type', 'text'], ['visibility', 'text'], ['verified', 'boolean']],
        mac.map((m) => [m.codice, pulisci(m.marca) || null, pulisci(m.modello) || null, pulisci(m.codice_marca) || null, m.tipo, 'public', false]))}
      on conflict (code) do nothing returning 1)
    select count(*) into v_mac from nuove;`);
    corpo.push(`insert into public.machine_exercises (machine_id, exercise_id)
      select m.id, e.id from (${valori([['mc', 'text'], ['ec', 'text']], lib.coppie)}) v
      join public.machines m on m.code = v.mc join public.exercises e on e.code = v.ec
      on conflict do nothing;`);
  }
  const club = modello.palestra;
  const C = club ? t(club.id, 'uuid') : 'null';
  if (club) {
    // palestra privata di chi importa, palestra principale se non ne ha già una, con le macchine usate
    corpo.push(`insert into public.clubs (id, name, visibility, verified, created_by) values (${C}, ${lit(club.nome)}, 'private', false, ${U}) on conflict (id) do nothing;`);
    corpo.push(`if not exists (select 1 from public.clubs where id = ${C} and created_by = ${U} and visibility = 'private') then raise exception 'IMPORT-ERRORE: la palestra esiste ma non è privata di questo account'; end if;`);
    corpo.push(`insert into public.user_clubs (user_id, club_id, is_home)
      values (${U}, ${C}, not exists (select 1 from public.user_clubs where user_id = ${U} and is_home)) on conflict do nothing;`);
    if (mac.length) corpo.push(`insert into public.club_machines (club_id, machine_id, added_by)
      select ${C}, m.id, ${U} from public.machines m where m.code = any(string_to_array(${lit(mac.map((m) => m.codice).join(','))}, ','))
      on conflict do nothing;`);
  }
  if (p) {
    corpo.push(`if exists (select 1 from public.plans where id = ${t(p.id, 'uuid')}) then raise exception 'IMPORT-ERRORE: questo piano è già stato importato (per rifarlo annulla prima l''import)'; end if;`);
    corpo.push(`v_attivo := not exists (select 1 from public.plans where user_id = ${U} and is_active);`);
    corpo.push(`insert into public.plans (id, user_id, name, is_active, created_by, notes)
      values (${t(p.id, 'uuid')}, ${U}, ${lit(p.nome)}, v_attivo, ${U}, ${lit('Importato dal foglio Google (' + fonte + ')')});`);
    if (p.giorni.length) corpo.push(`insert into public.plan_days (id, plan_id, user_id, position, code, name)
      select v.id, ${t(p.id, 'uuid')}, ${U}, v.pos, v.code, v.name from (${valori([['id', 'uuid'], ['pos', 'int'], ['code', 'text'], ['name', 'text']], p.giorni.map((g) => [g.id, g.pos, g.codice, g.nome]))}) v;`);
    if (p.esercizi.length) corpo.push(`insert into public.plan_exercises (id, plan_day_id, user_id, position, exercise_id, sets, sets_max, reps_min, reps_max, rir_min, rir_max, notes)
      select v.id, v.day_id, ${U}, v.pos, e.id, v.sets, v.sets_max, v.reps_min, v.reps_max, v.rir_min, v.rir_max, v.notes
      from (${valori([['id', 'uuid'], ['day_id', 'uuid'], ['pos', 'int'], ['ex_code', 'text'], ['sets', 'int'], ['sets_max', 'int'], ['reps_min', 'int'], ['reps_max', 'int'], ['rir_min', 'numeric'], ['rir_max', 'numeric'], ['notes', 'text']],
        p.esercizi.map((e) => [e.id, e.giorno, e.pos, e.ex, e.serie, e.serieMax, e.repsMin, e.repsMax, e.rirMin, e.rirMax, e.note]))}) v
      join public.exercises e on e.code = v.ex_code;`);
    const conMacchina = p.esercizi.filter((e) => e.mac);
    if (club && conMacchina.length) corpo.push(`insert into public.plan_exercise_machines (plan_exercise_id, user_id, club_id, machine_id)
      select v.id, ${U}, ${C}, m.id from (${valori([['id', 'uuid'], ['mc', 'text']], conMacchina.map((e) => [e.id, e.mac]))}) v
      join public.machines m on m.code = v.mc;`);
  }
  if (modello.serie.length) {
    corpo.push(`insert into public.sessions (id, user_id, session_date, day_name, club_id, import_id)
      select v.id, ${U}, v.d, v.day, ${C}::uuid, ${t(batch, 'uuid')} from (${valori([['id', 'uuid'], ['d', 'date'], ['day', 'text']], modello.sedute.map((s) => [s.id, s.data, s.giorno]))}) v
      on conflict (id) do nothing;
    get diagnostics v_n = row_count; v_sed := v_n;`);
    corpo.push(`insert into public.session_exercises (id, session_id, user_id, position, exercise_id, machine_id, target_rir_min, target_rir_max, import_id)
      select v.id, v.sid, ${U}, v.pos, e.id, m.id, v.rmin, v.rmax, ${t(batch, 'uuid')}
      from (${valori([['id', 'uuid'], ['sid', 'uuid'], ['pos', 'int'], ['ec', 'text'], ['mc', 'text'], ['rmin', 'numeric'], ['rmax', 'numeric']],
        modello.eseSed.map((e) => [e.id, e.seduta, e.pos, e.ex, e.mac, e.rirMin, e.rirMax]))}) v
      join public.exercises e on e.code = v.ec left join public.machines m on m.code = v.mc
      on conflict (id) do nothing;
    get diagnostics v_n = row_count; v_ese := v_n;`);
    corpo.push(`insert into public.sets (id, session_exercise_id, user_id, set_number, weight_kg, reps, rir, input_weight, input_unit, performed_at, notes, import_id)
      select v.id, v.se, ${U}, v.n, v.kg, v.reps, v.rir, v.iw, v.iu, (v.ora at time zone ${lit(fuso)}), v.notes, ${t(batch, 'uuid')}
      from (${valori([['id', 'uuid'], ['se', 'uuid'], ['n', 'int'], ['kg', 'numeric'], ['reps', 'int'], ['rir', 'numeric'], ['iw', 'numeric'], ['iu', 'text'], ['ora', 'timestamp'], ['notes', 'text']],
        modello.serie.map((s) => [s.id, s.se, s.set, s.kg, s.reps, s.rir, s.inPeso, s.inUnita, s.ora || s.data + ' 12:00:00', s.note]))}) v
      on conflict (id) do nothing;
    get diagnostics v_n = row_count; v_serie := v_n;`);
  }
  corpo.push(`r := (${controlli});`);
  corpo.push(`r := r || jsonb_build_object('import_id', ${t(batch, 'uuid')}, 'piano', ${p ? t(p.id, 'uuid') : 'null'}, 'piano_attivo', v_attivo,
      'nuovi', jsonb_build_object('esercizi', v_es, 'macchine', v_mac, 'sedute', v_sed, 'esercizi_seduta', v_ese, 'serie', v_serie));`);
  // Riassunto corto per i messaggi di errore: online l'API di Supabase taglia i messaggi lunghi (circa 1.000 caratteri).
  corpo.push(`breve := jsonb_build_object(
      'controlli_ok', (select count(*) from jsonb_array_elements(r -> 'controlli') c where (c ->> 'ok')::boolean),
      'controlli_totali', jsonb_array_length(r -> 'controlli'),
      'falliti', (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(r -> 'controlli') c where not (c ->> 'ok')::boolean),
      'nuovi', r -> 'nuovi');`);
  corpo.push(`if (breve ->> 'controlli_ok')::int <> (breve ->> 'controlli_totali')::int then raise exception 'IMPORT-CONTROLLI-FALLITI %', breve::text; end if;`);
  corpo.push(`update public.import_batches set status = 'done', finished_at = now(), rows_imported = v_sed + v_ese + v_serie, notes = r::text where id = ${t(batch, 'uuid')};`);
  if (prova) corpo.push(`raise exception 'IMPORT-PROVA-OK %', breve::text;`);
  const sql = `do $imp$
declare
  r jsonb; breve jsonb; v_n int := 0; v_es int := 0; v_mac int := 0; v_sed int := 0; v_ese int := 0; v_serie int := 0; v_attivo boolean := null;
begin
  ${corpo.join('\n  ')}
end
$imp$`;
  return sql;
}

/** Annulla un import: cancella le sue sedute/esercizi/serie e il piano che ha creato. La libreria resta. */
export function sqlAnnulla({ uid, email, batch }) {
  const U = t(uid, 'uuid'), B = t(batch, 'uuid');
  return `do $imp$
declare v_notes jsonb; v_plan uuid; v_se int; v_s int; v_ss int;
begin
  perform set_config('role', 'postgres', true);
  if (select count(*) from auth.users where id = ${U} and lower(email) = lower(${lit(email)})) <> 1 then raise exception 'IMPORT-ERRORE: account non trovato'; end if;
  if not exists (select 1 from public.import_batches where id = ${B} and user_id = ${U} and status = 'done') then
    raise exception 'IMPORT-ERRORE: import non trovato per questo account, o non concluso, o già annullato'; end if;
  if exists (select 1 from public.sets s join public.session_exercises se on se.id = s.session_exercise_id where se.import_id = ${B} and s.import_id is distinct from ${B})
     or exists (select 1 from public.session_exercises se join public.sessions ss on ss.id = se.session_id where ss.import_id = ${B} and se.import_id is distinct from ${B}) then
    raise exception 'IMPORT-ERRORE: altri dati (import più recenti o l''app) dipendono da questo import: annulla prima quelli'; end if;
  select notes::jsonb into v_notes from public.import_batches where id = ${B};
  v_plan := nullif(v_notes ->> 'piano', '')::uuid;
  delete from public.sets where import_id = ${B}; get diagnostics v_s = row_count;
  delete from public.session_exercises where import_id = ${B}; get diagnostics v_se = row_count;
  delete from public.sessions where import_id = ${B}; get diagnostics v_ss = row_count;
  if v_plan is not null then delete from public.plans where id = v_plan and user_id = ${U}; end if;
  update public.import_batches set status = 'rolled-back', finished_at = now(),
    notes = (coalesce(v_notes, '{}'::jsonb) || jsonb_build_object('annullato', jsonb_build_object('serie', v_s, 'esercizi_seduta', v_se, 'sedute', v_ss, 'piano', v_plan)))::text
  where id = ${B};
end
$imp$`;
}

// ---------------------------------------------------------------------
// Esecuzione con la CLI di Supabase (in locale, oppure online solo su gym-app)
// ---------------------------------------------------------------------

/** Esegue una sola istruzione SQL. Ritorna { ok, righe } oppure { ok:false, errore }. */
export function eseguiSql(sql, { online = false, sola_lettura = false } = {}) {
  const cli = path.join(REPO, 'node_modules', 'supabase', 'dist', 'supabase.js');
  if (!fs.existsSync(cli)) throw new Error('Manca la CLI di Supabase: lancia prima npm install.');
  if (online) {
    const refFile = path.join(REPO, 'supabase', '.temp', 'project-ref');
    const ref = fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf8').trim() : '';
    if (ref && ref !== PROJECT_REF) throw new Error(`Il repository è collegato a un altro progetto (${ref}): mi fermo.`);
  }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gym-import-')), 'q.sql');
  fs.writeFileSync(tmp, sql, 'utf8');
  try {
    const args = [cli, 'db', 'query', '--file', tmp, '--output-format', 'json', '--agent', 'no', '--workdir', REPO];
    if (online) args.push(`--remote=${PROJECT_REF}`, '--yes');
    if (sola_lettura) args.push('--read-only');
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const out = (r.stdout || '').trim();
    let j = null;
    try { j = JSON.parse(out); } catch { /* non JSON */ }
    if (j && !Array.isArray(j) && j._tag === 'Error') return { ok: false, errore: j.error?.message || 'errore' };
    if (r.status !== 0) return { ok: false, errore: (out || r.stderr || 'errore sconosciuto').slice(-4000) };
    // istruzioni senza righe (DO, INSERT, DELETE): la CLI risponde con testo semplice, es. "DO" o "DELETE 0"
    return { ok: true, righe: Array.isArray(j) ? j : [], comando: Array.isArray(j) ? null : out };
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

/** Dal messaggio di errore di un blocco DO estrae il marcatore e il JSON. */
export function esitoBlocco(errore) {
  errore = String(errore);
  // Online la CLI passa dall'API di Supabase: "unexpected status 400: {"message":"Failed to run sql query: ERROR: P0001: ..."}"
  const api = errore.match(/unexpected status \d+:\s*(\{.*\})\s*$/s);
  if (api) { try { errore = JSON.parse(api[1]).message || errore; } catch { /* resta com'è */ } }
  const m = errore.match(/(IMPORT-[A-Z-]+):?\s*(\{.*\})?/s);
  if (!m) return { marcatore: null, testo: errore };
  let dati = null;
  if (m[2]) { try { dati = JSON.parse(m[2]); } catch { /* lascia null */ } }
  return { marcatore: m[1], dati, testo: errore.slice(errore.indexOf(m[1])) };
}
