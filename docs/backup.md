# Backup dei dati di gym-app

Il backup copia il database di gym-app (Supabase, Sydney) in due file sul tuo computer.
Lo lanci tu, a mano. Non ci sono attività pianificate né password salvate.

## Come lanciarlo

1. Apri **Docker Desktop** e aspetta che sia pronto (il backup usa `pg_dump` dentro Docker).
2. Apri un terminale nella cartella del repository (`Documents\03_GYM\gym-app-claude`).
3. Lancia:

```bash
npm run backup
```

Nessuna password: lo script usa l'accesso già fatto con `npx supabase login`.
Se la CLI dice che l'accesso è scaduto, rifai `npx supabase login` e rilancia.

Lo script:

- legge **solo** il progetto `gym-app` (ref `kclgcqwmvqqkogkhycgb`, scritto nello script) e non modifica né tabelle né dati
  (la CLI entra con il suo utente temporaneo, come per le prove online);
- non tocca mai altri progetti (per esempio `queens-ops-dev`), anche se la CLI fosse collegata a un altro;
- alla fine stampa dove ha salvato, quanto pesano i file e quante righe ci sono nelle tabelle principali;
- se qualcosa va storto scrive `BACKUP NON FATTO` e non lascia file a metà.

## Dove finiscono i file

Cartella: `C:\Users\Leonardo Valentini\Documents\gym-app-backup` (fuori dal repository).

Per ogni backup, due file con la data nel nome:

| File | Cosa contiene |
|---|---|
| `gym-app_2026-11-06_struttura.sql` | tabelle, regole di accesso (RLS), permessi, funzioni, trigger, elenco delle migrazioni applicate |
| `gym-app_2026-11-06_dati.sql` | tutte le righe delle tabelle di gym-app (`public`) e gli utenti (`auth`: email e password cifrate) |

- Due backup nello stesso giorno: il secondo ha anche l'ora (`gym-app_2026-11-06_1430_dati.sql`).
- La cartella tiene **gli ultimi 8 backup**. Quando ne cancella uno vecchio lo scrive (`Cancellato backup vecchio: ...`).
  Cancella solo i file con esattamente quel nome; qualsiasi altro file nella cartella non viene toccato.
- Non contiene: file caricati in Supabase Storage (gym-app non lo usa), segreti del Vault, impostazioni del pannello Supabase
  (provider di accesso, modelli delle email, URL di ritorno).

## Ogni quanto

- Da quando ci sono dati veri: **una volta a settimana**.
- **Sempre prima** di una modifica al database (nuova migrazione, importazione, pulizia di dati).
- Oggi (2026-11-06) online non ci sono dati veri: solo 19 muscoli e 5 tipi di serie.

## Come ripristinare, passo per passo

Il ripristino si fa in un **progetto Supabase nuovo e vuoto**, mai sopra `gym-app` mentre è in uso.
Se ti serve, fallo insieme a Claude: è un'operazione da fare con calma.

1. **Scegli il backup**: i due file con la stessa data (`..._struttura.sql` e `..._dati.sql`).
2. **Crea un progetto nuovo** su Supabase (regione Sydney). Non applicarci migrazioni.
   In *Settings*, come in gym-app: "Automatically expose new tables" **spento**, "automatic RLS" **acceso**.
3. **Prendi l'indirizzo del database nuovo**: pannello Supabase → *Connect* → *Session pooler*.
   Ha questa forma (senza password):
   `postgresql://postgres.NUOVO_REF@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`
4. **Carica struttura e dati** (un solo comando, tutto in una transazione: se c'è un errore non resta niente a metà).
   Sostituisci la data e l'indirizzo, poi scrivi la password del database nuovo quando te la chiede
   (la scrivi solo nel terminale, non va salvata da nessuna parte):

```bash
docker run --rm -it -v "C:\Users\Leonardo Valentini\Documents\gym-app-backup:/backup:ro" public.ecr.aws/supabase/postgres:17.11.0.011 psql "postgresql://postgres.NUOVO_REF@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres" -v ON_ERROR_STOP=1 --single-transaction -f /backup/gym-app_2026-11-06_struttura.sql -f /backup/gym-app_2026-11-06_dati.sql
```

5. **Segna le migrazioni come già applicate**, altrimenti la CLI proverebbe a rifarle.
   L'elenco è nell'ultima riga del file della struttura (`-- MIGRAZIONI: ...`). Esempio con il backup del 2026-11-06:

```bash
npx supabase migration repair --status applied 20261105100000 20261105100100 20261105100200 20261105100300 20261105100400 20261105100500 20261105100600 20261106100000 --remote=NUOVO_REF
```

6. **Controlla**:

```bash
npx supabase migration list --remote=NUOVO_REF
npx supabase test db --remote=NUOVO_REF
npx supabase db advisors --remote=NUOVO_REF
```

   `migration list` deve mostrare tutte le migrazioni su entrambe le colonne; le prove devono passare tutte.
   Confronta anche le righe con quelle stampate dal backup.
7. **Rifai a mano** le impostazioni che il backup non contiene (accesso, email, URL) e, quando ci sarà l'app,
   aggiorna indirizzo e chiavi del progetto nuovo nell'app.
   Gli utenti tengono le loro password, ma devono rifare l'accesso.

## Come è stato provato (2026-11-06)

- Backup online di `gym-app`: riuscito (19 muscoli, 5 tipi di serie, 8 migrazioni).
- Backup del database locale con i dati finti, ripristinato in un **secondo database locale pulito**
  (impostazioni di base di Supabase), con il comando del passo 4:
  52 tabelle (`public` + `auth`) con le stesse righe prima e dopo (84 = 84), contenuto identico riga per riga,
  stessi permessi, 92 regole di accesso, RLS su 26 tabelle su 26, trigger del profilo presente.
  Dopo il passo 5 la CLI non vede migrazioni da applicare, e le 106 prove automatiche passano.
- Anche il backup **online** è stato ripristinato in un database locale pulito: contenuto e permessi identici a `gym-app`.

## Cosa NON fare

- **Non mettere i backup su GitHub** né dentro il repository: contengono dati personali (allenamenti, peso, email).
  Lo script si rifiuta di salvare dentro un repository git, e `.gitignore` blocca i nomi dei file di backup.
- **Non condividerli** (email, chat, cartelle condivise, cloud pubblici). Se li copi su un disco esterno, tienilo tu.
- Non scrivere la password del database in nessun file, script o comando salvato.
- Non ripristinare sopra `gym-app` in uso: sempre in un progetto nuovo.
- Non modificare a mano i file `.sql` dei backup.
