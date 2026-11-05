# Import dai fogli Google (passo 3) — guida semplice

Script una tantum per portare nel database il piano attuale e l'ultima settimana di STORICO del foglio GYM di Leonardo.
Del foglio di Raina non si importa niente: lo script lo riconosce e lo rifiuta.
Non è la funzione "importa da Excel" per gli utenti (quella è al passo 9).

## Dove stanno i file

Tutto quello che contiene dati veri sta **fuori dal repository**, in `Documenti\gym-app-import\`:

| File | Cosa è |
|---|---|
| `gym-bulk2.xlsx` | il foglio scaricato (File → Scarica → Microsoft Excel) |
| `collegamenti-gym.json` | la palestra e, per ogni nome scritto nel foglio, esercizio (+ macchina) |
| `resoconto-import-*.md` | cosa ha letto, scartato, controllato ogni comando |

Lo script si rifiuta di leggere o scrivere questi file dentro il repository; `.gitignore` li blocca comunque.

## I comandi

```bash
npm run import -- bozza    --file gym-bulk2.xlsx --formato gym --dal 2026-10-30 --al 2026-11-06
npm run import -- secco    --file gym-bulk2.xlsx --formato gym --dal 2026-10-30 --al 2026-11-06
npm run import -- importa  --file gym-bulk2.xlsx --formato gym --dal 2026-10-30 --al 2026-11-06 --email <account> --prova
npm run import -- importa  --file gym-bulk2.xlsx --formato gym --dal 2026-10-30 --al 2026-11-06 --email <account>
npm run import -- verifica --file gym-bulk2.xlsx --formato gym --dal 2026-10-30 --al 2026-11-06 --email <account>
npm run import -- annulla  --import-id <id dal resoconto> --email <account>
```

- `bozza`: crea o completa il file dei collegamenti. Ogni nome nuovo nasce "da controllare" (con "/" nel nome: "da decidere").
  Leonardo controlla e mette `"stato": "ok"` (oppure `"ignora"`). Senza tutti "ok" l'import non parte.
- `secco`: legge e controlla, **non tocca il database**.
- `importa --prova`: fa tutto dentro il database e poi annulla. Serve per la prova generale.
- `importa`: import vero. `--senza-piano` per aggiungere solo serie nuove (il piano si importa una volta sola).
- `verifica`: rilegge il database in sola lettura e lo confronta con il file.
- `annulla`: cancella sedute, serie e piano di quell'import (la libreria resta).
- Online: aggiungere `--online`. Solo sul progetto `gym-app`, con una parola da scrivere per confermare, **dopo `npm run backup`** e con l'ok di Leonardo.

## Le regole dello script

- **Periodo**: `--dal` e `--al` obbligatori per lo storico; al massimo 92 giorni (3 mesi) per import. Nessuna seduta nel periodo → si ferma.
- **Doppioni**: gli ID sono calcolati dai dati (persona + data + giorno + nome + numero della serie). Rilanciare non crea doppioni.
  Righe uguali nel foglio: una sola; stessa serie con valori diversi: errore.
- **Tutto o niente**: l'import è un solo blocco. Se un controllo fallisce non resta niente.
- **Controlli dopo la scrittura**: numero di serie e di sedute, ogni serie confrontata campo per campo, totali per esercizio
  (serie, reps, volume, peso massimo) e per mese, nessun doppione, nessuna riga di un'altra persona, piano giorno per giorno.
- **Palestra** (`"palestra": {"nome": ...}` nei collegamenti): privata di chi importa, principale se non ne ha già una, con tutte le macchine usate;
  nel piano ogni esercizio con macchina è legato a lei, e le sedute importate sono in quella palestra. Annullare un import non la cancella (come la libreria).
- **Macchine**: marca, modello, tipo e, se c'è, il codice della macchina (`"codice_marca"`, il codice scritto sulla macchina).
- **Righe del piano con 0 serie**: non si importano (finiscono tra le righe saltate).
- **Cosa si importa**: peso in kg + valore e unità scritti; "personal notes" → nota della serie; la nota del piano no;
  sedute senza legame al piano; RIR obiettivo dal pattern. Esercizi e macchine nuovi entrano nella libreria pubblica, non verificati.
- **Righe scartate**: vuote, fuori periodo, "[ ]" (da scegliere), doppioni identici. Errori (bloccano): data, giorno o esercizio mancanti,
  reps o peso mancanti o fuori misura, testo al posto dei numeri, lb nella colonna dei kg, peso e valore scritto che non coincidono.

## Prova con dati finti (solo locale)

```bash
npm run db:start
npm run import:prova
```

Crea file finti in `tests/out/import` (ignorata da git) con dentro apposta i casi sporchi, due utenti finti, e prova: bozza, prova a secco,
import di prova, import vero, palestra, verifica, rilancio senza doppioni, serie cambiata nel foglio, foglio di Raina rifiutato,
seconda persona e separazione, annullamento, cancellazione di un account con dati importati. Alla fine pulisce.
