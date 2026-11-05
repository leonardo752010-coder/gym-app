-- =====================================================================
-- 09 · Collegamento dei dati importati al loro import: controllo a fine transazione
--
-- Ogni riga importata punta al suo import con (import_id, user_id).
-- Problema trovato provando l'import (passo 3): cancellando un account con
-- dati importati, Postgres cancellava prima la riga di import_batches e
-- solo dopo le sedute/serie che la usano, e si fermava con un errore.
-- Quindi un account con dati importati non si poteva cancellare.
--
-- Soluzione: il controllo si fa alla fine della transazione (DEFERRABLE
-- INITIALLY DEFERRED). Cancellare un account funziona (a fine transazione
-- non resta niente); cancellare un import che ha ancora righe resta vietato.
-- =====================================================================

alter table public.sessions          alter constraint sessions_import_fk          deferrable initially deferred;
alter table public.session_exercises alter constraint session_exercises_import_fk deferrable initially deferred;
alter table public.sets              alter constraint sets_import_fk              deferrable initially deferred;
alter table public.body_metrics      alter constraint body_metrics_import_fk      deferrable initially deferred;
alter table public.body_measurements alter constraint body_measurements_import_fk deferrable initially deferred;
