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

## Quando inizia una seduta nuova (niente da cancellare a mano)

- Aprire l'app non crea niente: la seduta nasce con la **prima serie salvata**.
- Ogni giorno del piano ha la sua seduta. Una seduta è "in corso" solo se è **di oggi** (data del calendario del telefono)
  e non è chiusa. Riaprire l'app lo stesso giorno riprende quella seduta con le sue serie.
- Dal giorno dopo è una seduta passata: lo stesso giorno del piano riparte **vuoto** e le serie vecchie,
  che restano nel database, diventano la **volta scorsa**.
- Seduta lasciata a metà: non serve fare niente. Il giorno dopo è passata come le altre (le serie fatte sono la volta
  scorsa) e il piano propone il giorno successivo; il giorno lasciato si può comunque scegliere a mano.
- Unica eccezione: allenamento a cavallo della mezzanotte. Una seduta del giorno prima resta in corso per
  3 ore dopo l'ultima serie (per esempio serie alle 23:50 → si continua fino alle 02:50).
- Cambiare giorno del piano a metà: ognuno ha la sua seduta; tornando al primo si ritrovano le sue serie.
- Due telefoni senza rete che iniziano la stessa seduta: diventano due sedute nel database (nessuna si cancella);
  l'app le mostra insieme come la seduta di oggi.

## Tasto "Fine seduta"

- In fondo alla schermata della seduta, sotto "Prossimo", separato da una linea e con un aspetto diverso dai tasti
  usati di continuo. Compare solo se c'è una seduta in corso, cioè dopo la prima serie salvata.
- Scrive `ended_at` sulla seduta (mai prima dell'ultima serie, anche se l'orologio del telefono è indietro).
  Le serie restano e diventano la volta scorsa. Non cancella niente.
- Dopo la chiusura la schermata dello stesso giorno del piano è vuota, con la riga "Seduta chiusa alle HH:MM · **Riapri**".
  "Riapri" toglie `ended_at`. La riga resta finché la seduta è "di adesso" (oggi, o entro le ore dopo mezzanotte)
  e finché non inizia una seduta nuova di quel giorno.
- Una serie salvata dopo la chiusura, sullo stesso giorno del piano, apre una seduta nuova.
- Offline: la chiusura va prima sul telefono e poi nella coda di invio, come le serie. È la stessa riga della seduta
  (stesso id): se la seduta non era ancora online, parte una volta sola, già chiusa, prima delle sue serie.
- Su un altro telefono la seduta risulta chiusa quando scarica i dati (apertura dell'app, ritorno della rete,
  ritorno sull'app dopo 10 minuti, "Invia ora" nel menu).
- Dopo la chiusura il piano propone il giorno successivo.

## Lingua

- Quella del telefono: italiano se il telefono è in italiano, **inglese per tutte le altre lingue** (anche quelle non
  previste, per esempio cinese). Si cambia dal menu toccando il logo.
- Inglese con ortografia neozelandese (program, non programme). Date con il giorno prima del mese (`6 Nov`,
  `6/11/2026`), anno mostrato se non è quello di oggi. Pesi in kg di base.
- Pagina e manifest (nome, descrizione) in inglese, la lingua di ripiego.

## CHOOSE YOUR STARTER (una volta sola)

- Schermata a tutto schermo con il titolo **CHOOSE YOUR STARTER** (in inglese anche con l'app in italiano), tre carte
  (gorilla, leone, tigre), un tocco per scegliere e **Conferma**. Poi si va alla seduta.
- Compare **solo quando il server ha risposto "vuoto"** (`profiles.starter` = null). Mai per una copia vecchia sul
  telefono, mai se lo starter non si riesce a leggere (per esempio offline, o se online la colonna non c'è ancora):
  in quei casi l'app apre la seduta come sempre. Per un utente che c'era già (Leonardo, Raina) la schermata compare
  una volta, al primo aggiornamento dopo l'accesso; per qualche istante si vede la seduta, poi la schermata.
- Il blocco "una sola volta" è **solo nell'app**: dopo la scelta la schermata non torna e nell'app non c'è un modo per
  cambiarla. Nel database non c'è nessuna regola. Per far rivedere la schermata a qualcuno:
  pannello Supabase → SQL Editor → `update public.profiles set starter = null where id = '<id utente>';`
  La schermata ricompare al prossimo aggiornamento dell'app.
- **Offline**: la scelta si salva subito sul telefono (IndexedDB, chiave `starter:<id utente>`) e si invia appena c'è
  rete, come le serie (conta come "1 modifica da inviare"). L'invio scrive solo se online lo starter è ancora vuoto:
  reinviare non cambia niente; se un altro telefono ha già scelto, vince la scelta arrivata prima e il telefono la prende.
  Una sola riga di profilo per utente: nessun doppione possibile.
- "Esci" resta bloccato finché la scelta non è online.
- Nel menu (toccando il logo), accanto all'email dell'account, c'è la piccola immagine dello starter.
- Le immagini sono le tre mascotte rétro (`gorilla.png`, `lion.png`, `tiger.png` in `app/src/assets/starters/`,
  480 px di altezza, sfondo trasparente, 128–138 KB l'una). Sono ritagliate dall'originale
  `docs/immagini/Vintage Trio Gym Mascots.png` (2172 × 724, tre mascotte in fila): tagli nelle colonne vuote tra una
  mascotte e l'altra, 8 px di margine, stessa fascia di righe per tutte e tre (stessa scala); tolti solo il velo quasi
  invisibile attorno (alfa ≤ 16) e un puntino isolato di 1 pixel. Si vedono sempre con le proporzioni giuste
  (`object-fit: contain`). La build le mette da sola nella cache offline. Per cambiarle basta sostituire i tre file
  (stesso nome).

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
| `app/src/starter.js` | CHOOSE YOUR STARTER: scelta sul telefono, invio senza doppioni |
| `app/src/assets/starters/` | le tre mascotte dello starter (PNG); originale in `docs/immagini/` |
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
