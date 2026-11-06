# Decisioni

Ogni cambio si aggiunge in fondo, con data e motivo. Non si cancellano le righe vecchie.

## 2026-11-05 — Impostazione del progetto

Obiettivo: portare l'app da Google Sheets + Apps Script a un'app veloce su database, costruita come se domani si iscrivessero 1.000 persone. Monetizzazione decisa più avanti.

| Tema | Decisione |
| --- | --- |
| Piattaforma | Web app installabile ora; store (App Store, Play) più avanti senza riscriverla |
| Offline | Ogni serie si salva prima sul telefono (coda locale con codice unico), poi va al database. Nessun log perso, nessun doppione |
| Dati | Tutto su Supabase. Google Sheet abbandonato; più avanti "esporta in Excel/CSV" |
| Server | Supabase, regione Sydney. Privacy: GDPR e Privacy Act NZ gestiti con la privacy policy |
| Budget | Supabase Pro (circa 25-30 $/mese) all'arrivo dei primi tester esterni |
| Storico | Si trasferiscono tutte le serie di Leonardo e Raina, controllate dopo il trasferimento |
| Codice | Repository da rendere privato dopo aver spostato l'hosting su Cloudflare Pages o Vercel |
| Sviluppo | Claude (principale) e Codex, con le regole di `AGENTS.md` |
| Accesso | Google, Apple, email e password |
| Lingue | Italiano e inglese; ogni testo traducibile dal primo giorno |
| Esercizi e macchine | Esercizio (movimento, muscolo, codice fisso) separato da macchina (marca, modello, codice, salti di peso). Macchine trovate per codice, per marca/modello, o create dall'utente |
| Club | Un solo piano; per ogni esercizio una macchina per club e una alternativa. A inizio seduta si sceglie il club |
| Piano | Giorni a rotazione e mesocicli; si avanza per allenamenti fatti (base) oppure per data |
| Serie | Tipi flessibili (normale, riscaldamento, drop, rest-pause, superserie...), serie in più parti, tipi personalizzati |
| In seduta | Ordine libero, si può saltare. Timer di recupero automatico. Suggerimento in grande, ultima seduta piccola sotto |
| Progressione | Doppia progressione di base; altri metodi a scelta |
| Coach | Struttura nel database pronta da subito; schermate più avanti |
| Analisi | Volume per muscolo, progressi per esercizio, peso corporeo vs forza, costanza |
| Dati esterni | Ora importazione da file (peso, passi, MacroFactor); con gli store Apple Salute e Health Connect |
| Piano vs Log | Separati: cambiare il piano non modifica mai lo storico |

## Ancora da decidere

- Macchine create dagli utenti: pubbliche subito ("non verificata") o solo dopo conferma.
- Come farsi pagare.
- Nome e logo del prodotto.
- Elenco delle tecniche di intensità da supportare (serve ricerca).
- Cosa fare di SESSIONE, del foglio THE COMEBACK e della sync MacroFactor dopo il passaggio.

## 2026-11-06 — Schema del database (passo 2)

Approvate da Leonardo sul piano del database. Dettagli in `docs/database.md`.

| Tema | Decisione |
| --- | --- |
| Superserie | Non è un tipo di serie: è un gruppo di esercizi (nel giorno del piano e nella seduta), con ordine e un solo recupero a fine giro |
| Tipi di serie | Normale, riscaldamento, drop, rest-pause, myo-reps + tipi personalizzati dell'utente. Le serie in più parti hanno le parti salvate a parte |
| Club | Entità condivisa come le macchine (pubblico/privato, verificato o no), con le sue macchine. Gli utenti si collegano ai club che frequentano. Più club possono appartenere a una catena |
| Importazioni | Ogni dato importato è legato a un utente esistente in Supabase Auth e al suo registro importazioni; il database impedisce di mescolare persone |
| Coach | Vede tutto dell'atleta dopo la sua conferma; modifica il piano solo se l'atleta lo permette; lo storico mai |
| Cancellazione | Morbida per sedute, esercizi della seduta e serie (`deleted_at`) |
| Libreria iniziale | Solo gli esercizi dei PIANO di Leonardo e Raina (al passo 3); la libreria completa resta al passo 9 |
| Volume per muscolo | 1 per il muscolo principale, 0,5 per i secondari, con il peso salvato per ogni coppia esercizio-muscolo |
| Libreria pubblica (provvisorio) | Finché non si decide sulle macchine degli utenti: gli utenti creano solo elementi privati e non verificati; quelli pubblici li crea solo l'importazione/manutenzione |
| Strumenti | Supabase CLI nel progetto (`package.json`), prove pgTAP in `supabase/tests/database`, Docker Desktop per provare in locale |

## 2026-11-06 — Import dai fogli (passo 3)

Decise da Leonardo sul piano del passo 3, poi corrette nello scopo (stesso giorno). Dettagli in `docs/import.md`.

| Tema | Decisione |
| --- | --- |
| Cosa si importa | Di Leonardo solo il piano attuale e le sedute dal 2026-10-30 al 2026-11-06. Nessuna seduta nel periodo → ci si ferma |
| Raina | Niente import: né storico né piano |
| Tetto | Al massimo 3 mesi di storico per ogni import futuro |
| Lettura | Fogli scaricati in .xlsx in `Documenti\gym-app-import` (fuori dal repository), letti con `exceljs` (solo sviluppo) |
| Esercizi e macchine | Elenco corto: solo i nomi che servono. Ogni nome → un esercizio + una scheda macchina minima (marca, modello, codice della macchina). Stesso movimento su macchine diverse = un esercizio con più macchine. Tipo di macchina "altro" quando non è chiaro |
| Righe del piano con 0 serie | Non si importano |
| Note | "personal notes" → nota della serie; la nota del piano copiata nello STORICO non si importa |
| Sedute importate | Senza legame al piano |
| Fuori dall'import | Peso, kcal e misure (MacroFactor); altre schede dei fogli |
| Palestra | Si crea solo la palestra attuale, privata di Leonardo e principale, con le macchine usate; nel piano ogni esercizio con macchina è legato a quella palestra e le sedute importate sono in quella palestra. La vecchia palestra non si crea. Il nome sta solo nel file dei collegamenti (fuori dal repository) |
| Ultima seduta di ogni esercizio | Non si importa. Idea futura: per un esercizio fatto di rado, importare la sua ultima seduta anche se più vecchia, così la "volta scorsa" c'è sempre |
| Collegamento all'import | Controllato a fine transazione (migrazione 9): così un account con dati importati si può cancellare |

## 2026-11-06 — App v1 come PWA (passo 4)

Leonardo ha chiesto a Claude di scegliere e giustificare tecnologia e hosting. Dettagli in `docs/app.md`.

| Tema | Decisione |
| --- | --- |
| Forma | PWA (sito installabile), niente store. Cartella `app/` |
| Tecnologia | JavaScript semplice + Vite (build) + `supabase-js`. Niente framework: la pagina approvata (`web-app.html`) è già in JavaScript semplice, l'app resta piccola e si apre in fretta |
| Dati sul telefono | IndexedDB (libreria `idb`) con coda di invio; id creati dal telefono; upsert sull'id; una riga esce dalla coda solo quando Supabase conferma quella versione |
| Offline | Service worker con tutti i file dell'app in cache; richiesta di memoria persistente al browser |
| Volta scorsa | Ultima seduta con lo stesso esercizio **sulla stessa macchina** (se il piano indica una macchina), serie cancellate e di riscaldamento escluse. Storico scaricato: ultimi 120 giorni |
| Suggerimento | Doppia progressione di base: range chiuso in tutte le serie → un salto di peso (passo o lista pesi della macchina, altrimenti 2,5 kg / 5 lb) e rep al minimo; altrimenti stesso peso e una rep in più |
| Palestra | Nella v1 si usa la palestra principale dell'utente (nessuna scelta a inizio seduta) |
| Lingua | Quella del telefono; si cambia dal menu |
| Hosting | Cloudflare Pages, piano gratuito, caricamento diretto (`npm run deploy`). GitHub Pages scartato: gratis solo con repository pubblico, e `github.io/gym-app` serve ancora l'app attuale |
| Prove | Vitest (logica e coda), prove sul database locale, prova nel browser con Playwright. Mai dati finti online |
| Seduta nuova (aggiunta 2026-11-06, dopo il controllo "fine seduta") | Una seduta è in corso solo se è di oggi (calendario del telefono) e senza `ended_at`; altrimenti lo stesso giorno del piano riparte vuoto e la seduta vecchia diventa la volta scorsa. Nessuna cancellazione. Eccezione: 3 ore dopo l'ultima serie per l'allenamento a cavallo della mezzanotte. Seduta a metà: nessun trattamento speciale |
| Tasto "Fine seduta" (Leonardo, 2026-11-06) | Tasto esplicito in fondo alla seduta, lontano da Salva e Prossimo; scrive `ended_at`, non cancella niente; "Riapri" come rimedio al tocco per sbaglio (niente domanda di conferma). Nessuna migrazione: colonna, permessi e regole di accesso esistevano già. Le 3 ore dopo mezzanotte restano per ora (Leonardo): da rivedere dopo qualche settimana di uso vero |
| Lingua (Leonardo, 2026-11-06) | Automatica dal telefono, menu per cambiarla. Italiano solo per telefoni in italiano, inglese per tutto il resto. Inglese neozelandese (program), date giorno/mese/anno, kg |

## 2026-11-06 — Pubblicazione dell'app v1

| Tema | Decisione |
| --- | --- |
| Hosting | Cloudflare "static assets" (la nuova versione di Pages, dentro Workers): wrangler 4.158 manda già i comandi "pages" lì. Indirizzo `https://gym-app.gym-app-pwa.workers.dev`. Gratis, solo file statici. Il vecchio Pages (`--force`) non si usa |
| Chiave | Nell'app solo la chiave pubblica `sb_publishable_` di gym-app (non la vecchia chiave "anon") |
| Cancellazioni | Regola di Leonardo (in `CLAUDE.md`): nessuna cancellazione di database o file, anche locali, senza il suo ok; mai `--no-backup` |

## 2026-11-06 — CHOOSE YOUR STARTER

| Tema | Decisione |
| --- | --- |
| Richiesta | Di Leonardo, esplicita (fuori dalla nota funzioni v1, scelta sua) |
| Dove | Non c'è un onboarding: schermata a tutto schermo dopo l'accesso, prima della seduta, solo se il server dice che lo starter è vuoto |
| Titolo | "CHOOSE YOUR STARTER" anche in italiano (Leonardo). Nomi delle carte e testi tradotti |
| Campo | `profiles.starter`: `gorilla`, `lion`, `tiger`; null = non scelto. Migrazione `20261107090000_profiles_starter.sql`: solo colonna, controllo dei valori e commento |
| Blocco "una sola volta" | Solo nell'app (Leonardo): nessun trigger o regola nel database. Si azzera a mano con `starter = null` |
| Copia vecchia sul telefono | La schermata compare solo dopo una risposta del server "vuoto"; se lo starter non si legge (offline, colonna non ancora online) l'app apre la seduta |
| Offline e doppioni | Scelta salvata sul telefono (IndexedDB `starter:<id>`), inviata appena c'è rete con un update che scrive solo se online è ancora vuoto: reinvio innocuo, vince la prima scelta arrivata. "Esci" bloccato finché non è inviata |
| Lettura | Richiesta separata da quella del piano: un suo errore non blocca la seduta. Così l'app nuova funziona anche se va online prima della migrazione |
| Immagine | Piccola immagine nel menu accanto all'account (Leonardo). Program e Progress non esistono ancora |
| Immagini | Segnaposto SVG (cerchio con iniziale: antracite, rosso `#d4412c`, crema `#f6e6c4`) in `app/src/assets/starters/`, da sostituire con le illustrazioni vere |
