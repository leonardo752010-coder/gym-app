# Gym app — passaggio di lavoro (handoff)

Stato al 5 novembre 2026. Branch: `handoff/codex-2026-11-05` (non unito a `main`).

## Dove vive il codice (importante)

Il codice "vero" dell'app **non** viene da questo repository: gira dentro **Google Apps Script**.
Questo branch ne contiene una copia, per poterci lavorare.

| Parte | Dove gira davvero | Copia in questo branch |
|---|---|---|
| Server della web app + pagina HTML + salvataggio da SESSIONE + sync MacroFactor + manutenzione | Progetto Apps Script **collegato** al Google Sheet `GYM_Leonardo_Valentini_Bulk2` (file unico `Codice.gs`) | `apps-script/gym-sheet/Codice.gs` |
| Pagina HTML della web app (leggibile) | Dentro `Codice.gs`, costante `GYMAPP_HTML` (array di righe) | `apps-script/gym-sheet/web-app.html` (identica, solo per leggerla comodamente) |
| Script del foglio di Raina (`THE COMEBACK of the beast MFS🔥`): SESSIONE → STORICO con blocco doppioni | Progetto Apps Script collegato a quel foglio | `apps-script/the-comeback/Codice.gs`, `Migrazione.gs` (una tantum, già eseguita a luglio) |
| Cornice installabile (PWA) per Android e iPhone | GitHub Pages, branch `main`, pubblicata da `.github/workflows/deploy.yml` | già su `main` (`index.html`, `r/index.html`, `manifest.webmanifest`, `sw.js`, `logo.b64`) |

Regola del proprietario: lo script del foglio GYM resta **un solo file** `Codice.gs`.

## Segreti oscurati

- In `apps-script/gym-sheet/Codice.gs` la chiave personale di Raina in `GYMAPP_USERS` è sostituita da `REPLACE_WITH_PERSONAL_KEY`.
  Lo script pubblicato contiene il valore vero: **non** copiare questo file sopra quello pubblicato senza rimettere la chiave (chiederla a Leonardo), altrimenti il link di Raina smette di funzionare.
- Nessuna password o token nel repository. Gli ID dei fogli Google nel codice non sono credenziali: i fogli sono privati.

## Architettura

- **Web app Apps Script** (`doGet` in `Codice.gs`): serve `GYMAPP_HTML`. Il client chiama `google.script.run`:
  `gymAppData(dateKey, k)`, `gymAppSaveSet(p)`, `gymAppUpdateSet(p)`, `gymAppDeleteSet(p)`.
- **Chi apre cosa** (`gymSS_(k)`): senza chiave → solo il proprietario (`GYMAPP_OWNER`), suo foglio. Con chiave valida in `GYMAPP_USERS` → foglio di quella persona.
- **Due deployment dello stesso script**:
  - "Solo io", esegui come proprietario: link di Leonardo (`…/AKfycbzzcW10qo…/exec`).
  - "Chiunque", esegui come proprietario: link con `?k=<chiave>` per Raina (`…/AKfycbyoQYTTFf…/exec`). Senza chiave valida risponde "This link is not valid".
  - Dopo ogni modifica allo script: **Esegui il deployment → Gestisci deployment → modifica → Nuova versione, per TUTTI E DUE**.
- **Dati**: niente database. Tutto sta nei Google Sheet: PIANO (esercizi), STORICO (una riga per serie), più CONTROLLO/VOLUME/PESO/BLOCCO/STORICO_METRICS/MISURE nel foglio di Leonardo.
  - STORICO: `Timestamp | Date | Day | Exercise | Set | Weight_kg | Reps | RIR | Target_RIR_Pattern | Notes | personal notes | Input_weight | Input_unit` (il foglio di Raina ha solo le prime 10 colonne; il codice si adatta).
  - PIANO: `Day_Code, Day_Name, Order, Exercise, Target_Muscle, Sets, Reps_Min, Reps_Max, Target_RIR, Notes` oppure, nel foglio di Raina, `Target_Reps` tipo "10-12" e `Sets` tipo "2-3" (si usa il primo numero).
  - Chiave dei doppioni: `Date + Day + Exercise + Set`. Bloccati nell'app, nella SESSIONE di Leonardo e nella SESSIONE di Raina.
- **PWA (GitHub Pages)**: `index.html` (Leonardo, Android) e `r/index.html` (Raina, iPhone; legge `?k=` dall'URL e la tiene in localStorage; niente manifest apposta) mettono la web app in un iframe a schermo intero. La web app manda `postMessage({gymApp:'ready'})` per togliere la schermata di avvio. Le icone sono generate dal workflow partendo da `logo.b64` (WebP base64 del logo rotondo).
- **Lingua**: italiano senza chiave (Leonardo), inglese con chiave (Raina). Tema giorno/notte salvato in localStorage.

## Completato

- Web app mobile (Fold chiuso/aperto, iPhone): giorni, esercizi da PIANO, "ultima sessione", suggerimento di progressione, timer di recupero, kg/lb, scelta data.
- Salvataggio di ogni serie in STORICO con le stesse guardie di SESSIONE (data, valori impossibili, errore kg/lb con "salva così", doppioni).
- Modifica e cancellazione di una serie salvata (tocco sulla riga verde → Aggiorna / Elimina).
- Nuova grafica come mockup (logo, griglia giorni 2×2, titolo grande corsivo, giorno/notte).
- Accesso multi-persona con chiave personale; PWA installabile; logo e icone rotonde.
- Guardia kg/lb ristretta a ±3% del rapporto 2,2 (`GYM_UNIT_TOL`); esito del salvataggio in SESSIONE!Z3 anche con il motivo.
- Pulizia doppioni nello STORICO di Leonardo (5 nov 2026).

## Cosa manca / da fare

- Su Galaxy Z Fold 7 Chrome non offre "Installa app" dopo la disinstallazione (non risolto; da indagare con Leonardo).
- Modifica/cancellazione serie: non provata dal vivo su dati veri (solo in locale con dati finti).
- iPhone di Raina: non provato su dispositivo reale.
- `appsscript.json` non è nel repository (servizio avanzato **Drive API** attivo nel progetto; fuso orario Pacific/Auckland).
- Nessuno strumento di sincronizzazione codice ↔ Apps Script (es. `clasp`): oggi le modifiche si fanno nell'editor di Apps Script.

## Problemi conosciuti

- HtmlService rifiuta alcuni meta tag (`theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-*`) con "Il meta tag specificato non è consentito": usare solo `viewport`.
- Il link `/dev` della web app a volte serve codice vecchio: verificare sempre su `/exec` dopo una nuova versione.
- La pagina HTML carica il logo da `https://leonardo752010-coder.github.io/gym-app/icon-512.png` e i font da Google Fonts.
- GitHub Actions: avviso di deprecazione Node 20; una run fallita intermedia del 5 nov è innocua.
- Se si rinomina un esercizio in PIANO, l'"ultima sessione" riparte da zero (lo storico è legato al nome).
- Esiste una vecchia copia del foglio ("Copia di GYM_Leonardo_Valentini_Bulk2") con uno script precedente: non è quello in uso.

## Come avviarla

- Uso reale: link PWA di Leonardo `https://leonardo752010-coder.github.io/gym-app/` (Chrome Android → Installa app). Raina: `https://leonardo752010-coder.github.io/gym-app/r/?k=<chiave>` (Safari → Aggiungi alla schermata Home). La chiave non è nel repository.
- Modifiche al server o alla pagina: editor Apps Script del foglio (Estensioni → Apps Script), salva, poi nuova versione su entrambi i deployment.
- Modifiche alla PWA: commit su `main` → il workflow pubblica su GitHub Pages.
- Prova locale della pagina con dati finti: `node tests/render-check.js` (vedi `tests/`). Richiede Node e Playwright con Chromium.

## Test eseguiti

- Locale (Playwright, dati finti): rendering notte/giorno, schermo chiuso (412 px) e aperto (884 px), apertura di una serie in modifica, dialogo kg/lb. Nessun errore JavaScript.
- Dal vivo (browser, dati veri): apertura dei due link (Leonardo e Raina) dopo ogni pubblicazione; chiave sbagliata → "This link is not valid"; lettura PIANO in formato Raina ("3 × 10–12"); icone generate e servite; un salvataggio serie reale dall'app (Upper B, 5 nov).
- Controllo doppioni sugli STORICO dopo la pulizia: 0.

## Servizi esterni

- Google Sheets + Apps Script (account di Leonardo) — dati e server.
- GitHub (repo pubblico) + GitHub Pages + GitHub Actions — cornice PWA e icone.
- Google Fonts (Inter, Barlow Condensed).
- MacroFactor → export in una cartella Google Drive "MacroFactor" → sincronizzazione da menu Gym (solo foglio di Leonardo).
