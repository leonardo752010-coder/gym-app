#!/usr/bin/env node
// =====================================================================
// Import dai fogli Google nel database (passo 3). Guida: docs/import.md
//
//   npm run import -- bozza    --file F.xlsx --formato gym [--dal A --al B] [--solo-piano]
//   npm run import -- secco    --file F.xlsx --formato ... [--dal A --al B | --solo-piano] [--senza-piano]
//   npm run import -- importa  ... --email E [--nome-piano N] [--prova] [--online]
//   npm run import -- verifica ... --email E [--online]
//   npm run import -- annulla  --import-id ID --email E [--online]
//
// In locale per prima cosa (database di prova). Online solo con --online, solo sul progetto gym-app,
// e dopo una conferma scritta. In chat/terminale escono solo conteggi; i dettagli vanno nel resoconto,
// accanto al file .xlsx (fuori dal repository).
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import {
  CARTELLA_IMPORT, TETTO_GIORNI, FUSO, eData, giorniTra, dentroRepo, leggiFile, controllaFormato, leggiPiano, leggiStorico,
  aggiornaBozza, controllaCollegamenti, costruisci, totali, sqlControlli, sqlImport, sqlAnnulla, eseguiSql, esitoBlocco
} from './lib.mjs';

// Si importa solo il foglio GYM di Leonardo (decisione 2026-11-06: per Raina niente import).
const FONTE = { gym: 'sheet-gym' };
const NOME_PIANO = { gym: 'Piano dal foglio GYM' };

function opzioni(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    if (['solo-piano', 'senza-piano', 'prova', 'online'].includes(k)) o[k] = true;
    else { if (i + 1 >= argv.length) throw new Error(`Manca il valore di --${k}.`); o[k] = argv[++i]; }
  }
  return o;
}

const fermati = (msg) => { const e = new Error(msg); e.fermo = true; throw e; };
const oggi = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function percorsoFile(o) {
  if (!o.file) fermati('Serve --file (il .xlsx scaricato dal foglio).');
  const f = path.isAbsolute(o.file) || fs.existsSync(o.file) ? path.resolve(o.file) : path.join(CARTELLA_IMPORT, o.file);
  if (!fs.existsSync(f)) fermati(`File non trovato: ${f}`);
  if (dentroRepo(f)) fermati('Il file con i dati veri non deve stare dentro il repository: spostalo in Documenti\\gym-app-import.');
  return f;
}
function percorsoCollegamenti(o, file) {
  const c = o.collegamenti ? path.resolve(o.collegamenti) : path.join(path.dirname(file), `collegamenti-${o.formato}.json`);
  if (dentroRepo(c)) fermati('Il file dei collegamenti non deve stare dentro il repository.');
  return c;
}

/** Legge e controlla tutto, senza database. */
async function analizza(o, { serveCollegamenti = true } = {}) {
  if (o.formato !== 'gym') fermati('Serve --formato gym: si importa solo il foglio GYM di Leonardo.');
  if (o['solo-piano'] && o['senza-piano']) fermati('--solo-piano e --senza-piano insieme non hanno senso.');
  const file = percorsoFile(o);
  const conStorico = !o['solo-piano'];
  const conPiano = !o['senza-piano'];
  let dal = null, al = null;
  if (conStorico) {
    dal = o.dal; al = o.al;
    if (!eData(dal) || !eData(al)) fermati('Servono --dal e --al nel formato aaaa-mm-gg.');
    if (dal > al) fermati('--dal viene dopo --al.');
    if (giorniTra(dal, al) + 1 > TETTO_GIORNI) fermati(`Periodo troppo lungo: al massimo ${TETTO_GIORNI} giorni (3 mesi) per import.`);
    if (giorniTra(oggi(), al) > 1) fermati('--al è nel futuro.');
  }
  const dati = await leggiFile(file, conStorico ? ['PIANO', 'STORICO'] : ['PIANO']);
  controllaFormato(dati, o.formato);
  const piano = leggiPiano(dati.PIANO);          // il piano si legge sempre (serve anche per i muscoli)
  const storico = conStorico ? leggiStorico(dati.STORICO, dal, al) : null;

  // nomi da collegare: quelli del piano (se si importa, o per la bozza) e quelli dello storico nel periodo
  const muscoloPiano = new Map();
  piano.giorni.forEach((g) => g.righe.forEach((r) => { if (!muscoloPiano.has(r.nome)) muscoloPiano.set(r.nome, r.muscolo); }));
  const nomi = new Map(conPiano || serveCollegamenti === 'bozza' ? muscoloPiano : []);
  if (storico) storico.serie.forEach((s) => { if (!nomi.has(s.nome)) nomi.set(s.nome, muscoloPiano.get(s.nome) || ''); });

  const colFile = percorsoCollegamenti(o, file);
  const col = fs.existsSync(colFile) ? JSON.parse(fs.readFileSync(colFile, 'utf8')) : null;
  const probCol = serveCollegamenti === true ? controllaCollegamenti(col, [...nomi.keys()]) : [];

  const sedute = storico ? new Set(storico.serie.map((s) => s.data + '|' + s.giorno)).size : 0;
  const blocchi = [];
  if (conPiano && piano.problemi.errori.length) blocchi.push(`PIANO: ${piano.problemi.errori.length} righe con errori`);
  if (storico && storico.problemi.errori.length) blocchi.push(`STORICO: ${storico.problemi.errori.length} righe con errori`);
  if (storico && sedute === 0) blocchi.push(`Nessuna seduta dal ${dal} al ${al}: mi fermo.`);
  if (conPiano && !piano.giorni.length) blocchi.push('PIANO vuoto.');
  if (probCol.length) blocchi.push(`Collegamenti: ${probCol.length} problemi`);
  return { o, file, dal, al, conPiano, conStorico, piano: conPiano ? piano : null, storico, nomi, col, colFile, probCol, sedute, blocchi };
}

function modelloDa(a, uid) {
  const m = costruisci({ uid, col: a.col, piano: a.piano, serie: a.storico ? a.storico.serie : [], nomePiano: a.o['nome-piano'] || NOME_PIANO[a.o.formato] });
  return { m, tot: totali(m.serie) };
}

// ---------------------------------------------------------------------
// Resoconto (fuori dal repository) e riassunto a schermo (solo numeri)
// ---------------------------------------------------------------------
function resoconto(a, extra = {}) {
  const L = [];
  const lista = (titolo, xs) => {
    if (!xs || !xs.length) return;
    L.push('', `## ${titolo} (${xs.length})`);
    xs.forEach((x) => L.push(`- riga ${x.riga}: ${x.cosa}${x.nome ? ` — "${x.nome}"` : ''}`));
  };
  L.push(`# Resoconto import — ${new Date().toISOString()}`, '', `File: ${a.file}`, `Formato: ${a.o.formato}`,
    `Piano: ${a.conPiano ? 'sì' : 'no'} · Storico: ${a.conStorico ? `dal ${a.dal} al ${a.al}` : 'no'}`, `Collegamenti: ${a.colFile}`);
  if (a.storico) {
    const c = a.storico.conteggi;
    L.push('', '## STORICO', `Righe lette: ${c.righe} · vuote: ${c.vuote} · fuori periodo: ${c.fuoriPeriodo} · serie valide nel periodo: ${a.storico.serie.length} · sedute: ${a.sedute}`);
    lista('STORICO: errori (bloccano l\'import)', a.storico.problemi.errori);
    lista('STORICO: righe saltate', a.storico.problemi.saltate);
    lista('STORICO: avvisi', a.storico.problemi.avvisi);
  }
  if (a.piano) {
    L.push('', '## PIANO', `Giorni: ${a.piano.giorni.length} · esercizi: ${a.piano.giorni.reduce((n, g) => n + g.righe.length, 0)}`);
    a.piano.giorni.forEach((g) => L.push(`- ${g.nome}${g.codice ? ` (${g.codice})` : ''}: ${g.righe.length} esercizi, ${g.righe.reduce((n, r) => n + r.serie, 0)} serie`));
    lista('PIANO: errori (bloccano l\'import)', a.piano.problemi.errori);
    lista('PIANO: righe saltate', a.piano.problemi.saltate);
    lista('PIANO: avvisi', a.piano.problemi.avvisi);
  }
  if (a.probCol.length) { L.push('', `## Collegamenti da sistemare (${a.probCol.length})`); a.probCol.forEach((p) => L.push(`- ${p}`)); }
  if (extra.modello) {
    const { m, tot } = extra.modello;
    lista('Righe con nome segnato "ignora"', m.ignorate);
    L.push('', '## Libreria usata', `Esercizi: ${m.libreria.esercizi.map((e) => e.codice).join(', ') || '-'}`, `Macchine: ${m.libreria.macchine.map((e) => e.codice).join(', ') || '-'}`, `Palestra: ${m.palestra ? m.palestra.nome + ' (privata, principale, con le macchine usate)' : '-'}`);
    if (tot.esercizi.length) {
      L.push('', '## Totali attesi per esercizio', '| esercizio | macchina | serie | reps | volume kg | max kg |', '|---|---|---|---|---|---|');
      tot.esercizi.forEach((e) => L.push(`| ${e.ex} | ${e.mac || ''} | ${e.n} | ${e.reps} | ${e.vol} | ${e.max} |`));
      L.push('', '## Totali attesi per mese', '| mese | sedute | serie | volume kg |', '|---|---|---|---|');
      tot.mesi.forEach((x) => L.push(`| ${x.mese} | ${x.sedute} | ${x.n} | ${x.vol} |`));
    }
  }
  if (extra.esito) L.push('', '## Esito', '```json', JSON.stringify(extra.esito, null, 2), '```');
  if (a.blocchi.length) { L.push('', '## Blocchi'); a.blocchi.forEach((b) => L.push(`- ${b}`)); }
  const nome = `resoconto-import-${a.o.formato}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
  const f = path.join(path.dirname(a.file), nome);
  fs.writeFileSync(f, L.join('\n') + '\n', 'utf8');
  return f;
}

function riassunto(a) {
  if (a.storico) {
    const c = a.storico.conteggi, p = a.storico.problemi;
    console.log(`STORICO ${a.dal} → ${a.al}: ${c.righe} righe lette, ${c.fuoriPeriodo} fuori periodo, ${c.vuote} vuote`);
    console.log(`  nel periodo: ${a.storico.serie.length} serie valide in ${a.sedute} sedute · ${p.errori.length} errori · ${p.saltate.length} saltate · ${p.avvisi.length} avvisi`);
  }
  if (a.piano) {
    const p = a.piano.problemi;
    console.log(`PIANO: ${a.piano.giorni.length} giorni, ${a.piano.giorni.reduce((n, g) => n + g.righe.length, 0)} esercizi · ${p.errori.length} errori · ${p.saltate.length} saltate · ${p.avvisi.length} avvisi`);
  }
  console.log(`Nomi diversi da collegare: ${a.nomi.size} · problemi nei collegamenti: ${a.probCol.length}`);
  a.probCol.slice(0, 12).forEach((p) => console.log(`  - ${p}`));
  if (a.probCol.length > 12) console.log(`  … e altri ${a.probCol.length - 12} (vedi resoconto)`);
}

function stampaControlli(r) {
  // elenco completo (import fatto, verifica) oppure riassunto corto (prova, controlli falliti)
  for (const c of r.controlli || []) console.log(`  ${c.ok ? 'OK ' : 'NO '} ${c.nome}: atteso ${c.atteso}, trovato ${c.trovato}`);
  if (r.controlli_totali !== undefined) console.log(`  controlli OK: ${r.controlli_ok} su ${r.controlli_totali}`);
  for (const c of r.falliti || []) console.log(`  NO  ${c.nome}: atteso ${c.atteso}, trovato ${c.trovato}`);
}

async function trovaUtente(email, online) {
  if (!email) fermati('Serve --email (l\'account in Supabase a cui legare i dati).');
  const q = `select id from auth.users where lower(email) = lower('${String(email).replace(/'/g, "''")}')`;
  const r = eseguiSql(q, { online, sola_lettura: true });
  if (!r.ok) fermati('Non riesco a leggere gli account: ' + r.errore);
  if (r.righe.length !== 1) fermati(`Account non trovato (${r.righe.length} risultati). Crealo prima nel pannello di Supabase.`);
  return r.righe[0].id;
}

async function conferma(testo, parola) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`${testo}\nScrivi ${parola} per continuare: `);
  rl.close();
  if (ans.trim() !== parola) fermati('Annullato: non ho scritto niente.');
}

// ---------------------------------------------------------------------
// Comandi
// ---------------------------------------------------------------------
async function bozza(o) {
  const a = await analizza(o, { serveCollegamenti: 'bozza' });
  const col = a.col || {};
  const nuovi = aggiornaBozza(col, a.nomi);
  fs.writeFileSync(a.colFile, JSON.stringify(col, null, 2) + '\n', 'utf8');
  const stati = Object.values(col.nomi).reduce((acc, n) => ((acc[n.stato] = (acc[n.stato] || 0) + 1), acc), {});
  console.log(`Bozza dei collegamenti: ${a.colFile}`);
  console.log(`Nomi aggiunti: ${nuovi} · totale nomi: ${Object.keys(col.nomi).length} · ${Object.entries(stati).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
  console.log('Controlla ogni nome, poi metti stato "ok" (oppure "ignora").');
}

async function secco(o) {
  const a = await analizza(o);
  riassunto(a);
  const modello = a.blocchi.length ? null : modelloDa(a, '00000000-0000-4000-8000-000000000000');
  const f = resoconto(a, { modello });
  console.log(`Resoconto: ${f}`);
  if (a.blocchi.length) { console.log('PROVA A SECCO: NON PRONTO'); a.blocchi.forEach((b) => console.log(`  - ${b}`)); return 1; }
  const m = modello.m;
  console.log(`PROVA A SECCO: PRONTO · libreria ${m.libreria.esercizi.length} esercizi e ${m.libreria.macchine.length} macchine · ${m.palestra ? 'palestra privata · ' : ''}` +
    `${m.piano ? `piano ${m.piano.giorni.length} giorni e ${m.piano.esercizi.length} esercizi · ` : ''}${m.sedute.length} sedute, ${m.serie.length} serie`);
  return 0;
}

async function importa(o) {
  const online = !!o.online;
  const a = await analizza(o);
  riassunto(a);
  if (a.blocchi.length) { const f = resoconto(a); console.log(`Resoconto: ${f}`); a.blocchi.forEach((b) => console.log(`  - ${b}`)); fermati('Import fermato: prima sistema i problemi (prova a secco).'); }
  const uid = await trovaUtente(o.email, online);
  const modello = modelloDa(a, uid);
  const { m, tot } = modello;
  if (online) {
    await conferma(`ONLINE su gym-app: ${o.prova ? 'PROVA (annullata alla fine)' : 'IMPORT VERO'} per l'account indicato: ` +
      `${m.piano ? `piano con ${m.piano.giorni.length} giorni, ` : ''}${m.sedute.length} sedute, ${m.serie.length} serie. Hai fatto npm run backup?`, o.prova ? 'PROVA' : 'IMPORTA');
  }
  const batch = crypto.randomUUID();
  const controlli = sqlControlli({ uid, dal: a.dal, al: a.al, modello: m, tot });
  const righeLette = (a.storico ? a.storico.conteggi.righe : 0) + (a.piano ? a.piano.giorni.reduce((n, g) => n + g.righe.length, 0) : 0);
  const righeScartate = a.storico ? a.storico.problemi.saltate.length : 0;
  const sql = sqlImport({ uid, email: o.email, batch, fonte: FONTE[o.formato], file: a.file, modello: m, controlli, prova: !!o.prova, righeLette, righeScartate });
  if ((sql.match(/\$imp\$/g) || []).length !== 2) fermati('I dati contengono il testo "$imp$": non posso continuare.');
  const r = eseguiSql(sql, { online });
  let esito;
  if (r.ok) {
    const n = eseguiSql(`select notes from public.import_batches where id = '${batch}'`, { online, sola_lettura: true });
    esito = n.ok && n.righe[0] ? JSON.parse(n.righe[0].notes) : null;
    console.log(`IMPORT FATTO (${online ? 'online' : 'locale'}). import_id: ${batch}`);
  } else {
    const e = esitoBlocco(r.errore);
    esito = e.dati;
    if (e.marcatore === 'IMPORT-PROVA-OK') console.log('PROVA RIUSCITA: tutto annullato, il database è come prima.');
    else if (e.marcatore === 'IMPORT-CONTROLLI-FALLITI') console.log('CONTROLLI FALLITI: tutto annullato, il database è come prima.');
    else { console.log('ERRORE: tutto annullato.'); console.log('  ' + (e.marcatore ? e.testo : r.errore).slice(0, 600)); }
  }
  if (esito) {
    stampaControlli(esito);
    if (esito.nuovi) console.log(`  nuovi: ${Object.entries(esito.nuovi).map(([k, v]) => `${k} ${v}`).join(', ')}${esito.piano_attivo === false ? ' · piano NON attivo (ce n\'era già uno attivo)' : ''}`);
  }
  const f = resoconto(a, { modello, esito: esito || { errore: r.errore } });
  console.log(`Resoconto: ${f}`);
  return r.ok || esitoBlocco(r.errore).marcatore === 'IMPORT-PROVA-OK' ? 0 : 1;
}

async function verifica(o) {
  const online = !!o.online;
  const a = await analizza(o);
  if (a.blocchi.length) { riassunto(a); fermati('Il file ha problemi: la verifica non ha senso finché non sono sistemati.'); }
  const uid = await trovaUtente(o.email, online);
  const modello = modelloDa(a, uid);
  const r = eseguiSql(sqlControlli({ uid, dal: a.dal, al: a.al, modello: modello.m, tot: modello.tot }), { online, sola_lettura: true });
  if (!r.ok) fermati('Verifica non riuscita: ' + r.errore);
  const esito = r.righe[0].risultato;
  const ok = (esito.controlli || []).every((c) => c.ok);
  console.log(`VERIFICA (${online ? 'online' : 'locale'}, sola lettura): ${ok ? 'TUTTO UGUALE' : 'DIFFERENZE'}`);
  stampaControlli(esito);
  console.log(`Resoconto: ${resoconto(a, { modello, esito })}`);
  return ok ? 0 : 1;
}

async function annulla(o) {
  const online = !!o.online;
  if (!/^[0-9a-f-]{36}$/i.test(o['import-id'] || '')) fermati('Serve --import-id (lo trovi nel resoconto dell\'import).');
  const uid = await trovaUtente(o.email, online);
  if (online) await conferma('ONLINE su gym-app: annullo l\'import indicato (cancella le sue sedute, serie e il suo piano).', 'ANNULLA');
  const r = eseguiSql(sqlAnnulla({ uid, email: o.email, batch: o['import-id'] }), { online });
  if (!r.ok) { const e = esitoBlocco(r.errore); console.log('Annullamento non fatto: ' + (e.marcatore ? e.testo : r.errore).slice(0, 600)); return 1; }
  const n = eseguiSql(`select notes from public.import_batches where id = '${o['import-id']}'`, { online, sola_lettura: true });
  const x = n.ok && n.righe[0] ? JSON.parse(n.righe[0].notes).annullato : {};
  console.log(`IMPORT ANNULLATO: ${Object.entries(x || {}).map(([k, v]) => `${k} ${v ?? '-'}`).join(', ')}`);
  return 0;
}

const COMANDI = { bozza, secco, importa, verifica, annulla };
try {
  const o = opzioni(process.argv.slice(2));
  const cmd = COMANDI[o._[0]];
  if (!cmd) { console.log('Comandi: bozza, secco, importa, verifica, annulla. Guida: docs/import.md'); process.exit(1); }
  process.exitCode = (await cmd(o)) || 0;
} catch (e) {
  console.error(e.fermo ? `FERMO: ${e.message}` : `ERRORE: ${e.message}`);
  process.exitCode = 1;
}
