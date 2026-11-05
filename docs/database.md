# Database (Supabase) — spiegazione semplice

Il database vive su Supabase. Le tabelle nascono **solo** dai file in `supabase/migrations/`, eseguiti in ordine.
Mai modifiche a mano dal pannello.

## Le 4 aree

| Area | Tabelle | A cosa serve |
|---|---|---|
| Persone | `profiles`, `coach_links`, `import_batches` | profilo (lingua, kg/lb, fuso), chi segue chi, registro delle importazioni |
| Libreria | `muscles`, `exercises`, `exercise_muscles`, `set_types`, `club_chains`, `clubs`, `machines`, `machine_exercises`, `club_machines`, `user_clubs` | esercizi, macchine, palestre, condivisi tra utenti |
| Piano (cosa fare) | `plans`, `plan_weeks`, `plan_days`, `plan_supersets`, `plan_exercises`, `plan_exercise_machines` | il piano: giorni a rotazione, mesociclo, esercizi, macchina per club |
| Log (cosa hai fatto) | `sessions`, `session_supersets`, `session_exercises`, `sets`, `set_parts` | le sedute e le serie |
| Corpo | `body_metrics`, `body_measurements` | peso, passi, kcal, macro, misure |

## Regole importanti

- **Codici fissi.** Esercizi e macchine hanno un `code` che non cambia mai; il nome (`name`, in italiano e inglese) sì. Rinominare un esercizio non rompe lo storico.
- **Piano e log separati.** Ogni esercizio della seduta conserva una copia dell'obiettivo di quel giorno (`target_*`). Cambiare o cancellare il piano non tocca le serie fatte.
- **Peso sempre in kg** (`weight_kg`). `input_weight` + `input_unit` conservano come l'hai scritto (es. 100 lb).
- **Coda offline senza doppioni.** Il telefono crea l'`id` di sedute, esercizi e serie e lo reinvia finché non arriva ("on conflict do nothing"): lo stesso id = una riga sola. Inoltre c'è una sola serie N per esercizio della seduta.
- **Cancellazione morbida.** L'app non cancella sedute, esercizi o serie: scrive `deleted_at`. (Le parti di una serie e i dati del corpo invece si cancellano davvero.)
- **Superserie = gruppo di esercizi**, non un tipo di serie. Nel piano: `plan_supersets` con un solo recupero (`rest_seconds`) a fine giro; nella seduta: `session_supersets`. Gli esercizi del gruppo stanno in posizioni consecutive.
- **Tipi di serie**: normale, riscaldamento, drop, rest-pause, myo-reps (di sistema) + quelli creati dall'utente. Drop, rest-pause e myo-reps hanno parti (`set_parts`): la parte 1 è la serie stessa.
- **Volume per muscolo**: `exercise_muscles.weight` dice quanto conta una serie per ogni muscolo (di base 1 principale, 0,5 secondario), salvato per esercizio-muscolo.
- **Club**: condivisi come le macchine, possono appartenere a una catena (`club_chains`). Ogni utente si collega ai club che frequenta (`user_clubs`, uno può essere il principale). Nel piano, per ogni esercizio: una macchina per club e una alternativa.
- **Importazioni**: ogni importazione (`import_batches`) appartiene a un utente che esiste in Supabase Auth. Ogni riga importata ha `import_id` + `user_id` e il database controlla che siano della stessa persona. Per annullare un'importazione si cancellano le righe con quell'`import_id`.

## Chi vede e chi modifica (regole di accesso, RLS)

| Chi | Cosa |
|---|---|
| Chi non ha fatto l'accesso | niente |
| Utente | vede e modifica solo i suoi dati; legge la libreria pubblica |
| Coach (collegamento attivo, confermato dall'atleta) | legge tutto dell'atleta; modifica il piano solo se l'atleta gliel'ha permesso; lo storico mai |
| Libreria pubblica | la crea/modifica solo il servizio (importazione, manutenzione). Gli utenti creano elementi **privati e non verificati** |

La scelta ancora aperta (macchine degli utenti pubbliche subito o dopo conferma) non è stata presa: oggi un utente crea solo cose private.

## Come provare in locale

Serve Docker Desktop acceso.

```bash
npm install
npx supabase db start      # avvia Postgres e applica migrazioni + dati finti
npx supabase test db       # prove automatiche (pgTAP)
npx supabase db lint --level warning
npx supabase db reset      # ricomincia da zero
```

`supabase/seed.sql` contiene solo dati finti (utenti senza password), mai dati veri.

## Progetto online (`gym-app`, Sydney)

Solo con l'ok di Leonardo. Serve `npx supabase login` (lo fa Leonardo nel terminale) e il collegamento al progetto (`npx supabase link --project-ref kclgcqwmvqqkogkhycgb`).

```bash
npx supabase db push --remote --dry-run   # mostra cosa verrebbe applicato
npx supabase db push --remote             # applica le migrazioni (mai --include-seed)
npx supabase test db --remote             # prove online: tutto dentro transazioni annullate
npx supabase db advisors --remote         # controllo di sicurezza e prestazioni
```

Online la CLI entra come `cli_login_postgres`, che non ha i permessi sullo schema `extensions` (dove sta pgTAP): per questo ogni file di prova inizia con `set local role postgres`.

## Backup

Backup e ripristino: vedi `docs/backup.md` (comando: `npm run backup`).

## Prove automatiche (`supabase/tests/database/`)

| File | Controlla |
|---|---|
| 000_schema | tutte le tabelle hanno RLS, anon senza accesso, dati di riferimento, profilo all'iscrizione |
| 010_isolation | un utente non vede né modifica i dati di un altro |
| 020_offline_sync | invio doppio = una riga, niente doppioni, cancellazione morbida |
| 030_coach | invito/conferma, permessi del coach, collegamento chiuso |
| 040_library_clubs | libreria pubblica/privata, codici fissi, pesi per muscolo, catene e club |
| 050_imports | importazioni legate a utenti esistenti e alla persona giusta |
| 060_plan_log | superserie, piano attivo unico, piano che cambia senza toccare lo storico, drop set |
