# Stato

Aggiornato: 2026-11-06 (Claude)

## Branch

Branch attuale: `claude/database` (passo 2 finito + sistema di backup + passo 3: import fatto online, script committato e pubblicato su GitHub). Non è su `main`: il merge lo approva Leonardo.

| Branch | Cosa contiene |
| --- | --- |
| `main` | Cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento (`docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md`, `CLAUDE.md`) |
| `claude/database` | Tutto `main` + fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`) + copia dell'app attuale (`HANDOFF.md`, `apps-script/`) + database Supabase (migrazioni, prove, `docs/database.md`) + regola "Aggiornare STATO.md" in `CLAUDE.md` + sistema di backup (`scripts/backup.ps1`, `docs/backup.md`) + accesso locale allineato (iscrizioni chiuse in `supabase/config.toml`) + import dai fogli del passo 3 (`scripts/import/`, `docs/import.md`, migrazione `20261106120000`) |
| `claude/fondamenta` | Solo le fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`). Già tutto dentro `claude/database` |
| `codex/handoff-2026-11-05` | Copia dell'app attuale Google Apps Script + `HANDOFF.md` (commit 02d342f). Già tutto dentro `claude/database` |
| `handoff/codex-2026-11-05` | Versione precedente dello stesso handoff (commit 0816122). Già tutto dentro `claude/database` |
| `claude/nota-funzioni` | Fondamenta + handoff + nota su funzioni. La nota è già su `main`, il resto è in `claude/database` |
| `claude/nota-funzioni-main` | Uguale a `main` (commit 741d456) |

## Fatto in questa sessione (passo 3: import del piano e dell'ultima settimana)

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

- **Supabase, progetto `gym-app`**: organizzazione Gym App, piano free, Sydney (ap-southeast-2), ref `kclgcqwmvqqkogkhycgb`, creato da Leonardo il 2026-11-05. Impostazioni: "Automatically expose new tables" spento (in locale lo stesso con `auto_expose_new_tables = false` in `supabase/config.toml`), "automatic RLS" acceso. Accesso: solo email e password, iscrizioni nuove chiuse (verificato il 2026-11-06), conferma email accesa. Contiene 9 migrazioni (26 tabelle) e 2 account creati da Leonardo dal pannello. **Dati di Leonardo importati il 2026-11-06**: piano attivo (4 giorni, 27 esercizi, 50 serie a settimana), 5 sedute e 66 serie dal 2026-10-30 al 2026-11-06, 1 palestra privata (principale) con 20 macchine. Libreria pubblica: 22 esercizi, 20 macchine (non verificati). Più 19 muscoli e 5 tipi di serie. Nessun dato di Raina. pgTAP non installata.
- **GitHub** (`leonardo752010-coder/gym-app`, pubblico): tutti i branch della tabella sopra. `main` pubblica la PWA su GitHub Pages.
- **App in uso oggi**: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.

## Cosa è solo sul computer di Leonardo

- Docker Desktop e WSL (servono per il database di prova in locale).
- Database locale di prova con i dati finti (`npx supabase db start`). Ha le stesse 9 migrazioni di `gym-app`.
- **Cartella import**: `C:\Users\Leonardo Valentini\Documents\gym-app-import` con le copie dei due fogli (`gym-bulk2.xlsx`; `comeback.xlsx` non si usa), i collegamenti e i resoconti. Dati veri: mai su GitHub.
- Supabase CLI (`node_modules/`, con `npm install`), con l'accesso al tuo account Supabase e il collegamento a `gym-app` (`supabase/.temp/`). Cartelle ignorate da git.
- **Backup**: `C:\Users\Leonardo Valentini\Documents\gym-app-backup`. Oggi ci sono 3 backup del 2026-11-06; l'ultimo (`1218`) è quello dopo l'import. I backup non vanno mai su GitHub né online.

## Prossimo passo

Passo 4, nuova app (parte seduta), in una sessione separata.

## Da decidere o fare per Leonardo

- Avviso di sicurezza: "Leaked password protection" spenta (Authentication → impostazioni delle password). Decidere se accenderla.

- Quando la nuova app avrà un indirizzo vero (Cloudflare Pages o Vercel): aggiungerlo come indirizzo del sito e di reindirizzamento, online e in locale.
- Reset della password per Raina: il servizio email gratuito di Supabase manda poche email e solo agli indirizzi del team del progetto. Se serve, configurare un servizio email proprio (SMTP).
- Backup settimanale dei dati (docs/backup.md)
- Approvare (o no) il merge di `claude/database` su `main`.
- Account di Raina in `gym-app`: non serve per l'import (per Raina niente import); solo quando userà la nuova app.
- Dire se i branch vecchi (`claude/fondamenta`, `codex/handoff-2026-11-05`, `handoff/codex-2026-11-05`, `claude/nota-funzioni`, `claude/nota-funzioni-main`) si possono cancellare: il loro contenuto è già in `main` o in `claude/database`.
- Rendere privato il repository solo dopo lo spostamento dell'hosting.
- Mai copiare chiavi o password del progetto Supabase nel repository.

## Roadmap (passo attuale in grassetto)

1. Fondamenta del repository — fatto; repository privato dopo lo spostamento dell'hosting.
2. Database Supabase (Sydney): tabelle, regole di accesso, file di migrazione — fatto, in attesa del merge.
3. Trasferimento del piano attuale e dell'ultima settimana di Leonardo, con controllo — fatto online il 2026-11-06 (Raina: niente import).
4. **Nuova app, parte seduta.**
5. Nuova app, parte piano.
6. Passaggio alla nuova app.
7. Stage 0: 4 settimane di uso vero.
8. Prova con 2-3 tester esterni.
9. Dopo lo Stage 0: import Excel/CSV, analisi, mesocicli, libreria macchine, store.
