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
