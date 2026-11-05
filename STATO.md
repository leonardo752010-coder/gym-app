# Stato

Aggiornato: 2026-11-06 (Claude)

## Branch

Branch attuale: `claude/database` (passo 2, finito). Non è su `main`: il merge lo approva Leonardo.

| Branch | Cosa contiene |
| --- | --- |
| `main` | Cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento (`docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md`, `CLAUDE.md`) |
| `claude/database` | Tutto `main` + fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`) + copia dell'app attuale (`HANDOFF.md`, `apps-script/`) + database Supabase (migrazioni, prove, `docs/database.md`) + regola "Aggiornare STATO.md" in `CLAUDE.md` |
| `claude/fondamenta` | Solo le fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`). Già tutto dentro `claude/database` |
| `codex/handoff-2026-11-05` | Copia dell'app attuale Google Apps Script + `HANDOFF.md` (commit 02d342f). Già tutto dentro `claude/database` |
| `handoff/codex-2026-11-05` | Versione precedente dello stesso handoff (commit 0816122). Già tutto dentro `claude/database` |
| `claude/nota-funzioni` | Fondamenta + handoff + nota su funzioni. La nota è già su `main`, il resto è in `claude/database` |
| `claude/nota-funzioni-main` | Uguale a `main` (commit 741d456) |

## Fatto in questa sessione (passo 2 — Database)

- Schema in `supabase/migrations/` (8 file: base, persone, libreria, piano, log, corpo, permessi, permessi di `rls_auto_enable`). 26 tabelle, tutte con regole di accesso (RLS) e permessi (GRANT) espliciti tabella per tabella.
- Dati finti per lo sviluppo in `supabase/seed.sql` (nessun dato vero, nessuna password). Mai applicati online.
- 106 prove automatiche in `supabase/tests/database/`: passano tutte in locale e online. Controllo dello schema (`db lint`): nessun errore.
- Spiegazione in `docs/database.md`; decisioni in `DECISIONI.md` (2026-11-06).
- Migrazioni applicate al progetto `gym-app` (7 il 2026-11-06, poi l'ottava con l'ok di Leonardo). RLS, permessi e regole delle 26 tabelle: identici online e in locale.
- Controllo di sicurezza online: all'inizio 2 avvisi su `public.rls_auto_enable()`, la funzione che Supabase crea per "automatic RLS" (era eseguibile da anon e authenticated). Corretti con la migrazione `20261106100000_rls_auto_enable_permissions.sql`, provata prima in locale con una copia della funzione e online dentro una transazione annullata. Ora: "No issues found", e le tabelle nuove nascono ancora con RLS.
- Le prove online girano come `cli_login_postgres`: per questo ogni file di prova passa a `postgres` solo dentro la sua transazione. Dopo ogni giro di prove il progetto online è tornato identico a prima.
- `CLAUDE.md`: aggiunta la regola "Aggiornare STATO.md".

## Cosa è online

- **Supabase, progetto `gym-app`**: organizzazione Gym App, piano free, Sydney (ap-southeast-2), ref `kclgcqwmvqqkogkhycgb`, creato da Leonardo il 2026-11-05. Impostazioni: "Automatically expose new tables" spento (in locale lo stesso con `auto_expose_new_tables = false` in `supabase/config.toml`), "automatic RLS" acceso. Contiene le 8 migrazioni (26 tabelle) e nessun dato: 0 utenti, solo 19 muscoli e 5 tipi di serie. pgTAP non installata.
- **GitHub** (`leonardo752010-coder/gym-app`, pubblico): tutti i branch della tabella sopra. `main` pubblica la PWA su GitHub Pages.
- **App in uso oggi**: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.

## Cosa è solo sul computer di Leonardo

- Docker Desktop e WSL (servono per il database di prova in locale).
- Database locale di prova con i dati finti (`npx supabase db start`).
- Supabase CLI (`node_modules/`, con `npm install`), con l'accesso al tuo account Supabase e il collegamento a `gym-app` (`supabase/.temp/`). Cartelle ignorate da git.

## Prossimo passo

Passo 3: trasferire PIANO e STORICO di Leonardo e Raina nel database, con controllo serie per serie. Prima servono gli account di Leonardo e Raina nel progetto `gym-app`: ogni dato importato deve essere legato a un utente esistente.

## Da decidere o fare per Leonardo

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
