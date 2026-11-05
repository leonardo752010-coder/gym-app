# Stato

Aggiornato: 2026-11-06 (Claude)

## Dove siamo

- App in uso: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.
- Branch di riferimento per l'app attuale: `codex/handoff-2026-11-05` (commit 02d342f).
- Branch di questo lavoro: `claude/database` (passo 2). Nessun merge su `main`.
- `main`: cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento.

## Passo 2 — Database: fatto

- Schema in `supabase/migrations/` (7 file: base, persone, libreria, piano, log, corpo, permessi). 26 tabelle, tutte con regole di accesso (RLS) e permessi (GRANT) espliciti tabella per tabella.
- Dati finti per lo sviluppo in `supabase/seed.sql` (nessun dato vero, nessuna password). Mai applicati online.
- 105 prove automatiche in `supabase/tests/database/`: passano tutte in locale e online. Controllo dello schema (`db lint`): nessun errore.
- Spiegazione in `docs/database.md`; decisioni in `DECISIONI.md` (2026-11-06).
- Sul PC di Leonardo: Docker Desktop + WSL installati; Supabase CLI nel progetto (`npm install`), collegata a `gym-app`.

## Progetto online `gym-app`

- Organizzazione Gym App, piano free, regione Sydney (ap-southeast-2), ref `kclgcqwmvqqkogkhycgb`. Creato da Leonardo il 2026-11-05.
- Impostazioni di Leonardo: "Automatically expose new tables" spento, "automatic RLS" acceso. In locale `auto_expose_new_tables = false` per provare nelle stesse condizioni.
- 2026-11-06: applicate le 7 migrazioni (`npx supabase db push --remote`), senza dati finti.
- 105 prove online passate (`npx supabase test db --remote`). Dopo le prove il progetto è identico a prima: 0 utenti, 19 muscoli, 5 tipi di serie, nessun'altra riga, nessuno schema di prova, pgTAP non installata.
- RLS, permessi e numero di regole delle 26 tabelle: identici online e in locale.
- Controllo di sicurezza (`npx supabase db advisors --remote`): nessun problema sulle nostre tabelle e funzioni; nessun avviso di prestazioni. 2 avvisi WARN sulla funzione `public.rls_auto_enable()`, creata da Supabase per "automatic RLS" (eseguibile da anon e authenticated). Rischio pratico nullo (è una funzione di event trigger e non si può chiamare direttamente). Correzione proposta, in attesa dell'ok di Leonardo: una migrazione che toglie il permesso di esecuzione.
- Le prove online girano come `cli_login_postgres`: per questo ogni file di prova passa a `postgres` solo dentro la sua transazione.

## Passo 2 — Manca

- Decidere sulla correzione dell'avviso `rls_auto_enable` (sopra).
- Merge su `main`: lo approva Leonardo.

## Roadmap (passo attuale in grassetto)

1. Fondamenta del repository — fatto; repository privato dopo lo spostamento dell'hosting.
2. **Database Supabase (Sydney): tabelle, regole di accesso, file di migrazione.**
3. Trasferimento dello storico di Leonardo e Raina, con controllo.
4. Nuova app, parte seduta.
5. Nuova app, parte piano.
6. Passaggio alla nuova app.
7. Stage 0: 4 settimane di uso vero.
8. Prova con 2-3 tester esterni.
9. Dopo lo Stage 0: import Excel/CSV, analisi, mesocicli, libreria macchine, store.

## Prossimo passo

Passo 3: script di trasferimento di PIANO e STORICO (Leonardo e Raina) nel database, con controllo serie per serie. Prima servono gli account di Leonardo e Raina nel progetto `gym-app` (ogni dato importato deve legarsi a un utente esistente).

## Da fare per Leonardo

- Rendere privato il repository solo dopo lo spostamento dell'hosting.
- Mai copiare chiavi o password del progetto Supabase nel repository.
