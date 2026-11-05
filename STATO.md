# Stato

Aggiornato: 2026-11-05 (Claude)

## Dove siamo

- App in uso: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.
- Branch di riferimento per l'app attuale: `codex/handoff-2026-11-05` (commit 02d342f).
- Questo branch: `claude/fondamenta` — aggiunge `AGENTS.md`, `DECISIONI.md`, `STATO.md`.
- `main`: solo la cornice PWA pubblicata su GitHub Pages. Nessun merge fatto.

## Roadmap (passo attuale in grassetto)

1. **Fondamenta del repository** — regole e decisioni (fatto su questo branch); repository privato dopo lo spostamento dell'hosting.
2. Database Supabase (Sydney): tabelle, regole di accesso, file di migrazione.
3. Trasferimento dello storico di Leonardo e Raina, con controllo.
4. Nuova app, parte seduta.
5. Nuova app, parte piano.
6. Passaggio alla nuova app.
7. Stage 0: 4 settimane di uso vero.
8. Prova con 2-3 tester esterni.
9. Dopo lo Stage 0: import Excel/CSV, analisi, mesocicli, libreria macchine, store.

## Prossimo passo

Preparare lo schema del database (passo 2) su un nuovo branch `claude/database`.

## Da fare per Leonardo

- Creare il progetto Supabase (regione Sydney) quando inizia il passo 2.
- Rendere privato il repository solo dopo lo spostamento dell'hosting.
