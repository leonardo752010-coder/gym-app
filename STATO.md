# Stato

Aggiornato: 2026-11-06 (Claude)

## Dove siamo

- App in uso: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.
- Branch di riferimento per l'app attuale: `codex/handoff-2026-11-05` (commit 02d342f).
- Branch `claude/fondamenta` — aggiunge `AGENTS.md`, `DECISIONI.md`, `STATO.md`.
- Branch `claude/nota-funzioni` (partito da `claude/fondamenta`) — aggiunge `docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md` (perche' il piano elenca tante funzioni e come decidiamo quali entrano nella versione 1) e `CLAUDE.md` con la sezione "Portata delle funzioni".
- Branch `claude/database` — lavoro sul passo 2 in corso, non ancora salvato su GitHub.
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

Preparare lo schema del database (passo 2) sul branch `claude/database`.

Prima di costruire una funzione nuova: leggere `docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md`. La divisione delle funzioni (cosa sta al centro, cosa si rimanda) e' una bozza da confermare dopo le interviste ai bodybuilder.

## Da fare per Leonardo

- Creare il progetto Supabase (regione Sydney) quando inizia il passo 2.
- Rendere privato il repository solo dopo lo spostamento dell'hosting.
- Decidere se fare il merge di `claude/nota-funzioni` su `main` (insieme a `claude/fondamenta`).
