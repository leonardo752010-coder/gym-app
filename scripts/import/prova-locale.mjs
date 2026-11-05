// Prova completa dell'import SOLO sul database locale, con dati finti.
// Uso: npm run import:prova   (serve Docker Desktop acceso e il database locale avviato: npm run db:start)
// Crea due utenti finti, prova bozza, prova a secco, import, verifica, rilancio, modifica, palestra, separazione,
// annullamento e cancellazione di un account; alla fine cancella i suoi utenti finti e la sua libreria "prova-...".
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { REPO, eseguiSql } from './lib.mjs';
import { creaDatiFinti, CARTELLA } from './dati-finti.mjs';

const UNO = 'bbbbbbbb-0000-4000-8000-000000000001', DUE = 'bbbbbbbb-0000-4000-8000-000000000002';
const EMAIL_UNO = 'import.uno@example.test', EMAIL_DUE = 'import.due@example.test';
const F = (n) => path.join(CARTELLA, n);
const PERIODO = ['--dal', '2026-10-30', '--al', '2026-11-06'];
const GYM = (file, ...altro) => ['--file', F(file), '--formato', 'gym', ...PERIODO, ...altro];
let fatti = 0, falliti = 0;

function ok(cond, cosa) {
  if (cond) { fatti++; console.log(`  ok   ${cosa}`); } else { falliti++; console.log(`  NO   ${cosa}`); }
}
function cmd(...args) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'import', 'import.mjs'), ...args], { encoding: 'utf8' });
  return { codice: r.status, testo: (r.stdout || '') + (r.stderr || '') };
}
function q(sql) {
  const r = eseguiSql(sql);
  if (!r.ok) throw new Error('SQL: ' + r.errore);
  return r.righe;
}
const n = (sql) => Number(Object.values(q(sql)[0])[0]);
// Esegue un blocco DO che restituisce i suoi numeri con un'eccezione RISULTATO {json} (e quindi non lascia tracce).
function blocco(corpo) {
  const r = eseguiSql(`do $p$ declare j jsonb; begin ${corpo} raise exception 'RISULTATO %', j::text; end $p$`);
  const m = String(r.errore || '').match(/RISULTATO (\{.*\})/s);
  if (!m) throw new Error('Blocco: ' + (r.errore || 'nessun risultato'));
  return JSON.parse(m[1]);
}
const vista = (uid, conti) => blocco(`perform set_config('request.jwt.claims', json_build_object('sub', '${uid}', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  j := jsonb_build_object(${Object.entries(conti).map(([k, v]) => `'${k}', (${v})`).join(', ')});`);
function pulisciTutto() {
  q(`delete from auth.users where id in ('${UNO}', '${DUE}')`);   // via anche piani, sedute, import e palestre private
  q(`delete from public.machines where code like 'prova-%' and not exists (select 1 from public.session_exercises se where se.machine_id = machines.id)`);
  q(`delete from public.exercises where code like 'prova-%' and not exists (select 1 from public.plan_exercises pe where pe.exercise_id = exercises.id)
       and not exists (select 1 from public.session_exercises se where se.exercise_id = exercises.id)`);
}

console.log('Prova locale dell\'import (dati finti)');
const vivo = eseguiSql('select 1 as uno', { sola_lettura: true });
if (!vivo.ok) { console.log('Il database locale non risponde. Avvia Docker Desktop e poi: npm run db:start'); process.exit(1); }

await creaDatiFinti();
pulisciTutto();
q(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '${UNO}', 'authenticated', 'authenticated', '${EMAIL_UNO}', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Import Uno"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '${DUE}', 'authenticated', 'authenticated', '${EMAIL_DUE}', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Import Due"}', now(), now())`);

try {
  console.log('1. Bozza dei collegamenti');
  fs.rmSync(F('bozza-gym.json'), { force: true });
  let r = cmd('bozza', ...GYM('gym-pulito.xlsx', '--collegamenti', F('bozza-gym.json')));
  const bg = JSON.parse(fs.readFileSync(F('bozza-gym.json'), 'utf8'));
  ok(r.codice === 0 && Object.keys(bg.nomi).length === 6, 'bozza: 6 nomi (5 del piano, senza "[ ]" e senza la riga a 0 serie, + 1 nome cambiato nello storico)');
  ok(!bg.nomi['Leg extension'], 'la riga del piano con 0 serie non entra nella bozza');
  ok(bg.nomi['Hammer Strenght Select chest press'].macchina === bg.nomi['Hammer Strength Select chest press'].macchina &&
     bg.macchine[bg.nomi['Hammer Strength Select chest press'].macchina].marca === 'Hammer Strength Select', 'marca riconosciuta e "Strenght" corretto: stesso esercizio e stessa macchina');
  ok(Object.values(bg.nomi).every((x) => x.stato === 'da controllare'), 'ogni nome nasce "da controllare"');
  ok(bg.esercizi[bg.nomi['Pulldown presa larga'].esercizio].muscolo === 'lats', '"back" + pulldown -> lats');
  r = cmd('secco', ...GYM('gym-pulito.xlsx', '--collegamenti', F('bozza-gym.json')));
  ok(r.codice === 1 && /NON PRONTO/.test(r.testo), 'con la bozza non controllata la prova a secco si ferma');

  console.log('2. Prova a secco');
  r = cmd('secco', ...GYM('gym-sporco.xlsx'));
  ok(r.codice === 1 && /· 5 errori/.test(r.testo), 'file sporco: 5 errori, non pronto');
  r = cmd('secco', ...GYM('gym-pulito.xlsx'));
  ok(r.codice === 0 && /11 serie valide in 3 sedute/.test(r.testo) && /PIANO: 2 giorni, 5 esercizi · 0 errori · 2 saltate/.test(r.testo),
    'file pulito: 11 serie in 3 sedute; piano 5 esercizi, 2 righe saltate ("[ ]" e 0 serie)');
  r = cmd('secco', '--file', F('gym-pulito.xlsx'), '--formato', 'gym', '--dal', '2026-09-01', '--al', '2026-09-30');
  ok(r.codice === 1 && /Nessuna seduta/.test(r.testo), 'nessuna seduta nel periodo: si ferma');
  r = cmd('secco', '--file', F('gym-pulito.xlsx'), '--formato', 'gym', '--dal', '2026-01-01', '--al', '2026-11-06');
  ok(r.codice === 1 && /troppo lungo/.test(r.testo), 'più di 3 mesi: si ferma');
  r = cmd('secco', '--file', F('comeback.xlsx'), '--formato', 'gym', '--solo-piano');
  ok(r.codice === 1 && /THE COMEBACK/.test(r.testo), 'foglio nel formato di Raina: rifiutato');
  r = cmd('secco', '--file', F('comeback.xlsx'), '--formato', 'comeback', '--solo-piano');
  ok(r.codice === 1 && /solo il foglio GYM/.test(r.testo), '--formato comeback: non esiste più');

  console.log('3. Import di prova (annullato alla fine)');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', EMAIL_UNO, '--prova'));
  ok(r.codice === 0 && /PROVA RIUSCITA/.test(r.testo) && !/ NO /.test(r.testo), 'prova riuscita, tutti i controlli OK');
  ok(n(`select count(*) from public.import_batches where user_id = '${UNO}'`) + n(`select count(*) from public.plans where user_id = '${UNO}'`)
     + n(`select count(*) from public.clubs where created_by = '${UNO}'`) === 0, 'dopo la prova il database è come prima (niente import, piano, palestra)');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', 'nessuno@example.test'));
  ok(r.codice === 1 && /Account non trovato/.test(r.testo), 'account che non esiste: si ferma');

  console.log('4. Import vero (locale) su Import Uno');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', EMAIL_UNO));
  const id1 = (r.testo.match(/import_id: ([0-9a-f-]{36})/) || [])[1];
  ok(r.codice === 0 && id1 && /serie 11/.test(r.testo), 'import fatto: 11 serie nuove');
  ok(n(`select count(*) from public.sets where user_id = '${UNO}'`) === 11 && n(`select count(*) from public.sessions where user_id = '${UNO}'`) === 3, 'nel database: 11 serie, 3 sedute');
  ok(n(`select count(*) from public.plans where user_id = '${UNO}' and is_active`) === 1 && n(`select count(*) from public.plan_exercises where user_id = '${UNO}'`) === 5,
    'piano attivo con 5 esercizi (righe a 0 serie saltate)');
  ok(n(`select coalesce(sum(sets), 0) from public.plan_exercises where user_id = '${UNO}'`) === 13, '13 serie a settimana nel piano');
  ok(n(`select count(*) from public.sets s join public.session_exercises se on se.id = s.session_exercise_id join public.machines m on m.id = se.machine_id
        where s.user_id = '${UNO}' and m.code like 'prova-hammer%'`) === 3, 'le 3 serie della chest press (due nomi diversi) sulla stessa macchina');
  ok(n(`select count(*) from public.machines where code like 'prova-hammer%' and brand_code = 'X100'`) === 1, 'codice della macchina salvato');
  ok(n(`select count(*) from public.sets where user_id = '${UNO}' and input_unit = 'lb' and input_weight = 220 and weight_kg = 99.79`) === 2, 'serie in lb: 220 lb scritti, 99,79 kg salvati');
  ok(n(`select count(*) from public.sets where user_id = '${UNO}' and notes = 'spalla ok'`) === 1 && n(`select count(*) from public.session_exercises where user_id = '${UNO}' and notes is not null`) === 0,
    'nota personale importata, nota del piano no');
  ok(n(`select count(*) from public.sets where user_id = '${UNO}' and performed_at = timestamptz '2026-11-02 12:00:00 Pacific/Auckland'`) === 2, 'senza Timestamp: ora 12:00 del giorno della seduta');
  ok(n(`select count(*) from public.sessions where user_id = '${UNO}' and plan_id is null`) === 3, 'sedute senza piano');
  ok(n(`select count(*) from public.plan_exercises pe join public.exercises e on e.id = pe.exercise_id where pe.user_id = '${UNO}' and e.code like 'prova-pulldown%' and rir_min = 1 and rir_max = 2`) === 1,
    'RIR diventato data nel foglio ("1-2") letto bene');

  console.log('5. Palestra');
  const club = q(`select id from public.clubs where created_by = '${UNO}' and name = 'Palestra Finta' and visibility = 'private'`);
  ok(club.length === 1, 'palestra privata creata, una sola');
  const C = club[0]?.id;
  ok(n(`select count(*) from public.user_clubs where user_id = '${UNO}' and club_id = '${C}' and is_home`) === 1, 'è la palestra principale');
  ok(n(`select count(*) from public.club_machines where club_id = '${C}'`) === 1, 'con la sua macchina');
  ok(n(`select count(*) from public.plan_exercise_machines where user_id = '${UNO}' and club_id = '${C}'`) === 1, 'nel piano: macchina per palestra sull\'esercizio che ne ha una');
  ok(n(`select count(*) from public.sessions where user_id = '${UNO}' and club_id = '${C}'`) === 3, 'le 3 sedute sono nella palestra');

  console.log('6. Verifica in sola lettura e rilancio');
  r = cmd('verifica', ...GYM('gym-pulito.xlsx', '--email', EMAIL_UNO, '--senza-piano'));
  ok(r.codice === 0 && /TUTTO UGUALE/.test(r.testo), 'verifica: tutto uguale');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', EMAIL_UNO));
  ok(r.codice === 1 && /già stato importato/.test(r.testo), 'rilancio con il piano: si ferma (piano già importato)');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', EMAIL_UNO, '--senza-piano'));
  ok(r.codice === 0 && /serie 0/.test(r.testo), 'rilancio senza piano: 0 serie nuove, nessun doppione');
  ok(n(`select count(*) from public.sets where user_id = '${UNO}'`) === 11 && n(`select count(*) from public.clubs where created_by = '${UNO}'`) === 1, 'sempre 11 serie e una palestra');
  r = cmd('importa', ...GYM('gym-modificato.xlsx', '--email', EMAIL_UNO, '--senza-piano'));
  ok(r.codice === 1 && /CONTROLLI FALLITI/.test(r.testo), 'serie cambiata nel foglio dopo l\'import: controlli falliti');
  ok(n(`select count(*) from public.import_batches where user_id = '${UNO}'`) === 2 && n(`select count(*) from public.sets where user_id = '${UNO}' and weight_kg = 42`) === 0,
    'e non resta niente dell\'import fallito');

  console.log('7. Seconda persona e separazione (con le regole di accesso, come nell\'app)');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', EMAIL_DUE));
  ok(r.codice === 0 && n(`select count(*) from public.sets where user_id = '${DUE}'`) === 11, 'stesso file su Import Due: 11 serie sue, ID diversi');
  ok(n(`select count(*) from public.clubs where name = 'Palestra Finta'`) === 2, 'ognuno ha la sua palestra privata');
  const v1 = vista(UNO, { serie: 'select count(*) from public.sets', piani: 'select count(*) from public.plans', palestre: 'select count(*) from public.clubs where name = \'Palestra Finta\'',
    import_altrui: `select count(*) from public.import_batches where user_id <> '${UNO}'` });
  ok(v1.serie === 11 && v1.piani === 1 && v1.palestre === 1 && v1.import_altrui === 0, 'Uno vede solo le sue 11 serie, il suo piano, la sua palestra');
  const v2 = vista(DUE, { serie: 'select count(*) from public.sets', piani: 'select count(*) from public.plans', palestre: 'select count(*) from public.clubs where name = \'Palestra Finta\'',
    serie_altrui: `select count(*) from public.sets where user_id <> '${DUE}'` });
  ok(v2.serie === 11 && v2.piani === 1 && v2.palestre === 1 && v2.serie_altrui === 0, 'Due vede solo le sue cose');

  console.log('8. Annullamento');
  r = cmd('annulla', '--import-id', id1, '--email', EMAIL_DUE);
  ok(r.codice === 1, 'annullare l\'import di Uno con l\'account di Due: rifiutato');
  r = cmd('annulla', '--import-id', id1, '--email', EMAIL_UNO);
  ok(r.codice === 0 && /IMPORT ANNULLATO/.test(r.testo), 'annullamento fatto');
  ok(n(`select count(*) from public.sets where user_id = '${UNO}'`) === 0 && n(`select count(*) from public.sessions where user_id = '${UNO}'`) === 0 &&
     n(`select count(*) from public.plans where user_id = '${UNO}'`) === 0, 'Uno: 0 serie, 0 sedute, 0 piani');
  ok(n(`select count(*) from public.clubs where created_by = '${UNO}'`) === 1, 'la palestra resta (come la libreria)');
  ok(n(`select count(*) from public.sets where user_id = '${DUE}'`) === 11, 'i dati di Due sono intatti');
  ok(n(`select count(*) from public.import_batches where id = '${id1}' and status = 'rolled-back'`) === 1, 'registro: import segnato come annullato');
  r = cmd('annulla', '--import-id', id1, '--email', EMAIL_UNO);
  ok(r.codice === 1, 'annullare due volte: rifiutato');

  console.log('9. Cancellare un account che ha dati importati');
  r = cmd('importa', ...GYM('gym-pulito.xlsx', '--email', EMAIL_UNO));
  ok(r.codice === 0 && n(`select count(*) from public.sets where user_id = '${UNO}'`) === 11, 'reimport dopo l\'annullamento: di nuovo 11 serie, stessa palestra');
  ok(n(`select count(*) from public.clubs where created_by = '${UNO}'`) === 1, 'nessuna palestra doppia');
  const del = eseguiSql(`delete from auth.users where id = '${UNO}'`);
  ok(del.ok, 'l\'account si cancella (migrazione 20261106120000)');
  ok(n(`select (select count(*) from public.sets where user_id = '${UNO}') + (select count(*) from public.import_batches where user_id = '${UNO}')
       + (select count(*) from public.clubs where created_by = '${UNO}')`) === 0, 'non restano serie, import né palestra di quell\'account');
} finally {
  pulisciTutto();
  console.log('Pulizia: utenti finti e libreria "prova-..." tolti dal database locale.');
}
console.log(`\nRisultato: ${fatti} ok, ${falliti} falliti`);
process.exitCode = falliti ? 1 : 0;
