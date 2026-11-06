## Portata delle funzioni
Il business plan elenca molte funzioni, ma sono possibilita', non impegni.
Principio guida: "Hai gia' un piano. Non devi costruirlo due volte."
Prima di costruire una funzione nuova leggi docs/NOTA_FUNZIONI_E_POSIZIONAMENTO.md.
Non aggiungere funzioni fuori dalla versione 1 senza chiedermelo.

## Aggiornare STATO.md
Alla fine di OGNI lavoro, e prima di ogni commit, aggiorna STATO.md.
Deve sempre contenere, in italiano semplice:
- Data di oggi.
- Branch attuale e cosa contiene ogni branch.
- Cosa e' stato fatto in questa sessione.
- Cosa e' online (Supabase, GitHub) e cosa e' solo sul mio computer.
- Prossimo passo.
- Cose che devo decidere o fare io.
Se STATO.md e' vecchio o non vero, correggilo subito, anche se non te
l'ho chiesto. Mostrami le modifiche prima del commit.

## Niente cancellazioni senza il mio ok
Nessuna cancellazione di database o di file, nemmeno locali (anche il
database locale di prova), senza il mio ok esplicito.
- Mai `--no-backup` (per esempio `supabase stop --no-backup`).
- Mai `supabase db reset` senza il mio ok.
- Prima di cancellare qualcosa: dimmi cosa, dove e perche', e aspetta.
