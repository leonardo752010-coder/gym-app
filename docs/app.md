# App v1 (PWA) — spiegazione semplice

L'app sta nella cartella `app/`. È un sito installabile (PWA): si apre da un link e si aggiunge alla Home
di iPhone e Android. Nessuno store, nessun costo. Grafica e flusso copiati da `apps-script/gym-sheet/web-app.html`.

## Cosa fa (versione 1)

- Accesso con email e password (account già creati; iscrizioni chiuse).
- Seduta di oggi dal piano attivo: giorni a rotazione (propone il giorno dopo l'ultimo fatto), esercizi in ordine libero.
- Per ogni esercizio: macchina (marca · modello · codice) e salti di peso, **suggerimento in grande** (doppia progressione
  di base), **volta scorsa** piccola sotto.
- Registrare una serie in un tocco (kg o lb, rep, RIR), timer di recupero, modificare o eliminare una serie
  (eliminazione morbida: nel database resta con `deleted_at`).
- Giorno / notte, italiano / inglese (lingua del telefono, si cambia dal menu toccando il logo).

Fuori dalla v1: analisi, mesocicli, tecniche di intensità, Apple Salute / Health Connect, area coach, import per utenti.

## Come salva (zero dati persi, zero doppioni)

1. Ogni serie si scrive **prima sul telefono** (IndexedDB). L'app dice "salvata" solo dopo.
2. Poi va a Supabase appena c'è rete: subito, al ritorno della rete, quando si riapre l'app, e ogni 20 secondi.
3. Ogni seduta, esercizio e serie ha un codice (id) creato dal telefono. Si invia con "upsert" su quel codice:
   reinviare (per esempio se la risposta si è persa) aggiorna la stessa riga, non ne crea un'altra.
4. Una riga esce dalla coda solo quando Supabase ha confermato **quella versione esatta**.
   Una modifica fatta durante l'invio resta in coda.
5. Se Supabase rifiuta una riga, l'errore resta scritto, la riga resta in coda e le altre proseguono.
6. Due telefoni con la stessa serie N: la seconda diventa la N+1 (nessuna persa).
7. Non si può uscire dall'account finché ci sono modifiche non inviate.
8. L'app chiede al browser la memoria "persistente" (il menu mostra se è protetta).

Lo stato è sotto "ALLENAMENTO": pallino verde = tutto online; arancione = sul telefono, da inviare; grigio = offline.
Una serie ancora da inviare ha il segno ⟳.

## File

| File | Cosa fa |
|---|---|
| `app/src/main.js` | schermate e tocchi (accesso, seduta, serie, timer, menu) |
| `app/src/logic.js` | volta scorsa, suggerimento, salti di peso, giorno proposto (senza rete né schermo: si prova facilmente) |
| `app/src/store.js` | salvataggio sul telefono e coda |
| `app/src/sync.js` | invio della coda a Supabase |
| `app/src/session.js` | salva / modifica / elimina una serie |
| `app/src/api.js` | letture e invii a Supabase |
| `app/src/config.js` | indirizzo di gym-app e **solo la chiave pubblica** |
| `app/vite.config.js` | build e service worker (l'app si apre anche senza rete) |
| `app/scripts/` | icone dal logo, dati finti locali, prova nel browser |

## Comandi (nella cartella `app/`)

Serve il database locale acceso: nella cartella del progetto `npx supabase start` (Docker Desktop acceso).

```bash
npm install
npm test                # prove della logica e della coda (senza database)
npm run test:locale     # prove con il database locale (accesso, volta scorsa, offline, doppioni)
npm run test:e2e        # prova completa nel browser (Chromium, schermo da telefono); screenshot in app/tests/out
npm run dati-finti      # atleta finto con piano e storico nel database locale (email e password in app/.env.locale)
npm run dev             # app sul computer collegata al database locale: http://localhost:5173
npm run deploy          # SOLO con l'ok di Leonardo: build e pubblicazione su Cloudflare
```

Le prove creano utenti finti solo nel database locale e li cancellano alla fine. Mai dati finti online.

## Hosting: Cloudflare (Pages, ora dentro Workers)

**Indirizzo: https://gym-app.gym-app-pwa.workers.dev** (pubblicata il 2026-11-06).

Scelto il 2026-11-06 (vedi `DECISIONI.md`). Da wrangler 4.158 i comandi "pages" passano alla nuova versione
di Pages, che fa parte di Workers ("static assets"): si pubblica con `npx wrangler deploy` e il file `app/wrangler.jsonc`.
Solo file statici, nessun codice sui server di Cloudflare. Piano gratuito: richieste ai file gratuite e illimitate,
fino a 20.000 file, 25 MiB per file. L'accesso a Cloudflare dal terminale (`npx wrangler login`) lo fa Leonardo.
GitHub Pages scartato: col piano gratuito funziona solo con repository pubblici (il repository diventerà privato),
e il vecchio indirizzo `github.io/gym-app` serve ancora l'app attuale.

Dopo ogni pubblicazione l'app sul telefono si aggiorna da sola: alla prima apertura scarica la versione nuova,
dalla seconda la usa (il menu mostra la "Versione", cioè data e ora della build).

## Installare l'app

- **iPhone**: aprire il link in Safari → Condividi → "Aggiungi alla schermata Home". Poi aprire l'app dall'icona
  e accedere **lì** (Safari e l'app installata non condividono i dati).
- **Android**: aprire il link in Chrome → menu ⋮ → "Installa app" (o "Aggiungi a schermata Home").

## Limiti noti su iPhone

- I dati di un sito usato **solo in Safari** possono essere cancellati dopo 7 giorni senza visite. L'app aggiunta
  alla Home ha un suo conteggio che si azzera usandola. Le serie già inviate sono comunque al sicuro su Supabase.
- Niente vibrazione e niente invio in background: la coda parte quando l'app è aperta.
- Il timer conta giusto anche a schermo spento, ma non suona né avvisa quando finisce (niente notifiche nella v1).
- Cancellare l'icona dalla Home può cancellare anche i dati sul telefono (non verificato): prima di toglierla, controllare che il pallino sia verde.
