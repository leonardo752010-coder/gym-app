# Regole per chi lavora su questo repository (Claude, Codex, persone)

Leggi questo file, `DECISIONI.md` e `STATO.md` prima di qualsiasi lavoro.

1. Il repository GitHub è l'unica fonte di verità. Prima di iniziare scarica l'ultima versione.
2. Un branch per ogni lavoro: `claude/<argomento>` oppure `codex/<argomento>`. Mai due AI sullo stesso branch insieme.
3. Non annullare una decisione scritta in `DECISIONI.md`. Se va cambiata: chiedi a Leonardo, poi scrivi il cambio con data e motivo.
4. A fine lavoro aggiorna `STATO.md`: cosa è fatto, cosa manca, branch, ultimo commit.
5. Il merge su `main` lo approva solo Leonardo.
6. Mai chiavi, password o token nel repository (che oggi è pubblico). Stanno nelle impostazioni di Supabase e dell'hosting.
7. Le modifiche al database passano sempre da file di migrazione nel repository, mai a mano dal pannello di Supabase.
8. Scrivi a Leonardo in italiano semplice. Testi dell'app: italiano e inglese, sempre traducibili.
9. Non iniziare funzionalità che non sono nella roadmap senza chiedere.

Documento completo del piano (decisioni, database, roadmap): https://claude.ai/artifact/6ridGiUwM1BSzkZKfKwD72
L'app attuale (Google Apps Script) è descritta in `HANDOFF.md`.
