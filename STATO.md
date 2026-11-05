# Stato

Aggiornato: 2026-11-06 (Claude)

## Branch

Branch attuale: `claude/database` (passo 2 finito + sistema di backup). Non è su `main`: il merge lo approva Leonardo.

| Branch | Cosa contiene |
| --- | --- |
| `main` | Cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento (`docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md`, `CLAUDE.md`) |
| `claude/database` | Tutto `main` + fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`) + copia dell'app attuale (`HANDOFF.md`, `apps-script/`) + database Supabase (migrazioni, prove, `docs/database.md`) + regola "Aggiornare STATO.md" in `CLAUDE.md` + sistema di backup (`scripts/backup.ps1`, `docs/backup.md`) + accesso locale allineato (iscrizioni chiuse in `supabase/config.toml`) |
| `claude/fondamenta` | Solo le fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`). Già tutto dentro `claude/database` |
| `codex/handoff-2026-11-05` | Copia dell'app attuale Google Apps Script + `HANDOFF.md` (commit 02d342f). Già tutto dentro `claude/database` |
| `handoff/codex-2026-11-05` | Versione precedente dello stesso handoff (commit 0816122). Già tutto dentro `claude/database` |
| `claude/nota-funzioni` | Fondamenta + handoff + nota su funzioni. La nota è già su `main`, il resto è in `claude/database` |
| `claude/nota-funzioni-main` | Uguale a `main` (commit 741d456) |

## Fatto in questa sessione (accesso: controllo, iscrizioni chiuse, config locale allineata)

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

- **Supabase, progetto `gym-app`**: organizzazione Gym App, piano free, Sydney (ap-southeast-2), ref `kclgcqwmvqqkogkhycgb`, creato da Leonardo il 2026-11-05. Impostazioni: "Automatically expose new tables" spento (in locale lo stesso con `auto_expose_new_tables = false` in `supabase/config.toml`), "automatic RLS" acceso. Accesso: solo email e password, iscrizioni nuove chiuse (verificato il 2026-11-06), conferma email accesa. Contiene le 8 migrazioni (26 tabelle) e nessun dato: 0 utenti, solo 19 muscoli e 5 tipi di serie. pgTAP non installata.
- **GitHub** (`leonardo752010-coder/gym-app`, pubblico): tutti i branch della tabella sopra. `main` pubblica la PWA su GitHub Pages.
- **App in uso oggi**: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.

## Cosa è solo sul computer di Leonardo

- Docker Desktop e WSL (servono per il database di prova in locale).
- Database locale di prova con i dati finti (`npx supabase db start`).
- Supabase CLI (`node_modules/`, con `npm install`), con l'accesso al tuo account Supabase e il collegamento a `gym-app` (`supabase/.temp/`). Cartelle ignorate da git.
- **Backup**: `C:\Users\Leonardo Valentini\Documents\gym-app-backup`. Oggi c'è 1 backup (2026-11-06, quasi vuoto: 19 muscoli e 5 tipi di serie). I backup non vanno mai su GitHub né online.

## Prossimo passo

Creare a mano gli account di Leonardo e Raina nel pannello di `gym-app` (Authentication, Users, Add user, con "Auto Confirm User" spuntato). Le iscrizioni nuove sono già chiuse.

Dopo: passo 3, trasferire PIANO e STORICO di Leonardo e Raina nel database, con controllo serie per serie. Ogni dato importato deve essere legato a un utente esistente. Prima dell'importazione: `npm run backup`.

## Da decidere o fare per Leonardo

- Quando la nuova app avrà un indirizzo vero (Cloudflare Pages o Vercel): aggiungerlo come indirizzo del sito e di reindirizzamento, online e in locale.
- Reset della password per Raina: il servizio email gratuito di Supabase manda poche email e solo agli indirizzi del team del progetto. Se serve, configurare un servizio email proprio (SMTP).
- Backup settimanale dei dati (docs/backup.md)
- Approvare (o no) il merge di `claude/database` su `main`.
- Creare gli account tuoi e di Raina in `gym-app` (o dirmi come vuoi farlo), prima del passo 3.
- Dire se i branch vecchi (`claude/fondamenta`, `codex/handoff-2026-11-05`, `handoff/codex-2026-11-05`, `claude/nota-funzioni`, `claude/nota-funzioni-main`) si possono cancellare: il loro contenuto è già in `main` o in `claude/database`.
- Rendere privato il repository solo dopo lo spostamento dell'hosting.
- Mai copiare chiavi o password del progetto Supabase nel repository.

## Roadmap (passo attuale in grassetto)

1. Fondamenta del repository — fatto; repository privato dopo lo spostamento dell'hosting.
2. Database Supabase (Sydney): tabelle, regole di accesso, file di migrazione — fatto, in attesa del merge.
3. **Trasferimento dello storico di Leonardo e Raina, con controllo.**
4. Nuova app, parte seduta.
5. Nuova app, parte piano.
6. Passaggio alla nuova app.
7. Stage 0: 4 settimane di uso vero.
8. Prova con 2-3 tester esterni.
9. Dopo lo Stage 0: import Excel/CSV, analisi, mesocicli, libreria macchine, store.
