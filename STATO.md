# Stato

Aggiornato: 2026-11-06 (Claude)

## Dove siamo

- App in uso: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.
- Branch di riferimento per l'app attuale: `codex/handoff-2026-11-05` (commit 02d342f).
- Branch di questo lavoro: `claude/database` (passo 2). Nessun merge su `main`.
- `main`: cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento.

## Passo 2 — Database: fatto

- Schema in `supabase/migrations/` (7 file: base, persone, libreria, piano, log, corpo, permessi). 26 tabelle, tutte con regole di accesso (RLS).
- Dati finti per lo sviluppo in `supabase/seed.sql` (nessun dato vero, nessuna password).
- 102 prove automatiche in `supabase/tests/database/`: passano tutte in locale. Controllo dello schema (`db lint`): nessun errore.
- Spiegazione in `docs/database.md`; decisioni in `DECISIONI.md` (2026-11-06).
- Sul PC di Leonardo: Docker Desktop + WSL installati; Supabase CLI nel progetto (`npm install`).

## Passo 2 — Manca

- Progetto Supabase online `gym-app` (Sydney): creazione dopo l'ok di Leonardo sul costo, poi migrazioni applicate e prove rilanciate.

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
