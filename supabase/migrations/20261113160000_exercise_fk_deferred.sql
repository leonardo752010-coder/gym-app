-- =====================================================================
-- 12 · Collegamento all'esercizio: controllo a fine transazione
--
-- Con "Cambia esercizio" (migrazione 11) un atleta può creare un esercizio
-- suo, privato (created_by = l'atleta, cancellato insieme all'account).
-- Problema trovato provando (2026-11-13): cancellando un account che usa un
-- esercizio suo nel piano (o in serie registrate), Postgres cancellava prima
-- l'esercizio e controllava subito il collegamento dalla riga del piano
-- (o dall'esercizio della seduta), che non era ancora stata cancellata:
-- errore, e l'account non si poteva cancellare.
--
-- Soluzione, come nella migrazione 9 (import): il controllo si fa alla fine
-- della transazione (DEFERRABLE INITIALLY DEFERRED). Cancellare un account
-- funziona (a fine transazione non resta niente di suo); cancellare un
-- esercizio ancora usato resta vietato (l'errore arriva a fine operazione).
--
-- Collegamenti verso public.exercises (controllati il 2026-11-13):
--   plan_exercises.exercise_id     nessuna azione → qui diventa rinviabile
--   session_exercises.exercise_id  nessuna azione → qui diventa rinviabile
--   exercise_muscles.exercise_id   ON DELETE CASCADE (non blocca): invariato
--   machine_exercises.exercise_id  ON DELETE CASCADE (non blocca): invariato
-- Nessun dato cambia.
--
-- Applicata SOLO al database locale (2026-11-13). Online solo con l'ok di Leonardo.
-- =====================================================================

alter table public.plan_exercises    alter constraint plan_exercises_exercise_id_fkey    deferrable initially deferred;
alter table public.session_exercises alter constraint session_exercises_exercise_id_fkey deferrable initially deferred;
