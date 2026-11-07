# Stato

Aggiornato: 2026-11-08 (mattina, 11:40): **versione dell'app visibile** in accesso, caricamento, menu e Programma. Commit `41af5f7`, **su GitHub** in `claude/app-v1` e **pubblicato** su Cloudflare, versione **"08/11/2026 11:30"**. Prima, stessa notte: logo silverback dentro l'app ("08/11/2026 02:42") e icona nuova ("08/11/2026 02:18") (Claude)

## Versione visibile dentro l'app (2026-11-08 mattina, con l'ok di Leonardo per tutto il lavoro)

- **Perché Leonardo non la vedeva**: la versione c'era solo come riga "Versione" a metà del menu Account, e il menu si apre **solo** toccando il piccolo gorilla nel cerchio in alto (o la scritta dello stato): nessun tasto "menu" lo fa capire. Nella schermata di accesso, in quella di caricamento e nelle pagine non c'era da nessuna parte. Colore e testo erano leggibili: il problema era solo dove stava.
- **Adesso** (stessa funzione per tutti i punti, `app/src/version.js`; formato di sempre "gg/mm/aaaa hh:mm", "Versione" / "Version"): in fondo alla schermata di **accesso** (sotto la nota per installare), in fondo al **caricamento** (sotto "Carico il piano..."; anche nella schermata "configurazione mancante"), in fondo al **menu Account** (sotto "Chiudi", al posto della riga a metà), in fondo alla pagina **Programma** (anche quando non c'è un piano). Testo piccolo (12-13 px), grigio dell'app: contrasto 6,4-7,1:1 col tema notte, 4,9-5,3:1 col tema giorno (minimo richiesto 4,5). Su schermi bassi il menu ora scorre, così la riga in fondo si raggiunge sempre.
- File: `app/src/version.js` (nuovo), `app/src/main.js`, `app/src/styles.css`, `app/tests/unit/versione.test.js` (nuovo, 3 prove). Nessun testo esistente cambiato (la parola "Versione"/"Version" c'era già). Non toccati: database, sync, salvataggio, offline, carico, "Esci", dati del telefono, tre pagine, icone, logo, CHOOSE YOUR STARTER.
- **Cache**: non serve cambiare il service worker. La versione è scritta dentro il codice della build: ogni build ha file nuovi e una cache nuova. Provato con due build una dopo l'altra: la prima apertura dopo il deploy mostra ancora la versione vecchia (è quella che gira davvero), la seconda mostra quella nuova e la cache vecchia sparisce.
- **Prove**: `npm test` 105 verdi (3 nuove). Build pulita: niente `:54321`, nessuna chiave segreta (`localhost:9999` e `sb_secret_` sono solo testo interno della libreria supabase-js, nessun valore), solo gym-app. Prova nel browser (build locale, atleta finto del database locale, Supabase online bloccato: **0 richieste**): accesso, caricamento, menu, Programma, menu e Programma senza rete, tema notte e giorno, schermo 390×844 e 320×568: 29 controlli su 29 (versione leggibile, dentro lo schermo, non coperta, nessun tasto sopra). Build pubblicata controllata anche in inglese ("Version 08/11/2026 11:30"). Screenshot nella cartella temporanea di Claude.
- Nota: l'atleta finto del database **locale** non aveva lo starter: la prova ha scelto "Gorilla" (una scrittura nel database locale di prova, niente cancellato). Nessun dato online toccato.
- Git su questo computer non ha nome ed email impostati: il commit è firmato con autore e email del commit precedente, passati solo a quel comando (impostazioni di git non cambiate).
- Branch `versione-app` creato da `claude/app-v1` (`75ea0ed`); commit `41af5f7` "versione: visibile in accesso, caricamento e menu"; `git merge --ff-only` in `claude/app-v1` e push `75ea0ed..41af5f7`, senza force. `versione-app` resta in locale (uguale a `claude/app-v1` fino a `41af5f7`).
- Versione Cloudflare prima del deploy: `9d818b5c-9557-4a3b-a564-433793cbfd9e` ("08/11/2026 02:42", cache `gym-acda3907c3`).
- Deploy con `npx wrangler@4 deploy` della build già controllata: 4 file nuovi (pagina, JS, CSS, `sw.js`), 21 uguali. Versione Cloudflare nuova `2b10a14a-7226-4a1d-9efd-4634fcf61275`, versione dell'app **"08/11/2026 11:30"**, cache `gym-fa58f77b80`. Piano gratuito: nessun costo.
- Controllo online: pagina, `sw.js`, JS, CSS e manifest rispondono 200; la pagina online usa il JS nuovo, che contiene "08/11/2026 11:30"; niente `:54321`.
- **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback 9d818b5c-9557-4a3b-a564-433793cbfd9e`.

## Logo silverback dentro l'app (2026-11-08 notte, con l'ok di Leonardo)

- Branch `logo-interno` creato da `claude/app-v1` (`be98f20`); commit `dbf3cbf` "logo: silverback dentro l'app" (stesso autore dei commit precedenti, impostazioni di git non cambiate); `git merge --ff-only` in `claude/app-v1` e push `be98f20..dbf3cbf`, senza force. `logo-interno` resta in locale (uguale a `claude/app-v1` fino a `dbf3cbf`).
- Versione Cloudflare prima del deploy: `d1e94790-d32f-4ba6-a8d3-896968ad9ed3` (menu "08/11/2026 02:18").
- Deploy con `npx wrangler@4 deploy` della build già controllata: 6 file nuovi (pagina, JS, CSS, `sw.js`, i due logo), 19 uguali. Versione Cloudflare nuova `9d818b5c-9557-4a3b-a564-433793cbfd9e`, nel menu **"08/11/2026 02:42"**. Piano gratuito: nessun costo.
- Controllo online: pagina 200; manifest, `sw.js`, i due logo (`image/webp`) e le icone 200; cache `gym-acda3907c3`; JS e logo online identici alla build controllata.
- **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback d1e94790-d32f-4ba6-a8d3-896968ad9ed3`.

- Logo completo (gorilla con bilanciere, "Gym", "IMPORT & TRACK") in: **accesso** (240 px), **caricamento** (220 px, sopra la rotella), **menu Account** (168 px, in alto nel foglio). Fondo nero suo, angoli arrotondati, proporzioni intatte, niente tagliato.
- **Cerchio in alto** (96 px): il logo completo non ci sta leggibile (la scritta sarebbe di 5-6 px), quindi **ritaglio quadrato del solo gorilla con bilanciere**, preso dal logo (fermato alla riga 601, dove finiscono i piedi: la "y" di "Gym" comincia alla 602), su nero, tutto dentro il cerchio. Stessa misura, stesso posto, stesso tocco (apre il menu).
- L'icona con la corona resta **solo** icona dell'app (manifest, apple-touch, favicon: non toccati).
- File: `app/src/assets/logo/logo-silverback.webp` (720×668, 29,5 KB) e `logo-gorilla.webp` (384×384, 10,4 KB), creati da `app/scripts/logo.mjs` (si lancia a mano) dall'originale `app/risorse/Gym-logo-silverback-v5.png` (906 KB, resta sul computer, **non** su GitHub). WebP: lo leggono tutti i browser che l'app già richiede (iPhone iOS 14+, Chrome).
- `app/src/main.js` (4 punti: accesso, cerchio in alto, caricamento, menu) e `app/src/styles.css` (misure del logo; il riquadro del caricamento ora cresce se serve invece di avere altezza fissa).
- Cache: i due logo entrano da soli nella lista del service worker (sono importati dal codice); versione della cache nuova.
- Prove: `npm test` 102 verdi; build pulita (niente `:54321`, nessuna chiave segreta, solo gym-app); prova nel browser con l'atleta finto del database locale e Supabase online bloccato (0 richieste), tema notte e giorno: 30 controlli su 30 (accesso, caricamento, tre pagine, menu anche su schermo piccolo 375×667, logo nitido, logo in cache, riapertura senza rete con il logo). Screenshot in `app/tests/out/logo/` (ignorata da git). Nessuna scrittura o cancellazione nel database.

## Branch

Branch attuale: **`claude/app-v1`**, uguale a GitHub. Ultimo lavoro: versione visibile dentro l'app (commit `41af5f7`, dal branch `versione-app`, fast-forward `75ea0ed..41af5f7`, push senza force; vedi sopra). Prima: logo silverback dentro l'app (commit `dbf3cbf`, dal branch `logo-interno`, fast-forward `be98f20..dbf3cbf`, push senza force, con l'ok di Leonardo; vedi sopra). Prima, l'icona nuova: commit `abcac6e` "icona: gorilla con corona" fatto su `icona-app` e unito con `git merge --ff-only` (fast-forward `3d97086..abcac6e`), push senza force, con l'ok di Leonardo. `icona-app` è fermo anche lui su `abcac6e` (solo locale).

`app/risorse/Gym-logo-silverback-v5.png` (originale, 906 KB) è sul computer ma **fuori dai commit** (per scelta di Leonardo): git lo mostra come file non tracciato. Su GitHub ci sono solo le due versioni ottimizzate in `app/src/assets/logo/`.

`claude/app-v1` contiene anche la barra in basso a tre pagine (commit `cab1d7d`, da `nav-tre-pagine`, unito con un merge "fast-forward": nessuna storia riscritta). **Su GitHub** fino a `cab1d7d` (push senza force, con l'ok di Leonardo); dopo c'è solo il commit di questo STATO.md. **Pubblicata** su Cloudflare (deploy del 2026-11-08, versione dell'app "08/11/2026 02:04").

Nota: il merge di `nav-tre-pagine` in `claude/app-v1` l'aveva già fatto lo script dell'icona lanciato da Leonardo (02:01, fast-forward), che ha anche creato il branch `icona-app`. Claude ha trovato `claude/app-v1` già su `cab1d7d` e ha controllato che fosse un fast-forward.

Su `claude/app-v1`: Contiene ora anche la pelle nuova della schermata ALLENAMENTO: `skin-track` unito il 2026-11-08 con l'ok di Leonardo (merge normale, "fast-forward": nessun conflitto, nessuna storia riscritta). Più la correzione dell'accesso (commit `92fce81`). Poi la barra a tre pagine (`cab1d7d`, vedi sopra).

`skin-track` esiste ancora in locale, fermo a `f37c135` (tutto già dentro `claude/app-v1`).

`claude/app-v1` (nato da `claude/database`): app v1 come PWA nella cartella `app/`, **pubblicata** su https://gym-app.gym-app-pwa.workers.dev. I lavori fino al commit `d23994a` (seduta nuova, "Fine seduta", inglese) sono su GitHub e online. **CHOOSE YOUR STARTER** è in due commit su `claude/app-v1` (`c8a2617` e `701b3d9`, mascotte vere), **su GitHub** dal 2026-11-06 (push con l'ok di Leonardo, senza force push). Migrazione applicata online su `gym-app` (2026-11-06, 21:36). App con CHOOSE YOUR STARTER **pubblicata** con `npm run deploy` (2026-11-06, versione "06/11/2026 21:41"), con l'ok di Leonardo.

| Branch | Cosa contiene |
| --- | --- |
| `nav-tre-pagine` | Barra in basso (Programma / Allenamento / Progressi), commit `cab1d7d`. **Solo locale** (mai su GitHub). Già tutto dentro `claude/app-v1` |
| `icona-app` | Icona nuova (commit `abcac6e`). **Solo locale**. Già tutto dentro `claude/app-v1` |
| `logo-interno` | Logo silverback dentro l'app (commit `dbf3cbf`). **Solo locale**. Già tutto dentro `claude/app-v1` |
| `versione-app` | Versione visibile in accesso, caricamento, menu e Programma (commit `41af5f7`). **Solo locale**. Già tutto dentro `claude/app-v1` |
| `claude/app-v1` | Tutto `claude/database` + app v1 (PWA) in `app/`, guida `docs/app.md`, decisioni in `DECISIONI.md`, regola "niente cancellazioni senza ok" in `CLAUDE.md` + pelle nuova della schermata ALLENAMENTO (da `skin-track`, unita il 2026-11-08) + correzione dell'accesso (`92fce81`) + barra in basso a tre pagine (`cab1d7d`) + icona nuova (`abcac6e`) + logo silverback dentro l'app (`dbf3cbf`). Su GitHub |
| `skin-track` | Pelle nuova (nero e viola) della schermata ALLENAMENTO in `app/src/styles.css`, solo tema notte (commit `fd723c0`). **Solo locale** (mai su GitHub). Già tutto dentro `claude/app-v1` |
| `main` | Cornice PWA pubblicata su GitHub Pages + nota su funzioni e posizionamento (`docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md`, `CLAUDE.md`) |
| `claude/database` | Tutto `main` + fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`) + copia dell'app attuale (`HANDOFF.md`, `apps-script/`) + database Supabase (migrazioni, prove, `docs/database.md`) + regola "Aggiornare STATO.md" in `CLAUDE.md` + sistema di backup (`scripts/backup.ps1`, `docs/backup.md`) + accesso locale allineato (iscrizioni chiuse in `supabase/config.toml`) + import dai fogli del passo 3 (`scripts/import/`, `docs/import.md`, migrazione `20261106120000`) |
| `claude/fondamenta` | Solo le fondamenta (`AGENTS.md`, `DECISIONI.md`, `STATO.md`). Già tutto dentro `claude/database` |
| `codex/handoff-2026-11-05` | Copia dell'app attuale Google Apps Script + `HANDOFF.md` (commit 02d342f). Già tutto dentro `claude/database` |
| `handoff/codex-2026-11-05` | Versione precedente dello stesso handoff (commit 0816122). Già tutto dentro `claude/database` |
| `claude/nota-funzioni` | Fondamenta + handoff + nota su funzioni. La nota è già su `main`, il resto è in `claude/database` |
| `claude/nota-funzioni-main` | Uguale a `main` (commit 741d456) |

## Fatto in questa sessione (2026-11-08 notte: icona nuova dell'app)

### Commit, push e deploy (con l'ok di Leonardo)

- File del commit controllati (solo STATO.md, manifest, `icons.mjs`, `vite.config.js`, `app/risorse/Gym-app-icon.png`); STATO.md senza email, chiavi o ID utente. `npm test` 102 verdi.
- Commit `abcac6e` "icona: gorilla con corona" (firmato come i commit prima: stesso autore preso dal commit precedente, impostazioni di git non cambiate). Fast-forward in `claude/app-v1`, push `3d97086..abcac6e`, senza force.
- Versione Cloudflare online **prima** del deploy: `c613c230-dc05-4986-b479-2cf9447d037a` (menu "08/11/2026 02:04", cache `gym-36185a9f1c`).
- Build di produzione controllata: niente `:54321`, nessuna chiave segreta, solo gym-app; manifest con le 2 icone maskable, 5 icone in `dist/icons`, cache nuova `gym-cec2b61761`. Versione nel menu: **"08/11/2026 02:18"**.
- Primo tentativo di deploy bloccato dai permessi di Claude Code. Leonardo ha approvato di nuovo: **deploy riuscito** con `npx wrangler@4 deploy` (la build già controllata, senza rifarla): 9 file nuovi (pagina, JS, `sw.js`, manifest, 5 icone), 14 uguali. Versione Cloudflare nuova `d1e94790-d32f-4ba6-a8d3-896968ad9ed3`, nel menu **"08/11/2026 02:18"**. Piano gratuito: nessun costo.
- Controllo online: pagina 200; manifest, `sw.js` e le 5 icone 200 (`image/png`); cache `gym-cec2b61761`; icona e JS online identici alla build controllata.
- **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback c613c230-dc05-4986-b479-2cf9447d037a`.

### Icona (prima parte della sessione)

Solo immagini e riferimenti alle immagini. Nessuna funzione cambiata; database, sync, salvataggio, offline, carico, "Esci", layout, barra e mascotte di CHOOSE YOUR STARTER non toccati.

- **Originali** (in `Documents\ChatGPT\Body CHECK`, non toccati) copiati identici in `app/risorse/`: `Gym-app-icon.png` (1254×1254, PNG, senza trasparenza, fondo nero puro) e `Gym-logo-silverback-v5.png` (1254×1254, PNG, senza trasparenza).
- **Script delle icone** `app/scripts/icons.mjs` (parte da solo con `npm run dev` e `npm run build`): ora parte da `app/risorse/Gym-app-icon.png` invece di `logo.b64`. `logo.b64` resta nella radice: serve ancora alla vecchia cornice su GitHub Pages (`main`).
- **Icone generate** in `app/public/icons` (stessi nomi di prima, cartella ignorata da git): `icon-192.png` 6,4 KB (prima 16,8), `icon-512.png` 20,7 KB (prima 89,2), `icon-maskable-512.png` 17,9 KB (prima 64,9), `apple-touch-icon.png` 4,9 KB (prima 14,9), **nuova** `icon-maskable-192.png` 4,6 KB. Aggiunta al manifest.
- **Maskable** (Android): disegno ridotto all'82% su tela nera, proporzioni e colori uguali. La punta della corona (il punto più lontano) arriva al 38% del lato: dentro il cerchio sicuro del 40%. Mento e orecchie ancora più dentro.
- **Anteprime** 48, 60, 120, 180, 192 px con maschera rotonda e squircle: corona e mento interi e leggibili anche a 48 px (a 48 si perdono solo i dettagli degli occhi). File in `app/tests/out/icone/` (ignorata da git).
- **Logo dentro l'app**: oggi c'è solo il logo tondo (accesso 120 px, in alto a sinistra 96 px), che usa `icons/icon-192.png`: ora mostra la testa nuova, intera dentro il cerchio. (Poi cambiato, vedi "Logo silverback dentro l'app" sopra.) Allora il logo completo (`Gym-logo-silverback-v5.png`) **non era usato**: oggi nell'app non c'è nessun posto con un logo completo, e in un cerchio di 96-120 px il bilanciere verrebbe tagliato e la scritta non si leggerebbe.
- **Cache offline** (`app/vite.config.js`): la versione della cache ora cambia anche quando cambiano solo icone o manifest, così le immagini nuove arrivano ai telefoni.
- **Prove**: `npm test` 102 verdi. Build di produzione pulita (niente `:54321`, nessuna chiave segreta, solo gym-app). Prova nel browser (database locale, atleta finto già esistente, Supabase online bloccato: 0 richieste; nessuna scrittura, nessuna cancellazione): manifest, icone, apple-touch-icon e favicon rispondono 200; logo nuovo all'accesso, in alto e col menu, tema notte e giorno; icone nella cache nuova; nessun errore.
- **Non lanciati**: `npm run test:locale` e `npm run test:e2e` (creano e cancellano un atleta finto nel database locale).

## Prima, oggi (2026-11-08 notte: barra a tre pagine online)

Con l'ok di Leonardo:
- Merge di `nav-tre-pagine` in `claude/app-v1`: già fatto (fast-forward) dallo script dell'icona; controllato, nessuna storia riscritta.
- `npm test`: 102 verdi.
- Push di `claude/app-v1` su GitHub (`92fce81..cab1d7d`), senza force.
- Versione Cloudflare prima del deploy: `8233e376-5ffc-40a6-bd86-5bb726a5eeb7` (menu "08/11/2026 01:31").
- Build di produzione controllata **prima** di caricarla: nessun `:54321`, nessuna chiave segreta (solo quella pubblica), solo il progetto gym-app. Barra e pagine nuove presenti nel JS e nel CSS.
- Deploy con `npx wrangler@4 deploy`: 4 file nuovi (pagina, JS, CSS, `sw.js`). Versione Cloudflare nuova `c613c230-dc05-4986-b479-2cf9447d037a`, nel menu **"08/11/2026 02:04"**. Piano gratuito: nessun costo.
- Controllo: https://gym-app.gym-app-pwa.workers.dev risponde 200; il JS online è identico a quello controllato e contiene la barra e le due pagine.
- **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback 8233e376-5ffc-40a6-bd86-5bb726a5eeb7`.

## Prima, oggi (barra in basso a tre pagine, opzione B)

Leonardo ha scelto l'opzione B. Fatto sul branch `nav-tre-pagine`. Poi, con l'ok di Leonardo, **commit solo locale**: niente push, niente deploy.

- **Barra in basso** con tre tasti: Programma, Allenamento, Progressi (in inglese: Program, Workout, Progress). Pelle nero e viola nel tema notte; nel tema giorno usa i colori di sempre.
- **Allenamento** = la schermata ALLENAMENTO di prima, uguale. È la pagina di partenza dopo l'accesso e a ogni riavvio.
- **Programma** (sola lettura): nome del piano, giorni, esercizi con serie × rep, RIR, superserie e macchina. Toccare un giorno lo apre in Allenamento (come le schede dei giorni). Niente import, niente "Library", niente "Crea programma".
- **Progressi** (sola lettura): sedute salvate sul telefono, dalla più recente, con esercizi, macchina e serie (peso × rep @RIR). La seduta di oggi c'è subito ("in corso"). Niente grafici, nessuna richiesta nuova al server.
- **Tasto indietro**: da Programma o Progressi torna ad Allenamento; da Allenamento fa come prima (esce dall'app).
- Il timer di recupero resta visibile su tutte le pagine, sopra la barra.
- Menu dal logo e CHOOSE YOUR STARTER: come prima, fuori dalla barra.
- Non toccati: database, migrazioni, sync, salvataggio, offline, calcolo del carico, "Esci".

File: `app/src/pages.js` (nuovo), `app/src/main.js`, `app/src/i18n.js`, `app/src/styles.css`, `app/tests/unit/pagine.test.js` (nuovo), `app/scripts/e2e.mjs` (prove nuove + Supabase online bloccato), `docs/app.md`, `STATO.md`.

Prove: `npm test` 102 verdi (12 nuove), `npm run test:locale` 25 verdi, `npm run test:e2e` 84 verdi (15 nuove: tre pagine, serie salvata che compare in Progressi anche senza rete, tasto indietro, riavvio, nessun dato cambiato, 0 richieste a Supabase online). Build pulita: niente `:54321`, nessuna chiave segreta, solo `gym-app`. Screenshot in `app/tests/out/13-track.png`, `14-program.png`, `15-progress.png` (cartella ignorata da git).

Prima, nella stessa sessione: lettura dell'app. Allora Program e Progress non esistevano (solo ALLENAMENTO, menu, accesso, CHOOSE YOUR STARTER) e Claude si era fermato con le opzioni A, B, C.

## Prima, oggi (2026-11-08 notte: login che non funzionava)

### Diagnosi (solo lettura, solo `gym-app`)

- Utente di Leonardo a posto: email confermata, identità email presente, nessun blocco, password presente. Impostazioni di accesso giuste (email e password attive, iscrizioni chiuse: non serve per entrare). Nessuna modifica a utenti o impostazioni.
- Log: dopo la ricreazione dell'utente (2026-11-07 sera, ora NZ) computer e telefono avevano ancora salvato l'accesso **dell'utente vecchio** (cancellato). Il computer riceveva "rifiutato" (401) e mostrava "Accesso non riuscito ↻" senza il modulo di login; il telefono riceveva un piano vuoto. L'app non tornava mai da sola al login, e sul telefono "Esci" è bloccato dalle 2 sedute in coda. Il computer è poi entrato (dopo una ricarica) e ora vede piano e sedute.
- Sito online: 200, indirizzo e chiave pubblica di gym-app giusti, service worker normale.

### Correzione (codice dell'app)

- `app/src/api.js`: nuove `checkAuth()` (chiede al server se l'accesso vale ancora), `authState()` (quali risposte vogliono dire "non vale più") e `forgetSession()` (toglie **solo** l'accesso salvato).
- `app/src/main.js`: a ogni aggiornamento si controlla l'accesso; se il server dice che non vale più → schermata di login con il messaggio "Accesso scaduto: entra di nuovo. Le serie sul telefono restano salvate." **Serie, sedute e coda non si cancellano** (il codice di "Esci" non è cambiato). Senza rete o con il server giù non cambia niente: si continua col telefono.
- `app/src/i18n.js`: il messaggio in italiano e inglese. Prove nuove: `app/tests/unit/accesso.test.js` (9).
- `npm test` 90 su 90. Build controllata (nessun `:54321`, nessuna chiave segreta, solo gym-app, pelle nel CSS). Commit `92fce81`, push senza force.
- Deploy: versione Cloudflare prima `9a516753-a63e-44cd-8f11-ae364506a114`, dopo `8233e376-5ffc-40a6-bd86-5bb726a5eeb7` (3 file nuovi: pagina, JS, `sw.js`). Piano gratuito: nessun costo. **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback 9a516753-a63e-44cd-8f11-ae364506a114`.
- Verifica online: pagina, JS, CSS, `sw.js`, manifest rispondono 200; nel browser di Claude, con un accesso salvato finto e scaduto, l'app mostra il login con il messaggio e toglie l'accesso vecchio. Database in sola lettura: piano attivo 1 (4 giorni), 8 sedute, 80 serie, palestra principale 1, 2 utenti.
- **Non fatto**: `test:locale` e `test:e2e` (usano il database locale e creano/cancellano un atleta finto). Nessuna scrittura nel database, nessun utente toccato, telefono non toccato.

### Le 2 sedute in coda sul telefono

Sono salvate sul telefono sotto l'utente **vecchio**. Dopo il nuovo accesso restano lì (non si vedono e non si inviano, ma non si cancellano). Per portarle online serve un lavoro a parte (spostarle sull'utente nuovo): da decidere con Leonardo.

## Prima, oggi (2026-11-08: ripristino dei dati di Leonardo e unione della pelle)

### Cosa era successo

- Leonardo ha cancellato e ricreato il suo utente in `gym-app` dal pannello. Per le regole del database (ON DELETE CASCADE) con l'utente sono spariti **tutti** i suoi dati: piano, sedute, serie, palestra privata con le sue 20 macchine, registro dell'import. Nessuna riga orfana. L'utente nuovo ha un **ID nuovo** e solo un profilo vuoto, per questo l'app diceva "non hai un piano attivo".
- Libreria pubblica (22 esercizi, 20 macchine, 5 tipi di serie, 19 muscoli) **non** toccata: nel backup non era legata a nessun utente. Raina: nel backup aveva solo il profilo, ce l'ha ancora, non ha perso niente.

### Ripristino online (con l'ok di Leonardo), solo `gym-app`

1. CLI collegata a `gym-app` (controllato). Copia di sicurezza di tutta la cartella dei backup in `Documents\gym-app-backup-COPIA` (12 file su 12, contenuto identico controllato con sha256).
2. Backup nuovo **prima** di scrivere: `gym-app_2026-11-08` (struttura 95,8 KB, dati 31,6 KB; 124 righe, 10 migrazioni). Nessun backup cancellato, ora sono 7.
3. Controlli in sola lettura: ID vecchio non esiste più; l'utente nuovo esiste una volta sola e ha solo il profilo (0 piani, 0 sedute, tutto il resto vuoto).
4. Dal backup `gym-app_2026-11-06_2135` (file `_dati.sql`, solo lettura) prese **solo** le righe dell'ID vecchio: 198 righe (199 meno il profilo, che non si tocca: si tiene quello nuovo, che ha gli stessi valori di prima). ID vecchio sostituito con il nuovo solo nelle colonne `user_id`, `created_by`, `added_by`. Niente di `auth`, niente libreria, niente Raina. Il file SQL è fuori dal progetto (cartella temporanea di Claude).
5. Prova generale online dentro una transazione annullata apposta: tutte le 198 righe entrate, chiavi esterne e conteggi giusti; dopo, database ancora vuoto (controllato).
6. **Ripristino vero**: una sola transazione, controlli del database accesi (senza `session_replication_role`), email controllata prima di scrivere, conteggi controllati prima del COMMIT. Righe scritte: import_batches 1, clubs 1 (palestra privata), club_machines 20, user_clubs 1, plans 1, plan_days 4, plan_exercises 27, plan_exercise_machines 22, sessions 7, session_exercises 39, sets 75.
7. Controllo dopo, in sola lettura: piano attivo 1, sedute 7, serie 75, esercizi del piano 27, palestra privata 1, righe orfane 0, ID vecchio da nessuna parte, libreria pubblica 22 esercizi e 20 macchine, profilo di Raina presente, 2 utenti.

- **Forse perse**: le sedute e le serie registrate **dopo le 21:35 del 2026-11-06** fino alla cancellazione dell'utente. Non sono in nessun backup. Se erano ancora sul telefono in attesa di invio, potrebbero esserci ancora lì: non cancellare i dati dell'app sul telefono.
- Lo starter (CHOOSE YOUR STARTER) del profilo nuovo è vuoto: l'app lo chiederà di nuovo.

### Pelle unita in locale (con l'ok di Leonardo)

- `git switch claude/app-v1` e `git merge skin-track`: fast-forward, nessun conflitto. `npm test` 81 su 81; build di produzione riuscita e controllata (solo gym-app, nessuna chiave segreta, nessun indirizzo del database locale: `localhost`/`127.0.0.1` compaiono solo nella lista interna della libreria supabase-js).
- **Non lanciati**: `npm run test:locale` e `npm run test:e2e` (usano il database locale e creano e cancellano un atleta finto).
- Commit `9a655c9` "stato: ripristino dati e skin unita" (solo STATO.md; firmato come i commit prima, impostazioni di git non cambiate).

### Push e deploy (con l'ok di Leonardo)

- `npm test` di nuovo 81 su 81. `git push origin claude/app-v1`: riuscito (`57f6a0a..9a655c9`), senza force.
- Accesso a Cloudflare valido (`wrangler whoami`). Versione online prima del deploy: `3f36de84-bb6e-4d88-8b5c-b00334f7f569` (deploy del 6/11, 21:41).
- Build di produzione, controllata **prima** di caricarla: nessun `127.0.0.1:54321` / `localhost:54321`, solo il ref di gym-app, nessuna chiave segreta (solo quella pubblica), pelle nuova nel CSS. Caricata esattamente quella con `npx wrangler@4 deploy` (il secondo pezzo di `npm run deploy`, così non si rifà la build dopo il controllo): 4 file nuovi (pagina, JS, CSS, `sw.js`), 18 uguali. Versione Cloudflare nuova: `9a516753-a63e-44cd-8f11-ae364506a114`. Piano gratuito: nessun costo.
- Verifica online: pagina, CSS, JS e `sw.js` rispondono 200; il CSS online ha i colori della pelle (#0B0B0F, #17171D, #8B6CF0, #5B45B8, #3DDC97); `sw.js` mette in cache il CSS nuovo; versione dell'app "08/11/2026 00:49".
- **Per tornare indietro** (solo se serve, con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback 3f36de84-bb6e-4d88-8b5c-b00334f7f569`.

## Prima, oggi (pelle della schermata ALLENAMENTO)

- La "schermata Track" del brief è la schermata **ALLENAMENTO** (l'unica con serie, Kg/Rep/RIR, timer e volta scorsa). Scelte di Leonardo: pelle **solo col tema notte** (il tema giorno resta com'era) e **solo colori e forme** (niente si sposta: "Volta scorsa" resta sopra le caselle, "Salva serie" resta nella carta, il timer resta in basso).
- Un solo file toccato: `app/src/styles.css` (il file del tema che c'era già). In fondo una sezione "PELLE TRACK" con i token (sfondo #0B0B0F, carte #17171D, viola #8B6CF0 / #5B45B8, verde #3DDC97 solo per lo stato "tutto salvato", testo bianco e grigio #9A9AA8, angoli 18/12 px, numeri a 46 px) e le regole. Vale solo se la pagina è la seduta e il tema è notte: accesso e CHOOSE YOUR STARTER non cambiano.
- Cosa cambia: serie fatte = riga grigia con cerchio viola e spunta (prima riga verde); serie da fare con cerchio vuoto; caselle Kg/Rep scure e arrotondate; RIR scelto in viola; suggerimento di carico (c'era già, `suggest()` in `logic.js`) in viola e più grande; volta scorsa in carta grigia con bordo; "Salva serie" unico tasto grande viola (il giorno scelto ora è contornato di viola, non pieno); barra del timer viola. Errori ed "Elimina" restano rossi.
- Nessun testo, nessuna funzione, nessun dato, salvataggio, sync o database toccato.
- **Prove**: `npm test` 81 su 81 prima e dopo; build riuscita prima e dopo (fatta in una cartella temporanea, `app/dist` non toccata). Prova nel browser senza rete, con dati finti solo nel browser di prova (ogni richiesta verso internet bloccata), sulla versione di prima e su quella nuova: 9 controlli su 9 per tutte e due (seduta aperta, suggerimento, volta scorsa, serie salvata sul telefono e in coda, timer, serie ancora lì dopo la riapertura, modifica al tocco, tema giorno uguale a prima, nessun errore).
- **Non lanciate**: `npm run test:locale` e `npm run test:e2e` (servono il database locale e creano/cancellano un atleta finto: per le regole serve l'ok di Leonardo).
- Server di prova (`npm run dev`, http://localhost:5173/, solo database **locale** 127.0.0.1:54321) acceso e poi fermato. Commit `fd723c0` "skin: schermata Track" (styles.css + STATO.md), con l'ok di Leonardo; poi un secondo commit solo per STATO.md. Nessun push.

## Prima (CHOOSE YOUR STARTER)

- **Deploy (2026-11-06, 21:41), con l'ok di Leonardo**: git pulito e allineato con GitHub (`5f10f6d`); accesso a Cloudflare valido (`wrangler whoami`); migrazione `20261107090000` già online (controllato in sola lettura); `npm test` 81 su 81; build di produzione controllata (solo gym-app, nessuna chiave segreta, nessun indirizzo del database locale; la parola `sb_secret_` è solo un controllo dentro la libreria supabase-js). `npm run deploy`: riuscito, 7 file nuovi caricati (pagina, JS, CSS, `sw.js`, tre mascotte). Verifica online: pagina, `sw.js` e manifest rispondono 200; le tre mascotte (`gorilla`, `lion`, `tiger` .png) sono nella lista dei file per l'uso offline e rispondono 200 come `image/png`. Piano gratuito di Cloudflare: nessun costo.
- **Migrazione online, fase B (2026-11-06, 21:36), con l'ok di Leonardo**: CLI collegata a `gym-app` (controllato); dry-run di nuovo con solo `20261107090000_profiles_starter.sql`; backup `gym-app_2026-11-06_2135` (struttura 95,5 KB, dati 86,6 KB; 333 righe, 9 migrazioni; nessun backup cancellato, ora sono 6); `npx supabase db push --remote=<ref di gym-app> --yes`: **applicata**, nessun errore. Verifica in sola lettura: colonna `profiles.starter` presente (testo, controllo gorilla/lion/tiger), migrazione registrata; 2 profili, tutti e 2 con starter vuoto (null). Nessun dato toccato.
- **Migrazione online, fase A (2026-11-06, 20:39)**: CLI collegata a `gym-app` (controllato). File della migrazione controllato: solo colonna, controllo dei valori, commento. Backup `gym-app_2026-11-06_2039` (struttura 95,5 KB, dati 86,4 KB; 332 righe, 9 migrazioni; nessun backup cancellato, ora sono 5). Dry-run (`npx supabase db push --remote=<ref di gym-app> --dry-run`): verrebbe applicata **solo** `20261107090000_profiles_starter.sql`. **Niente applicato online**, niente commit.

- **Fase 1 (sola lettura)**: l'app non ha un onboarding e non ha schermate Program e Progress (solo seduta + menu). Un solo progetto Supabase: `gym-app`. Piano approvato da Leonardo con le sue decisioni (in `DECISIONI.md`).
- **Migrazione** `supabase/migrations/20261107090000_profiles_starter.sql`: colonna `profiles.starter` (testo, null = non scelto), controllo `gorilla` / `lion` / `tiger`, commento. Nessun trigger, nessuna regola di blocco. Applicata prima al database locale (`npx supabase migration up`, senza reset; 4 profili prima e dopo), poi **online su `gym-app`** (fase B, sotto).
- **App**: schermata CHOOSE YOUR STARTER a tutto schermo (tre carte, tocco, Conferma, poi la seduta), solo dopo che il server ha detto "vuoto"; scelta salvata sul telefono e inviata appena c'è rete, senza doppioni (scrive solo se online è ancora vuoto); "Esci" bloccato finché non è inviata; piccola immagine nel menu accanto all'account. Lettura dello starter separata dal piano: se fallisce, la seduta funziona lo stesso.
- File nuovi: `app/src/starter.js`, `app/src/assets/starters/` (immagini), `app/tests/unit/starter.test.js`. Modificati: `api.js`, `main.js`, `i18n.js`, `styles.css`, `tests/locale/supabase.test.js`, `scripts/e2e.mjs`, `docs/app.md`, `docs/database.md`, `DECISIONI.md`.
- Commit `c8a2617` (con SVG segnaposto), poi `701b3d9` con le mascotte vere (sotto). Tutti e due **pubblicati su GitHub** (push con l'ok di Leonardo, senza force push; branch allineato: locale e GitHub su `701b3d9`).
- **Mascotte vere** (fase 3): l'originale di Leonardo (nella radice si chiamava `Vintage Trio Gym Mascots.png`, con gli spazi; 2172 × 724, sfondo **già trasparente**) ora è in `docs/immagini/`. Ritagliate in `gorilla.png` (130 KB), `lion.png` (138 KB), `tiger.png` (128 KB), 480 px di altezza, tagli nelle colonne vuote (55–723, 756–1412, 1446–2129) con 8 px di margine, stessa scala; tolti solo il velo quasi invisibile (alfa ≤ 16) e 1 pixel isolato. I tre SVG segnaposto tolti (ok di Leonardo); nessun riferimento rimasto. Stili: `object-fit: contain` sulle carte e nel menu (niente deformazioni, niente ritaglio a cerchio).
- **Prove, tutte verdi**: logica 81 (67 + 14), database locale dall'app 25 (17 + 8), browser 69 (58 + 11: starter non leggibile → niente schermata, schermata con server vuoto, mascotte PNG caricate senza deformazioni, scelta offline, "Esci" bloccato, invio al ritorno della rete, la schermata non torna, immagine nel menu), database 110 su 110, `db lint` nessun errore. Screenshot: `app/tests/out/11-starter.png`, `app/tests/out/12-menu-starter.png`.
- Nessun dato online toccato, nessun deploy, niente cancellato oltre ai tre SVG segnaposto (con ok). Gli atleti finti delle prove sono creati e cancellati dalle prove stesse, solo in locale.

## Prima, oggi (tasto "Fine seduta" e controllo inglese)

### Tasto "Fine seduta" (decisione di Leonardo)

- **Controllo (sola lettura)**: `ended_at` esiste; l'atleta può già modificare le sue sedute (permesso `update` e regola `sessions_update`); il database rifiuta una fine prima dell'inizio. La coda offline invia già le modifiche (upsert sulla stessa riga, l'ultima versione vince, sedute prima di esercizi e serie). **Nessuna migrazione, nessuna modifica online.**
- **Fatto** (solo in locale): tasto "Fine seduta" in fondo alla seduta, sotto "Prossimo", separato e con aspetto diverso; compare solo dopo la prima serie. Scrive `ended_at` (mai prima dell'ultima serie), non cancella niente. Dopo: schermata vuota con "Seduta chiusa alle HH:MM · Riapri". Serie dopo la chiusura → seduta nuova. Funziona offline. Spazio in fondo alla pagina aumentato perché il timer di recupero non stia vicino al tasto.
- File: `app/src/session.js` (closeSession, reopenSession), `logic.js` (reopenable), `main.js`, `styles.css`, `i18n.js`; guida in `docs/app.md`; `DECISIONI.md`.
- Le 3 ore dopo mezzanotte: **restano per ora** (decisione di Leonardo); se ne riparla dopo qualche settimana di uso vero.

### Controllo inglese (decisione di Leonardo: lingua automatica)

- **Controllo (sola lettura)**: con il telefono in cinese l'app era già in inglese. Nomi nel database online (letti, nessuna scrittura): 22 esercizi, 19 muscoli, tutti con l'inglese (3 uguali in tutte e due le lingue: Hack squat, Leg extension, Leg press); 20 macchine senza nome, l'app mostra marca · modello · codice. **Nessuna modifica al database.**
- **Corretto nel codice**: inglese neozelandese (`en-NZ`, prima `en-GB`); date con l'anno quando non è quello di oggi; versione dell'app in giorno/mese/anno; pagina con `lang="en"` di base; manifest in inglese; messaggi che erano solo in italiano (configurazione mancante, "Sync", "back", errore generico); un errore di salvataggio che diceva "Accesso non riuscito" (ora "Salvataggio non riuscito" / "Could not save").

### Prove (tutte verdi)

- Logica: 67 (50 + 10 "Fine seduta" in `app/tests/unit/fine-seduta.test.js` + 7 lingua in `app/tests/unit/i18n.test.js`). Sul codice dell'ultimo commit 15 delle 17 nuove falliscono; le 2 che passano controllano cose già giuste (ripiego inglese, nomi dal database).
- Database locale (app): 17 (14 + 3: chiusura e riapertura anche offline, un altro atleta non può chiudere, fine prima dell'inizio rifiutata).
- Browser: 58 (43 + 15: due telefoni con chiusura online, offline, Riapri, doppia chiusura, chiusa sull'altro telefono, senza serie, seduta nuova dopo la chiusura, distanza dal timer; telefono in cinese). Sul codice dell'ultimo commit la prova si ferma già alla sezione 11 (mezzanotte).
- Database: 110 su 110. `db lint`: nessun errore.
- Solo atleti finti nel database locale. Online solo lettura dei conteggi dei nomi.

## Prima, oggi (controllo: fine seduta e seduta nuova)

Problema segnalato da Leonardo: nella vecchia app le serie restavano e la settimana dopo andavano cancellate a mano.

- **Controllo (sola lettura)**: la nuova app non ha questo problema. La seduta è legata a data + giorno del piano: la settimana dopo lo stesso giorno parte vuoto e la seduta vecchia è la volta scorsa. Nessun tasto "fine seduta". Aprire l'app non crea sedute.
- **Due problemi trovati e corretti** (solo in locale, `app/src/logic.js`, `session.js`, `main.js`):
  1. Allenamento a cavallo della mezzanotte: dopo le 00:00 l'app cambiava giorno del piano (rotazione) e le serie finivano in una seduta nuova di un altro giorno. Ora la seduta resta in corso per 3 ore dopo l'ultima serie.
  2. Due telefoni (o due schede) senza rete che iniziano la stessa seduta: le serie di uno dei due sparivano dalla schermata e comparivano come "volta scorsa · oggi". Ora l'app le mostra insieme; nel database restano due sedute, niente si cancella.
- Regola scritta in `docs/app.md` ("Quando inizia una seduta nuova") e in `DECISIONI.md`.
- **Prove nuove**: 13 prove della logica e del salvataggio (`tests/unit/seduta-nuova.test.js`: settimana dopo, doppia apertura, seduta a metà, cambio giorno, mezzanotte, seduta chiusa, offline, due telefoni) e 16 controlli nel browser (`scripts/e2e.mjs`, sezioni 9-11, con l'orologio del browser spostato e la rete spenta: nessuna data futura arriva nemmeno al database locale).
- **Risultati**: 50 prove della logica (37 + 13), 14 sul database locale, 43 nel browser (27 + 16), 110 del database: tutte verdi.
- Nessun dato online toccato, nessuna migrazione, nessuna cancellazione. Dati usati: solo atleti finti nel database locale (creati e cancellati dalle prove).

## Sessione precedente (passo 4: app v1 come PWA)

### Dopo l'ok di Leonardo allo STOP 1

1. Backup `gym-app_2026-11-06_1258` (299 righe, 9 migrazioni; nessun backup cancellato, ora sono 4).
2. Chiave **pubblica** (`sb_publishable_`) di gym-app in `app/src/config.js`, letta con lo strumento Supabase che dà solo le chiavi pubbliche. Prova sulle chiavi: verde. Nel build pubblicato: nessuna chiave segreta, solo gym-app.
3. Regola nuova in `CLAUDE.md`: niente cancellazioni di database o file, anche locali, senza ok; mai `--no-backup`.
4. Accesso a Cloudflare controllato (`wrangler whoami`: valido). Wrangler 4.158 manda i comandi "pages" alla nuova versione di Pages dentro Workers: aggiunto `app/wrangler.jsonc`, pubblicata con `npm run deploy` su **https://gym-app.gym-app-pwa.workers.dev**. Il primo tentativo (`pages project create`) non ha creato niente.
5. Verifica online in sola lettura (nessun accesso con account): il certificato HTTPS del nuovo indirizzo è arrivato dopo circa 2 minuti; pagina di accesso, service worker attivo e file in cache, intestazioni di sicurezza attive; senza accesso Supabase rifiuta la lettura (401), come deve.
6. Nessun dato scritto online, nessuna modifica al database.

### Fino allo STOP 1

- Nuovo branch `claude/app-v1`. App in `app/` (guida: `docs/app.md`; scelte: `DECISIONI.md`, 2026-11-06 "App v1").
- **Tecnologia**: JavaScript semplice + Vite + `supabase-js`; serie salvate prima sul telefono (IndexedDB) con coda di invio; service worker per aprirsi senza rete. Grafica di `web-app.html` (logo, giorni, giorno/notte, modifica serie, timer), più: suggerimento in grande, volta scorsa piccola, macchina e salti di peso, stato del salvataggio sotto "ALLENAMENTO", menu toccando il logo (account, memoria del telefono, lingua, invia ora, esci).
- **Hosting scelto: Cloudflare** (gratis; limiti verificati oggi sulle pagine ufficiali). GitHub Pages scartato (gratis solo con repository pubblico; e `github.io/gym-app` serve ancora l'app attuale).
- **Prove, tutte verdi**: 37 prove della logica e della coda (`npm test`), 14 prove sul database locale (`npm run test:locale`: accesso, isolamento tra atleti, iscrizioni chiuse, volta scorsa, offline, risposta persa, due telefoni), 27 controlli nel browser (`npm run test:e2e`: accesso, suggerimento, salvataggio in 15 ms, riapertura senza rete in circa 25 ms, modifica offline, sincronizzazione senza doppioni, eliminazione morbida). Le 110 prove del database: ancora 110 su 110.
- Problemi trovati con le prove e corretti: file dell'app non trovati nella cache senza rete; invio non ripartito subito al ritorno della rete; richieste appese con poco segnale (ora tempo massimo 15 secondi).
- **Database locale ricreato**: fermando i servizi locali ho usato per sbaglio `--no-backup`, che cancella il database **locale** di prova. Conteneva solo migrazioni e dati finti; ricreato identico con `npx supabase start` (9 migrazioni + `seed.sql`), 110 prove verdi. Online nessun effetto.
- Nel database locale c'è un atleta finto per provare a mano (`npm run dati-finti`; email e password in `app/.env.locale`, ignorato da git). Le prove automatiche creano e cancellano i loro utenti finti.
- Nessuna modifica al database (nessuna migrazione nuova). Nessun dato finto online. Nel repository solo la chiave **pubblica** di gym-app (in `app/src/config.js`, aggiunta dopo l'ok).

## Sessione precedente (passo 3: import del piano e dell'ultima settimana)

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

- **Supabase, progetto `gym-app`**: organizzazione Gym App, piano free, Sydney (ap-southeast-2), ref `kclgcqwmvqqkogkhycgb`, creato da Leonardo il 2026-11-05. Impostazioni: "Automatically expose new tables" spento (in locale lo stesso con `auto_expose_new_tables = false` in `supabase/config.toml`), "automatic RLS" acceso. Accesso: solo email e password, iscrizioni nuove chiuse (verificato il 2026-11-06), conferma email accesa. Contiene 10 migrazioni (26 tabelle; la decima, del 2026-11-06 sera, aggiunge `profiles.starter`) e 2 account (quello di Leonardo ricreato da lui il 2026-11-07/08: ID nuovo). **Dati di Leonardo ripristinati il 2026-11-08 dal backup del 6/11 alle 21:35**: piano attivo (4 giorni, 27 esercizi), 7 sedute e 75 serie, 1 palestra privata (principale) con 20 macchine, 1 registro di import. Quello che era stato registrato dopo le 21:35 del 6/11 manca. Libreria pubblica: 22 esercizi, 20 macchine (non verificati). Più 19 muscoli e 5 tipi di serie. Nessun dato di Raina. pgTAP non installata.
- **GitHub** (`leonardo752010-coder/gym-app`, pubblico): tutti i branch della tabella sopra, compreso `claude/app-v1` (con CHOOSE YOUR STARTER, l'originale delle mascotte in `docs/immagini/`, la pelle ALLENAMENTO, la correzione dell'accesso, la barra a tre pagine l'icona nuova `abcac6e`, il logo silverback dentro l'app `dbf3cbf` e la versione visibile `41af5f7`, tutti pubblicati). `skin-track`, `nav-tre-pagine`, `icona-app`, `logo-interno` e `versione-app` restano solo in locale. `main` pubblica la PWA su GitHub Pages.
- **Cloudflare** (account di Leonardo, piano gratuito): app v1 pubblicata su https://gym-app.gym-app-pwa.workers.dev (progetto `gym-app`, solo file statici), versione **con** CHOOSE YOUR STARTER, la pelle ALLENAMENTO, la correzione dell'accesso, la barra a tre pagine, l'icona nuova, il logo silverback dentro l'app e la versione visibile (deploy del 2026-11-08 mattina, versione dell'app "08/11/2026 11:30", Cloudflare `2b10a14a`). Si ripubblica con `npm run deploy` nella cartella `app/`.
- **Supabase `gym-app`**: 10 migrazioni, colonna `starter` presente online (2 profili; starter di Leonardo vuoto dopo la ricreazione dell'utente). L'app online la usa dal deploy delle 21:41 del 6/11.
- **Cloudflare**: l'app online **ha** la pelle nuova, la correzione dell'accesso, la barra a tre pagine, l'icona nuova, il logo silverback dentro l'app e la versione visibile (versione "08/11/2026 11:30").
- **App in uso oggi**: Google Apps Script + Google Sheets (vedi `HANDOFF.md`). Resta in uso fino al passaggio alla nuova app.

## Cosa è solo sul computer di Leonardo

- Docker Desktop e WSL (servono per il database di prova in locale).
- Database locale di prova con i dati finti (`npx supabase start`; ora girano anche accesso e API, servono all'app). Ha le stesse 10 migrazioni di `gym-app`. Ricreato il 2026-11-06 (vedi sopra).
- Per l'app v1 (il codice è su GitHub): le sue librerie (`app/node_modules`), Chromium per le prove (cartella di Playwright nel profilo utente), icone create da `app/risorse/Gym-app-icon.png` (`app/public/icons`, ignorata da git), l'originale del logo `app/risorse/Gym-logo-silverback-v5.png` (non su GitHub; serve solo per rifare i logo con `node scripts/logo.mjs`), anteprime e screenshot in `app/tests/out/icone/` e `app/tests/out/logo/` (ignorate da git), e `app/.env.locale` (indirizzo e chiave pubblica del database **locale** + password dell'atleta finto; ignorato da git).
- **Cartella import**: `C:\Users\Leonardo Valentini\Documents\gym-app-import` con le copie dei due fogli (`gym-bulk2.xlsx`; `comeback.xlsx` non si usa), i collegamenti e i resoconti. Dati veri: mai su GitHub.
- Supabase CLI (`node_modules/`, con `npm install`), con l'accesso al tuo account Supabase e il collegamento a `gym-app` (`supabase/.temp/`). Cartelle ignorate da git.
- **Backup**: `C:\Users\Leonardo Valentini\Documents\gym-app-backup`. Ci sono 7 backup: 6 del 2026-11-06 (`1218` dopo l'import, `2135` quello usato per il ripristino) e `gym-app_2026-11-08` (subito prima del ripristino, con l'utente nuovo vuoto). Lo script ne tiene 8: al prossimo backup non si cancella niente, a quello dopo si cancella il più vecchio. **Copia di sicurezza** dei 12 file del 6/11 in `C:\Users\Leonardo Valentini\Documents\gym-app-backup-COPIA` (lo script non la tocca). I backup non vanno mai su GitHub né online.

## Prossimo passo

Versione visibile online: sul telefono aprire l'app con internet, aspettare qualche secondo, chiuderla del tutto e riaprirla. In fondo alla schermata (accesso, caricamento, menu, Programma) deve comparire **"Versione 08/11/2026 11:30"**. Se compare ancora 02:42, la prima apertura ha solo scaricato la versione nuova: chiudere e riaprire ancora una volta. **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback 9d818b5c-9557-4a3b-a564-433793cbfd9e`.

Logo nuovo online: sul telefono aprire l'app con internet, aspettare qualche secondo, chiuderla del tutto e riaprirla (nel menu "Versione" = 08/11/2026 02:42). Controllare il logo completo all'accesso e nel menu, e il gorilla con bilanciere nel cerchio in alto. **Per tornare indietro** (solo con l'ok di Leonardo): nella cartella `app/`, `npx wrangler@4 rollback d1e94790-d32f-4ba6-a8d3-896968ad9ed3` (torna alla versione 02:18, con la testa con la corona nel cerchio). Icona sulla Home (gorilla con corona, dalla versione 02:18): su Android l'icona sulla Home si aggiorna da sola (anche dopo qualche giorno); su iPhone bisogna togliere l'app dalla Home e aggiungerla di nuovo.

Barra a tre pagine online: sul telefono aprire l'app con internet, aspettare qualche secondo, chiuderla del tutto e riaprirla (nel menu "Versione" = 08/11/2026 02:04). Poi provare i tre tasti, il tasto indietro e che il timer non copra niente (soprattutto su iPhone, con la barra di sistema in basso).

Accesso: sul telefono e sul computer aprire l'app con internet, aspettare qualche secondo, chiuderla del tutto e riaprirla (nel menu "Versione" = 08/11/2026 02:04 o successiva). Se compare "Accesso scaduto", entrare con email e password. Poi CHOOSE YOUR STARTER e il piano. **Non cancellare i dati dell'app sul telefono** (ci sono le 2 sedute in coda).

Leonardo apre l'app online e controlla che piano, sedute e serie ci siano di nuovo (rifà CHOOSE YOUR STARTER) e dice se mancano sedute fatte dopo le 21:35 del 6/11.

Pelle ALLENAMENTO online: aprire l'app con internet, aspettare qualche secondo, chiuderla del tutto e riaprirla (la seconda apertura usa la versione nuova: nel menu "Versione" = 08/11/2026 00:49). Poi guardare la seduta col tema notte. A Leonardo l'app chiederà di nuovo CHOOSE YOUR STARTER (profilo nuovo); a Raina solo se non l'ha ancora scelto.

Poi: Leonardo installa l'app sul telefono, accede e registra una seduta vera (prova con i dati veri).

## Da decidere o fare per Leonardo

- **Versione visibile**: controllare sul telefono che si legga. Oggi l'app nuova arriva alla **seconda** apertura dopo un deploy (scelta voluta: niente ricarica automatica mentre si scrive una serie). Se si vuole un avviso "Versione nuova pronta: tocca per aggiornare", è un lavoro a parte da decidere. La versione non compare nella schermata CHOOSE YOUR STARTER (non toccata per regola). Branch solo locale `versione-app` (uguale a `claude/app-v1`): dire se si può cancellare (solo con l'ok di Leonardo). Git sul computer non ha nome ed email impostati: se Leonardo vuole, li imposta lui (`git config user.name` / `user.email`).

- **Icona nuova**: committata, su GitHub e pubblicata. Su iPhone togliere l'app dalla Home e aggiungerla di nuovo per vedere l'icona nuova. `Gym-logo-silverback-v5.png` resta fuori dai commit, sul computer. Se si vuole il logo completo da qualche parte (per esempio nella schermata di accesso, al posto del cerchio) è un cambio di layout: da decidere a parte.

- **Barra a tre pagine**: online. Se non piace, rollback con il comando scritto sopra (solo con l'ok di Leonardo). Etichetta del tasto centrale: oggi "Allenamento" / "Workout" (come il titolo della pagina); se si preferisce "Track" come nel mockup, è una parola da cambiare.
- Branch solo locali `nav-tre-pagine` e `icona-app` (uguali a `claude/app-v1`): dire se si possono cancellare (solo con l'ok di Leonardo).

- Le 2 sedute in coda sul telefono (sotto l'utente vecchio): decidere se spostarle sull'utente nuovo e inviarle (lavoro a parte, tocca i dati del telefono) oppure rifarle a mano.

- Dopo il ripristino: controllare i dati nell'app; dire se ci sono sedute dopo le 21:35 del 6/11 da rifare a mano. **Non cancellare più utenti dal pannello**: si portano via tutti i dati.
- Pelle online: se non piace, si torna alla versione di prima con il comando di rollback scritto sopra (solo con l'ok di Leonardo). Se si cancella il branch `skin-track` (ormai uguale a una parte di `claude/app-v1`): solo con l'ok di Leonardo.
- Pelle ALLENAMENTO (commit `fd723c0`, ora in `claude/app-v1`): guardarla a occhio. Da decidere dopo: tasto "Salva serie" fisso in basso con il timer a sinistra e "Volta scorsa" sotto le caselle (oggi non spostati, per scelta); pelle anche per il tema giorno, l'accesso e CHOOSE YOUR STARTER; colore della barra in alto del telefono (oggi resta #121110).

- CHOOSE YOUR STARTER: tutto fatto (push, migrazione online, deploy). Da controllare sul telefono che la schermata compaia una volta a Leonardo e a Raina.
- Sul tema chiaro il bordo crema delle mascotte si confonde con lo sfondo crema delle carte, e i graffi della tigre e le stelline del leone si vedono poco. Sul tema scuro va bene. Decidere se va bene così.

- Dopo qualche settimana di uso vero: rivedere le 3 ore dopo mezzanotte (tenerle o toglierle).
- Impostazioni online in italiano o di default (email di Supabase, nome del sito, ecc.): vedi elenco dato a Leonardo il 2026-11-06; nessuna è stata toccata.

- Installare l'app sul telefono e accedere (Claude non conosce e non inserisce le password).
- Durante la prova: registrare le serie solo nella nuova app, solo nella vecchia, o in tutte e due? (Con tutte e due il foglio GYM e Supabase restano completi, ma è doppio lavoro.)

- Avviso di sicurezza: "Leaked password protection" spenta (Authentication → impostazioni delle password). Decidere se accenderla.

- Aggiungere l'indirizzo https://gym-app.gym-app-pwa.workers.dev come indirizzo del sito e di reindirizzamento in gym-app (serve solo per le email, per esempio il reset della password; l'accesso con password funziona anche senza).
- Reset della password per Raina: il servizio email gratuito di Supabase manda poche email e solo agli indirizzi del team del progetto. Se serve, configurare un servizio email proprio (SMTP).
- Backup settimanale dei dati (docs/backup.md)
- Approvare (o no) il merge di `claude/database` su `main`.
- Account di Raina in `gym-app`: non serve per l'import (per Raina niente import); solo quando userà la nuova app.
- Dire se i branch vecchi (`claude/fondamenta`, `codex/handoff-2026-11-05`, `handoff/codex-2026-11-05`, `claude/nota-funzioni`, `claude/nota-funzioni-main`) si possono cancellare: il loro contenuto è già in `main` o in `claude/database`.
- Rendere privato il repository: la nuova app non dipende più da GitHub Pages, ma la vecchia app (`github.io/gym-app`) sì, finché è in uso.
- Mai copiare chiavi o password del progetto Supabase nel repository.

## Roadmap (passo attuale in grassetto)

1. Fondamenta del repository — fatto; repository privato dopo lo spostamento dell'hosting.
2. Database Supabase (Sydney): tabelle, regole di accesso, file di migrazione — fatto, in attesa del merge.
3. Trasferimento del piano attuale e dell'ultima settimana di Leonardo, con controllo — fatto online il 2026-11-06 (Raina: niente import).
4. **Nuova app, parte seduta** — app v1 (PWA) pubblicata il 2026-11-06; seduta nuova, tasto "Fine seduta" e inglese pubblicati la sera del 2026-11-06; CHOOSE YOUR STARTER pubblicato la notte del 2026-11-06.
5. Nuova app, parte piano.
6. Passaggio alla nuova app.
7. Stage 0: 4 settimane di uso vero.
8. Prova con 2-3 tester esterni.
9. Dopo lo Stage 0: import Excel/CSV, analisi, mesocicli, libreria macchine, store.
