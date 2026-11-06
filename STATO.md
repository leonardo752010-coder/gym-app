# Stato

Aggiornato: 2026-11-06, notte: CHOOSE YOUR STARTER pubblicato (deploy delle 21:41) (Claude)

## Branch

Branch attuale: `claude/app-v1` (nato da `claude/database`): app v1 come PWA nella cartella `app/`, **pubblicata** su https://gym-app.gym-app-pwa.workers.dev. I lavori fino al commit `d23994a` (seduta nuova, "Fine seduta", inglese) sono su GitHub e online. **CHOOSE YOUR STARTER** è in due commit su `claude/app-v1` (`c8a2617` e `701b3d9`, mascotte vere), **su GitHub** dal 2026-11-06 (push con l'ok di Leonardo, senza force push). Migrazione applicata online su `gym-app` (2026-11-06, 21:36). App con CHOOSE YOUR STARTER **pubblicata** con `npm run deploy` (2026-11-06, versione "06/11/2026 21:41"), con l'ok di Leonardo.

| Branch | Cosa contiene |
| --- | --- |
| `claude/app-v1` | Tutto `claude/database` + app v1 (PWA) in `app/`, guida `docs/app.md`, decisioni in `DECISIONI.md`, regola "niente cancellazioni senza ok" in `CLAUDE.md`. Su GitHub fino a `701b3d9` (compresi i due commit di CHOOSE YOUR STARTER) |
| `main` | Cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento (`docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md`, `CLAUDE.md`) |
| `claude/database` | Tutto `main` + fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`) + copia dell'app attuale (`HANDOFF.md`, `apps-script/`) + database Supabase (migrazioni, prove, `docs/database.md`) + regola "Aggiornare STATO.md" in `CLAUDE.md` + sistema di backup (`scripts/backup.ps1`, `docs/backup.md`) + accesso locale allineato (iscrizioni chiuse in `supabase/config.toml`) + import dai fogli del passo 3 (`scripts/import/`, `docs/import.md`, migrazione `20261106120000`) |
| `claude/fondamenta` | Solo le fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`). Già tutto dentro `claude/database` |
| `codex/handoff-2026-11-05` | Copia dell'app attuale Google Apps Script + `HANDOFF.md` (commit 02d342f). Già tutto dentro `claude/database` |
| `handoff/codex-2026-11-05` | Versione precedente dello stesso handoff (commit 0816122). Già tutto dentro `claude/database` |
| `claude/nota-funzioni` | Fondamenta + handoff + nota su funzioni. La nota è già su `main`, il resto è in `claude/database` |
| `claude/nota-funzioni-main` | Uguale a `main` (commit 741d456) |

## Fatto in questa sessione (CHOOSE YOUR STARTER)

- **Deploy (2026-11-06, 21:41), con l'ok di Leonardo**: git pulito e allineato con GitHub (`5f10f6d`); accesso a Cloudflare valido (`wrangler whoami`); migrazione `20261107090000` già online (controllato in sola lettura); `npm test` 81 su 81; build di produzione controllata (solo gym-app, nessuna chiave segreta, nessun indirizzo del database locale; la parola `sb_secret_` è solo un controllo dentro la libreria supabase-js). `npm run deploy`: riuscito, 7 file nuovi caricati (pagina, JS, CSS, `sw.js`, tre mascotte). Verifica online: pagina, `sw.js` e manifest rispondono 200; le tre mascotte (`gorilla`, `lion`, `tiger` .png) sono nella lista dei file per l'uso offline e rispondono 200 come `image/png`. Piano gratuito di Cloudflare: nessun costo.
- **Migrazione online, fase B (2026-11-06, 21:36), con l'ok di Leonardo**: CLI collegata a `gym-app` (controllato); dry-run di nuovo con solo `20261107090000_profiles_starter.sql`; backup `gym-app_2026-11-06_2135` (struttura 95,5 KB, dati 86,6 KB; 333 righe, 9 migrazioni; nessun backup cancellato, ora sono 6); `npx supabase db push --remote=<ref di gym-app> --yes`: **applicata**, nessun errore. Verifica in sola lettura: colonna `profiles.starter` presente (testo, controllo gorilla/lion/tiger), migrazione registrata; 2 profili, tutti e 2 con starter vuoto (null). Nessun dato toccato.
- **Migrazione online, fase A (2026-11-06, 20:39)**: CLI collegata a `gym-app` (controllato). File della migrazione controllato: solo colonna, controllo dei valori, commento. Backup `gym-app_2026-11-06_2039` (struttura 95,5 KB, dati 86,4 KB; 332 righe, 9 migrazioni; nessun backup cancellato, ora sono 5). Dry-run (`npx supabase db push --remote=<ref di gym-app> --dry-run`): verrebbe applicata **solo** `20261107090000_profiles_starter.sql`. **Niente applicato online**, niente commit.

- **Fase 1 (sola lettura)**: l'app non ha un onboarding e non ha schermate Program e Progress (solo seduta + menu). Un solo progetto Supabase: `gym-app`. Piano approvato da Leonardo con le sue decisioni (in `DECISIONI.md`).
- **Migrazione** `supabase/migrations/20261107090000_profiles_starter.sql`: colonna `profiles.starter` (testo, null = non scelto), controllo `gorilla` / `lion` / `tiger`, commento. Nessun trigger, nessuna regola di blocco. Applicata prima al database locale (`npx supabase migration up`, senza reset; 4 profili prima e dopo), poi **online su `gym-app`** (fase B, sotto).
- **App**: schermata CHOOSE YOUR STARTER a tutto schermo (tre carte, tocco, Conferma, poi la seduta), solo dopo che il server ha detto "vuoto"; scelta salvata sul telefono e inviata appena c'è rete, senza doppioni (scrive solo se online è ancora vuoto); "Esci" bloccato finché non è inviata; piccola immagine nel menu accanto all'account. Lettura dello starter separata dal piano: se fallisce, la seduta funziona lo stesso.
- File nuovi: `app/src/starter.js`, `app/src/assets/starters/` (immagini), `app/tests/unit/starter.test.js`. Modificati: `api.js`, `main.js`, `i18n.js`, `styles.css`, `tests/locale/supabase.test.js`, `scripts/e2e.mjs`, `docs/app.md`, `docs/database.md`, `DECISIONI.md`.
- Commit `c8a2617` (con SVG segnaposto), poi `701b3d9` con le mascotte vere (sotto). Tutti e due **pubblicati su GitHub** (push con l'ok di Leonardo, senza force push; branch allineato: locale e GitHub su `701b3d9`).
- **Mascotte vere** (fase 3): l'originale di Leonardo (nella radice si chiamava `Vintage Trio Gym Mascots.png`, con gli spazi; 2172 × 724, sfondo **già trasparente**) ora è in `docs/immagini/`. Ritagliate in `gorilla.png` (130 KB), `lion.png` (138 KB), `tiger.png` (128 KB), 480 px di altezza, tagli nelle colonne vuote (55–723, 756–1412, 1446–2129) con 8 px di margine, stessa scala; tolti solo il velo quasi invisibile (alfa ≤ 16) e 1 pixel isolato. I tre SVG segnaposto tolti (ok di Leonardo); nessun riferimento rimasto. Stili: `object-fit: contain` sulle carte e nel menu (niente deformazioni, niente ritaglio a cerchio).
- **Prove, tutte verdi**: logica 81 (67 + 14), database locale dall'app 25 (17 + 8), browser 69 (58 + 11: starter non leggibile → niente schermata, schermata con server vuoto, mascotte PNG caricate senza deformazioni, scelta offline, "Esci" bloccato, invio al ritorno della rete, la schermata non torna, immagine nel menu), database 110 su 110, `db lint` nessun errore. Screenshot: `app/tests/out/11-starter.png`, `app/tests/out/12-menu-starter.png`.
- Nessun dato online toccato, nessun deploy, niente cancellato oltre ai tre SVG segnaposto (con ok). Gli atleti finti delle prove sono creati e cancellati dalle prove stesse, solo in locale.

## Prima, oggi (tasto "Fine seduta" e controllo inglese)

### Tasto "Fine seduta" (decisione di Leonardo)

- **Controllo (sola lettura)**: `ended_at` esiste; l'atleta può già modificare le sue sedute (permesso `update` e regola `sessions_update`); il database rifiuta una fine prima dell'inizio. La coda offline invia già le modifiche (upsert sulla stessa riga, l'ultima versione vince, sedute prima di esercizi e serie). **Nessuna migrazione, nessuna modifica online.**
- **Fatto** (solo in locale): tasto "Fine seduta" in fondo alla seduta, sotto "Prossimo", separato e con aspetto diverso; compare solo dopo la prima serie. Scrive `ended_at` (mai prima dell'ultima serie), non cancella niente. Dopo: schermata vuota con "Seduta chiusa alle HH:MM · Riapri". Serie dopo la chiusura → seduta nuova. Funziona offline. Spazio in fondo alla pagina aumentato perché il timer di recupero non stia vicino al tasto.
- File: `app/src/session.js` (closeSession, reopenSession), `logic.js` (reopenable), `main.js`, `styles.css`, `i18n.js`; guida in `docs/app.md`; `DECISIONI.md`.
- Le 3 ore dopo mezzanotte: **restano per ora** (decisione di Leonardo); se ne riparla dopo qualche settimana di uso vero.

### Controllo inglese (decisione di Leonardo: lingua automatica)

- **Controllo (sola lettura)**: con il telefono in cinese l'app era già in inglese. Nomi nel database online (letti, nessuna scrittura): 22 esercizi, 19 muscoli, tutti con l'inglese (3 uguali in tutte e due le lingue: Hack squat, Leg extension, Leg press); 20 macchine senza nome, l'app mostra marca · modello · codice. **Nessuna modifica al database.**
- **Corretto nel codice**: inglese neozelandese (`en-NZ`, prima `en-GB`); date con l'anno quando non è quello di oggi; versione dell'app in giorno/mese/anno; pagina con `lang="en"` di base; manifest in inglese; messaggi che erano solo in italiano (configurazione mancante, "Sync", "back", errore generico); un errore di salvataggio che diceva "Accesso non riuscito" (ora "Salvataggio non riuscito" / "Could not save").

### Prove (tutte verdi)

- Logica: 67 (50 + 10 "Fine seduta" in `app/tests/unit/fine-seduta.test.js` + 7 lingua in `app/tests/unit/i18n.test.js`). Sul codice dell'ultimo commit 15 delle 17 nuove falliscono; le 2 che passano controllano cose già giuste (ripiego inglese, nomi dal database).
- Database locale (app): 17 (14 + 3: chiusura e riapertura anche offline, un altro atleta non può chiudere, fine prima dell'inizio rifiutata).
- Browser: 58 (43 + 15: due telefoni con chiusura online, offline, Riapri, doppia chiusura, chiusa sull'altro telefono, senza serie, seduta nuova dopo la chiusura, distanza dal timer; telefono in cinese). Sul codice dell'ultimo commit la prova si ferma già alla sezione 11 (mezzanotte).
- Database: 110 su 110. `db lint`: nessun errore.
- Solo atleti finti nel database locale. Online solo lettura dei conteggi dei nomi.

## Prima, oggi (controllo: fine seduta e seduta nuova)

Problema segnalato da Leonardo: nella vecchia app le serie restavano e la settimana dopo andavano cancellate a mano.

- **Controllo (sola lettura)**: la nuova app non ha questo problema. La seduta è legata a data + giorno del piano: la settimana dopo lo stesso giorno parte vuoto e la seduta vecchia è la volta scorsa. Nessun tasto "fine seduta". Aprire l'app non crea sedute.
- **Due problemi trovati e corretti** (solo in locale, `app/src/logic.js`, `session.js`, `main.js`):
  1. Allenamento a cavallo della mezzanotte: dopo le 00:00 l'app cambiava giorno del piano (rotazione) e le serie finivano in una seduta nuova di un altro giorno. Ora la seduta resta in corso per 3 ore dopo l'ultima serie.
  2. Due telefoni (o due schede) senza rete che iniziano la stessa seduta: le serie di uno dei due sparivano dalla schermata e comparivano come "volta scorsa · oggi". Ora l'app le mostra insieme; nel database restano due sedute, niente si cancella.
- Regola scritta in `docs/app.md` ("Quando inizia una seduta nuova") e in `DECISIONI.md`.
- **Prove nuove**: 13 prove della logica e del salvataggio (`tests/unit/seduta-nuova.test.js`: settimana dopo, doppia apertura, seduta a metà, cambio giorno, mezzanotte, seduta chiusa, offline, due telefoni) e 16 controlli nel browser (`scripts/e2e.mjs`, sezioni 9-11, con l'orologio del browser spostato e la rete spenta: nessuna data futura arriva nemmeno al database locale).
- **Risultati**: 50 prove della logica (37 + 13), 14 sul database locale, 43 nel browser (27 + 16), 110 del database: tutte verdi.
- Nessun dato online toccato, nessuna migrazione, nessuna cancellazione. Dati usati: solo atleti finti nel database locale (creati e cancellati dalle prove).

## Sessione precedente (passo 4: app v1 come PWA)

### Dopo l'ok di Leonardo allo STOP 1

1. Backup `gym-app_2026-11-06_1258` (299 righe, 9 migrazioni; nessun backup cancellato, ora sono 4).
2. Chiave **pubblica** (`sb_publishable_`) di gym-app in `app/src/config.js`, letta con lo strumento Supabase che dà solo le chiavi pubbliche. Prova sulle chiavi: verde. Nel build pubblicato: nessuna chiave segreta, solo gym-app.
3. Regola nuova in `CLAUDE.md`: niente cancellazioni di database o file, anche locali, senza ok; mai `--no-backup`.
4. Accesso a Cloudflare controllato (`wrangler whoami`: valido). Wrangler 4.158 manda i comandi "pages" alla nuova versione di Pages dentro Workers: aggiunto `app/wrangler.jsonc`, pubblicata con `npm run deploy` su **https://gym-app.gym-app-pwa.workers.dev**. Il primo tentativo (`pages project create`) non ha creato niente.
5. Verifica online in sola lettura (nessun accesso con account): il certificato HTTPS del nuovo indirizzo è arrivato dopo circa 2 minuti; pagina di accesso, service worker attivo e file in cache, intestazioni di sicurezza attive; senza accesso Supabase rifiuta la lettura (401), come deve.
6. Nessun dato scritto online, nessuna modifica al database.

### Fino allo STOP 1

- Nuovo branch `claude/app-v1`. App in `app/` (guida: `docs/app.md`; scelte: `DECISIONI.md`, 2026-11-06 "App v1").
- **Tecnologia**: JavaScript semplice + Vite + `supabase-js`; serie salvate prima sul telefono (IndexedDB) con coda di invio; service worker per aprirsi senza rete. Grafica di `web-app.html` (logo, giorni, giorno/notte, modifica serie, timer), più: suggerimento in grande, volta scorsa piccola, macchina e salti di peso, stato del salvataggio sotto "ALLENAMENTO", menu toccando il logo (account, memoria del telefono, lingua, invia ora, esci).
- **Hosting scelto: Cloudflare** (gratis; limiti verificati oggi sulle pagine ufficiali). GitHub Pages scartato (gratis solo con repository pubblico; e `github.io/gym-app` serve ancora l'app attuale).
- **Prove, tutte verdi**: 37 prove della logica e della coda (`npm test`), 14 prove sul database locale (`npm run test:locale`: accesso, isolamento tra atleti, iscrizioni chiuse, volta scorsa, offline, risposta persa, due telefoni), 27 controlli nel browser (`npm run test:e2e`: accesso, suggerimento, salvataggio in 15 ms, riapertura senza rete in circa 25 ms, modifica offline, sincronizzazione senza doppioni, eliminazione morbida). Le 110 prove del database: ancora 110 su 110.
- Problemi trovati con le prove e corretti: file dell'app non trovati nella cache senza rete; invio non ripartito subito al ritorno della rete; richieste appese con poco segnale (ora tempo massimo 15 secondi).
- **Database locale ricreato**: fermando i servizi locali ho usato per sbaglio `--no-backup`, che cancella il database **locale** di prova. Conteneva solo migrazioni e dati finti; ricreato identico con `npx supabase start` (9 migrazioni + `seed.sql`), 110 prove verdi. Online nessun effetto.
- Nel database locale c'è un atleta finto per provare a mano (`npm run dati-finti`; email e password in `app/.env.locale`, ignorato da git). Le prove automatiche creano e cancellano i loro utenti finti.
- Nessuna modifica al database (nessuna migrazione nuova). Nessun dato finto online. Nel repository solo la chiave **pubblica** di gym-app (in `app/src/config.js`, aggiunta dopo l'ok).

## Sessione precedente (passo 3: import del piano e dell'ultima settimana)

- Piano del passo 3 scritto e approvato da Leonardo, con le sue decisioni (in `DECISIONI.md`, 2026-11-06 "Import"): storico di Leonardo solo dal 2026-10-30 al 2026-11-06; tetto di 3 mesi per import futuri.
- **Correzione di scopo (Leonardo, dopo):** Raina **niente import** (né storico né piano). Di Leonardo solo il piano attuale e la settimana 30 ottobre - 6 novembre. Palestra: solo quella attuale, privata di Leonardo (il nome sta solo nel file dei collegamenti, fuori dal repository). Righe del piano con 0 serie: saltate. "Ultima seduta di ogni esercizio": non si fa, resta un'idea futura (in `DECISIONI.md`).
- **Script di import** in `scripts/import/` (guida: `docs/import.md`): comandi `bozza`, `secco`, `importa` (anche `--prova`), `verifica`, `annulla`. Si lancia con `npm run import -- ...`. Crea la palestra privata (principale, con le macchine usate, legata al piano e alle sedute) e salva il codice della macchina. Rifiuta il foglio di Raina. Aggiunta la libreria `exceljs` solo per lo sviluppo (npm segnala 2 avvisi "moderate" su `uuid`, dentro exceljs: riguardano una funzione che lo script non usa).
- **Prova completa con dati finti** (`npm run import:prova`): 52 controlli su 52 ok in locale. File finti in `tests/out/import` (ignorata da git); nessun nome del foglio vero nei dati finti.
- **Prova generale in locale con il file vero** (`importa --prova` su un utente finto del database locale, tutto annullato alla fine): 13 controlli su 13 OK (66 serie, 5 sedute, piano con 50 serie a settimana, palestra con 20 macchine). Database locale tornato com'era.
- **Problema trovato e corretto (solo in locale)**: un account con dati importati non si poteva cancellare (errore sul collegamento all'import). Nuova migrazione `20261106120000_import_fk_deferred.sql`: il controllo si fa a fine transazione. Prove del database: 110 su 110 verdi (4 nuove in `050_imports`). `db lint`: nessun errore. Applicata anche online (vedi sotto).
- **Prova a secco sui file veri** (Leonardo li ha mandati; copiati in `Documenti\gym-app-import\`, gli originali restano in Download). Solo lettura, nessun database:
  - foglio GYM: nel periodo 66 serie in 5 sedute, 0 errori, tutte in kg, tutte con RIR; tutti i 24 esercizi del piano con serie hanno serie nel periodo. PIANO: 4 giorni, 30 righe (3 con 0 serie, saltate → 27 esercizi).
  - Collegamenti: elenco corto in `Documenti\gym-app-import\collegamenti-gym.json`, corretto da Leonardo (STOP 1): 24 nomi → 22 esercizi, 20 macchine, palestra. La bozza automatica è salvata accanto (`collegamenti-gym.bozza-automatica.json`).
  - **Prova a secco: PRONTO.**
  - Il foglio di Raina (`comeback.xlsx`) e la sua bozza restano nella cartella ma non si usano.
- **Online, con un solo ok di Leonardo per tutta la sequenza** (solo `gym-app`):
  1. Account di Leonardo controllato in sola lettura: esiste una volta sola (l'aveva già creato lui: STATO.md diceva 0 utenti, era vecchio).
  2. Backup `gym-app_2026-11-06_1212` (prima: 0 dati di allenamento).
  3. Migrazione: `--dry-run` mostrava solo `20261106120000`; applicata. I 5 collegamenti all'import ora si controllano a fine transazione (verificato).
  4. Prova generale online (annullata): 13 controlli su 13 OK; dopo, database ancora vuoto (verificato). Trovato e corretto un problema dello script: online l'API di Supabase taglia i messaggi lunghi, quindi i risultati della prova ora tornano in forma corta.
  5. **Import vero** (l'`import_id` è nel resoconto in `Documenti\gym-app-import`): 13 controlli su 13 OK.
  6. **Verifica in sola lettura: TUTTO UGUALE** (13 su 13).
  7. Backup `gym-app_2026-11-06_1218`: 299 righe, 9 migrazioni.
  - Controllo di sicurezza: nessun problema nel database; un solo avviso sulle impostazioni di accesso ("Leaked password protection" spenta).
- Script, guida, migrazione e prove: diff controllato (nessun dato vero), committati e pubblicati su `claude/database` con l'ok di Leonardo (senza force push).

## Sessione precedente (piano del passo 3, solo lettura)

- Letti `apps-script/gym-sheet/Codice.gs`, `web-app.html`, `apps-script/the-comeback/` e `HANDOFF.md`, più lo schema del database.
- Correzioni di Leonardo: solo il link di Leonardo chiede l'accesso Google; Raina entra con una chiave personale nel link. Il suo errore "This link is not valid" era una chiave sbagliata nel link, non un bug.
- Decisione di Leonardo: la vecchia app **non** si ricollega a Supabase. Si fa una nuova app che parla direttamente con Supabase (accesso con gli account, salvataggio prima sul telefono), con grafica e flusso di `web-app.html` come modello. La vecchia app resta in uso finché la nuova non la sostituisce. La nuova app (passo 4) si fa in una sessione separata.

## Sessione precedente (accesso: controllo, iscrizioni chiuse, config locale allineata)

- Primo controllo con `npx supabase config diff` (legge soltanto, sempre con il ref di `gym-app`): iscrizioni nuove aperte sia in locale sia online, più alcune differenze (vedi sotto).
- Leonardo ha chiuso le iscrizioni nuove dal pannello di `gym-app`. **Verificato con `config diff`: online `enable_signup = false`.**
- `supabase/config.toml` (solo locale): `enable_signup = false` e tolto l'URL di reindirizzamento sbagliato `https://127.0.0.1:3000` (ora `additional_redirect_urls = []`). Nient'altro cambiato. Dopo la modifica `config diff` non mostra più queste due differenze.
- Database locale non riavviato: gira solo il container del database, e le due impostazioni valgono solo per il servizio di accesso. 106 prove su 106 verdi.
- Differenze rimaste, lasciate così di proposito: conferma email (locale spenta, online accesa: va bene così), indirizzo del sito (locale `http://127.0.0.1:3000`, online `http://localhost:3000`), codice email (6 cifre locale, 8 online), attesa tra due email (1 secondo locale, 1 minuto online), autenticazione a due fattori con app (spenta locale, accesa online), più pooler e storage (non riguardano l'accesso).
- Nessuna modifica online fatta da Claude, nessun account creato.

## Sessione precedente (backup dei dati)

- Script `scripts/backup.ps1`, si lancia con `npm run backup`. Legge solo `gym-app` (ref scritto nello script, mai altri progetti) con l'accesso già fatto della CLI: nessuna password in nessun file.
- Salva 2 file con la data (`gym-app_AAAA-MM-GG_struttura.sql` e `..._dati.sql`) in `C:\Users\Leonardo Valentini\Documents\gym-app-backup`, fuori dal repository. Tiene gli ultimi 8 backup e scrive quando ne cancella uno; tocca solo i file con quel nome esatto. Alla fine stampa cartella, dimensioni e righe per tabella principale.
- Dati salvati: tabelle di gym-app (`public`) e utenti (`auth`). Storage escluso (gym-app non lo usa e le sue tabelle interne non si possono ripristinare). Lo script aggiunge alla struttura ciò che `pg_dump` non salva: il trigger che crea il profilo su `auth.users`, l'azzeramento dei permessi di base di Supabase (altrimenti un progetto nuovo darebbe più permessi di gym-app) e l'elenco delle migrazioni applicate.
- Protezioni: lo script si rifiuta di salvare dentro un repository git; `.gitignore` blocca i nomi dei file di backup anche se finissero qui per sbaglio.
- Prove: primo backup online riuscito (19 muscoli, 5 tipi di serie, 8 migrazioni). Backup del database locale con i dati finti, ripristinato in un secondo database locale pulito: 52 tabelle con le stesse righe prima e dopo (84 = 84), contenuto identico riga per riga, stessi permessi e regole; 106 prove automatiche verdi sul database ripristinato. Anche il backup online, ripristinato in locale, è identico a `gym-app`. Pulizia degli 8 backup provata con file finti.
- Guida in `docs/backup.md` (comando, cartella, ripristino passo per passo, ogni quanto, cosa non fare).
- Durante le prove ho cancellato 2 coppie di file di backup che avevo creato io stanotte con versioni intermedie dello script (non si sarebbero ripristinate bene). Nessun file tuo toccato.

## Passo 2 — Database (finito, sessione precedente dello stesso giorno)

- Schema in `supabase/migrations/` (8 file: base, persone, libreria, piano, log, corpo, permessi, permessi di `rls_auto_enable`). 26 tabelle, tutte con regole di accesso (RLS) e permessi (GRANT) espliciti tabella per tabella.
- Dati finti per lo sviluppo in `supabase/seed.sql` (nessun dato vero, nessuna password). Mai applicati online.
- 106 prove automatiche in `supabase/tests/database/`: passano tutte in locale e online. Controllo dello schema (`db lint`): nessun errore.
- Spiegazione in `docs/database.md`; decisioni in `DECISIONI.md` (2026-11-06).
- Migrazioni applicate al progetto `gym-app` (7 il 2026-11-06, poi l'ottava con l'ok di Leonardo). RLS, permessi e regole delle 26 tabelle: identici online e in locale.
- Controllo di sicurezza online: all'inizio 2 avvisi su `public.rls_auto_enable()`, la funzione che Supabase crea per "automatic RLS" (era eseguibile da anon e authenticated). Corretti con la migrazione `20261106100000_rls_auto_enable_permissions.sql`, provata prima in locale con una copia della funzione e online dentro una transazione annullata. Ora: "No issues found", e le tabelle nuove nascono ancora con RLS.
- Le prove online girano come `cli_login_postgres`: per questo ogni file di prova passa a `postgres` solo dentro la sua transazione. Dopo ogni giro di prove il progetto online è tornato identico a prima.
- `CLAUDE.md`: aggiunta la regola "Aggiornare STATO.md".

## Cosa è online

- **Supabase, progetto `gym-app`**: organizzazione Gym App, piano free, Sydney (ap-southeast-2), ref `kclgcqwmvqqkogkhycgb`, creato da Leonardo il 2026-11-05. Impostazioni: "Automatically expose new tables" spento (in locale lo stesso con `auto_expose_new_tables = false` in `supabase/config.toml`), "automatic RLS" acceso. Accesso: solo email e password, iscrizioni nuove chiuse (verificato il 2026-11-06), conferma email accesa. Contiene 10 migrazioni (26 tabelle; la decima, del 2026-11-06 sera, aggiunge `profiles.starter`) e 2 account creati da Leonardo dal pannello. **Dati di Leonardo importati il 2026-11-06**: piano attivo (4 giorni, 27 esercizi, 50 serie a settimana), 5 sedute e 66 serie dal 2026-10-30 al 2026-11-06 (al backup delle 20:39: 7 sedute e 75 serie in tutto, Leonardo ha già usato l'app nuova), 1 palestra privata (principale) con 20 macchine. Libreria pubblica: 22 esercizi, 20 macchine (non verificati). Più 19 muscoli e 5 tipi di serie. Nessun dato di Raina. pgTAP non installata.
- **GitHub** (`leonardo752010-coder/gym-app`, pubblico): tutti i branch della tabella sopra, compreso `claude/app-v1` fino a `701b3d9` (con CHOOSE YOUR STARTER e l'originale delle mascotte in `docs/immagini/`). `main` pubblica la PWA su GitHub Pages.
- **Cloudflare** (account di Leonardo, piano gratuito): app v1 pubblicata su https://gym-app.gym-app-pwa.workers.dev (progetto `gym-app`, solo file statici), versione **con** CHOOSE YOUR STARTER (deploy del 2026-11-06, 21:41). Si ripubblica con `npm run deploy` nella cartella `app/`.
- **Supabase `gym-app`**: 10 migrazioni, colonna `starter` presente online (2 profili, starter vuoto per tutti e 2). L'app online la usa dal deploy delle 21:41.
- **App in uso oggi**: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.

## Cosa è solo sul computer di Leonardo

- Docker Desktop e WSL (servono per il database di prova in locale).
- Database locale di prova con i dati finti (`npx supabase start`; ora girano anche accesso e API, servono all'app). Ha le stesse 10 migrazioni di `gym-app`. Ricreato il 2026-11-06 (vedi sopra).
- Per l'app v1 (il codice è su GitHub): le sue librerie (`app/node_modules`), Chromium per le prove (cartella di Playwright nel profilo utente), icone create dal logo (`app/public/icons`, ignorata da git) e `app/.env.locale` (indirizzo e chiave pubblica del database **locale** + password dell'atleta finto; ignorato da git).
- **Cartella import**: `C:\Users\Leonardo Valentini\Documents\gym-app-import` con le copie dei due fogli (`gym-bulk2.xlsx`; `comeback.xlsx` non si usa), i collegamenti e i resoconti. Dati veri: mai su GitHub.
- Supabase CLI (`node_modules/`, con `npm install`), con l'accesso al tuo account Supabase e il collegamento a `gym-app` (`supabase/.temp/`). Cartelle ignorate da git.
- **Backup**: `C:\Users\Leonardo Valentini\Documents\gym-app-backup`. Oggi ci sono 6 backup del 2026-11-06; `1218` è quello dopo l'import, `2135` quello subito prima della migrazione dello starter. I backup non vanno mai su GitHub né online.

## Prossimo passo

CHOOSE YOUR STARTER è online. Leonardo e Raina: aprire l'app con internet, aspettare qualche secondo, chiuderla del tutto e riaprirla (la seconda apertura usa la versione nuova: nel menu "Versione" = 06/11/2026 21:41). Dopo qualche istante compare la schermata, una volta sola.

Poi: Leonardo installa l'app sul telefono, accede e registra una seduta vera (prova con i dati veri).

## Da decidere o fare per Leonardo

- CHOOSE YOUR STARTER: tutto fatto (push, migrazione online, deploy). Da controllare sul telefono che la schermata compaia una volta a Leonardo e a Raina.
- Sul tema chiaro il bordo crema delle mascotte si confonde con lo sfondo crema delle carte, e i graffi della tigre e le stelline del leone si vedono poco. Sul tema scuro va bene. Decidere se va bene così.

- Dopo qualche settimana di uso vero: rivedere le 3 ore dopo mezzanotte (tenerle o toglierle).
- Impostazioni online in italiano o di default (email di Supabase, nome del sito, ecc.): vedi elenco dato a Leonardo il 2026-11-06; nessuna è stata toccata.

- Installare l'app sul telefono e accedere (Claude non conosce e non inserisce le password).
- Durante la prova: registrare le serie solo nella nuova app, solo nella vecchia, o in tutte e due? (Con tutte e due il foglio GYM e Supabase restano completi, ma è doppio lavoro.)

- Avviso di sicurezza: "Leaked password protection" spenta (Authentication → impostazioni delle password). Decidere se accenderla.

- Aggiungere l'indirizzo https://gym-app.gym-app-pwa.workers.dev come indirizzo del sito e di reindirizzamento in gym-app (serve solo per le email, per esempio il reset della password; l'accesso con password funziona anche senza).
- Reset della password per Raina: il servizio email gratuito di Supabase manda poche email e solo agli indirizzi del team del progetto. Se serve, configurare un servizio email proprio (SMTP).
- Backup settimanale dei dati (docs/backup.md)
- Approvare (o no) il merge di `claude/database` su `main`.
- Account di Raina in `gym-app`: non serve per l'import (per Raina niente import); solo quando userà la nuova app.
- Dire se i branch vecchi (`claude/fondamenta`, `codex/handoff-2026-11-05`, `handoff/codex-2026-11-05`, `claude/nota-funzioni`, `claude/nota-funzioni-main`) si possono cancellare: il loro contenuto è già in `main` o in `claude/database`.
- Rendere privato il repository: la nuova app non dipende più da GitHub Pages, ma la vecchia app (`github.io/gym-app`) sì, finché è in uso.
- Mai copiare chiavi o password del progetto Supabase nel repository.

## Roadmap (passo attuale in grassetto)

1. Fondamenta del repository — fatto; repository privato dopo lo spostamento dell'hosting.
2. Database Supabase (Sydney): tabelle, regole di accesso, file di migrazione — fatto, in attesa del merge.
3. Trasferimento del piano attuale e dell'ultima settimana di Leonardo, con controllo — fatto online il 2026-11-06 (Raina: niente import).
4. **Nuova app, parte seduta** — app v1 (PWA) pubblicata il 2026-11-06; seduta nuova, tasto "Fine seduta" e inglese pubblicati la sera del 2026-11-06; CHOOSE YOUR STARTER pubblicato la notte del 2026-11-06.
5. Nuova app, parte piano.
6. Passaggio alla nuova app.
7. Stage 0: 4 settimane di uso vero.
8. Prova con 2-3 tester esterni.
9. Dopo lo Stage 0: import Excel/CSV, analisi, mesocicli, libreria macchine, store.
