// Testi dell'app in italiano e inglese. Ogni testo visibile passa da qui.
// Lingua: quella del telefono; italiano solo se il telefono è in italiano, altrimenti inglese (anche per lingue non previste).
// Inglese con ortografia neozelandese (program, non programme; colour). Date sempre giorno/mese/anno, pesi in kg di base.
const it = {
  workout: 'ALLENAMENTO', today: 'Oggi', loading: 'Carico il piano…', locale: 'it-IT', dayNight: 'Giorno / notte',
  exOf: (i, n) => 'Esercizio ' + i + ' di ' + n, rep: 'rep', last: 'Volta scorsa', set: 'Serie', target: 'Target',
  save: 'Salva serie', update: 'Aggiorna serie', del: 'Elimina', cancel: 'Annulla', next: 'Prossimo',
  extra: '+ serie extra', finished: 'Allenamento completato 💪', notPlan: 'Fuori piano (0 serie). Puoi comunque registrare una serie extra.',
  suggested: 'Suggerito', why: { up: 'Range chiuso: più peso', reps: 'Stesso peso, una rep in più', hold: 'Tieni il peso' },
  noLast: 'Prima volta: scegli un peso che ti lascia nel range.',
  rest: 'Recupero', go: 'Vai!', saved: (n) => 'Serie ' + n + ' salvata', updated: (n) => 'Serie ' + n + ' aggiornata',
  deleted: (n) => 'Serie ' + n + ' eliminata', needs: (u) => 'Servono ' + u + ' e rep', checkW: 'Controlla il peso',
  checkWmsg: (w, u, prev) => w + ' ' + u + ' è molto più della volta scorsa (' + prev + ' ' + u + '). Errore di unità o di battitura?',
  fix: 'Correggo', anyway: 'Salva così', delQ: (n) => 'Eliminare la serie ' + n + '?', delP: 'Verrà tolta dallo storico.',
  listOff: 'fuori piano', sets: 'serie', machine: 'Macchina', alt: 'alternativa', step: 'salto', weights: (n) => n + ' pesi',
  // accesso
  loginTitle: 'Accedi', email: 'Email', password: 'Password', login: 'Entra', loggingIn: 'Entro…',
  badLogin: 'Email o password sbagliate.', needNet: 'Per il primo accesso serve internet.', loginErr: 'Accesso non riuscito: ',
  sessionGone: 'Accesso scaduto: entra di nuovo. Le serie sul telefono restano salvate.',
  noPlan: 'Nessun piano attivo in questo account.', firstLoad: 'Serve internet per scaricare il piano la prima volta.',
  // stato
  syncOk: 'Tutto salvato online', syncPending: (n) => n + (n === 1 ? ' modifica' : ' modifiche') + ' sul telefono, da inviare',
  syncOffline: (n) => 'Offline · ' + n + ' sul telefono', syncErr: (n) => n + ' non accettate online', syncing: 'Invio…',
  // menu
  menu: 'Account', account: 'Account', storage: 'Memoria del telefono', persisted: 'protetta (il browser non la cancella da solo)',
  notPersisted: 'non protetta: aggiungi l\'app alla Home', unknown: 'sconosciuta', unit: 'Unità', lang: 'Lingua',
  logout: 'Esci', logoutBlocked: 'Ci sono modifiche non ancora online. Collegati a internet e riprova.', close: 'Chiudi',
  syncNow: 'Invia ora', lastSync: 'Ultimo aggiornamento', never: 'mai', errors: 'Errori', version: 'Versione',
  install: 'Per installarla: Condividi → Aggiungi alla schermata Home (iPhone) oppure menu ⋮ → Installa app (Android).',
  // fine seduta
  endSession: 'Fine seduta', endQ: 'Finire la sessione?', yes: 'Sì', no: 'No', doneMsg: 'Seduta finita. Ottimo allenamento', ok: 'OK', ended: 'Seduta chiusa', closedAt: (t) => 'Seduta chiusa alle ' + t, reopen: 'Riapri', reopened: 'Seduta riaperta',
  // altro
  // CHOOSE YOUR STARTER (il titolo resta in inglese anche in italiano: è scritto in main.js)
  starterHint: 'Scegli il tuo compagno. Si sceglie una volta sola.', starterOk: 'Conferma',
  starterNames: { gorilla: 'Gorilla', lion: 'Leone', tiger: 'Tigre' }, starterSaved: (n) => 'Hai scelto: ' + n,
  saveErr: 'Salvataggio non riuscito: ', sync: 'Sincronizzazione', back: 'Indietro',
  noConfig: 'Configurazione mancante: chiave pubblica di Supabase (src/config.js).',
  // barra in basso (Program / Track / Progress) e le due pagine in sola lettura
  navProgram: 'Programma', navTrack: 'Allenamento', navProgress: 'Progressi', pages: 'Pagine',
  openDay: (d) => 'Apri ' + d + ' in Allenamento', exCount: (n) => n + (n === 1 ? ' esercizio' : ' esercizi'),
  noHistory: 'Nessuna seduta salvata sul telefono.', historyNote: 'Sedute salvate su questo telefono.',
  inProgress: 'in corso', setCount: (n) => n + ' serie',
  // Allenamento: workout a tendina, menu "...", elenco esercizi, timer
  more: 'Altro', chooseDay: 'Scegli l\'allenamento', exercises: 'Esercizi', notesBtn: 'Note', closeTimer: 'Chiudi timer',
};
const en = {
  workout: 'WORKOUT', today: 'Today', loading: 'Loading your plan…', locale: 'en-NZ', dayNight: 'Day / night',
  exOf: (i, n) => 'Exercise ' + i + ' of ' + n, rep: 'reps', last: 'Last time', set: 'Set', target: 'Target',
  save: 'Save set', update: 'Update set', del: 'Delete', cancel: 'Cancel', next: 'Next',
  extra: '+ extra set', finished: 'Session done. Great work 💪', notPlan: 'Not in the plan (0 sets). You can still log an extra set.',
  suggested: 'Suggested', why: { up: 'Range done: add weight', reps: 'Same weight, one more rep', hold: 'Keep the weight' },
  noLast: 'First time: pick a weight that keeps you in the range.',
  rest: 'Rest', go: 'Go!', saved: (n) => 'Set ' + n + ' saved', updated: (n) => 'Set ' + n + ' updated',
  deleted: (n) => 'Set ' + n + ' deleted', needs: (u) => u + ' and reps needed', checkW: 'Check the weight',
  checkWmsg: (w, u, prev) => w + ' ' + u + ' is much more than last time (' + prev + ' ' + u + '). Wrong unit or typo?',
  fix: 'Fix it', anyway: 'Save anyway', delQ: (n) => 'Delete set ' + n + '?', delP: 'It will be removed from your log.',
  listOff: 'not in plan', sets: 'sets', machine: 'Machine', alt: 'alternative', step: 'step', weights: (n) => n + ' weights',
  loginTitle: 'Sign in', email: 'Email', password: 'Password', login: 'Sign in', loggingIn: 'Signing in…',
  badLogin: 'Wrong email or password.', needNet: 'The first sign-in needs internet.', loginErr: 'Sign-in failed: ',
  sessionGone: 'Your sign-in has expired: please sign in again. Sets on this phone stay saved.',
  noPlan: 'No active plan in this account.', firstLoad: 'Internet is needed to download your plan the first time.',
  syncOk: 'All saved online', syncPending: (n) => n + (n === 1 ? ' change' : ' changes') + ' on the phone, to send',
  syncOffline: (n) => 'Offline · ' + n + ' on the phone', syncErr: (n) => n + ' rejected online', syncing: 'Sending…',
  menu: 'Account', account: 'Account', storage: 'Phone storage', persisted: 'protected (the browser will not clear it by itself)',
  notPersisted: 'not protected: add the app to the Home Screen', unknown: 'unknown', unit: 'Unit', lang: 'Language',
  logout: 'Sign out', logoutBlocked: 'Some changes are not online yet. Connect to the internet and try again.', close: 'Close',
  syncNow: 'Send now', lastSync: 'Last update', never: 'never', errors: 'Errors', version: 'Version',
  install: 'To install: Share → Add to Home Screen (iPhone) or menu ⋮ → Install app (Android).',
  endSession: 'End session', endQ: 'End the session?', yes: 'Yes', no: 'No', doneMsg: 'Session done. Great workout', ok: 'OK', ended: 'Session ended', closedAt: (t) => 'Session ended at ' + t, reopen: 'Reopen', reopened: 'Session reopened',
  starterHint: 'Pick your partner. You only choose once.', starterOk: 'Confirm',
  starterNames: { gorilla: 'Gorilla', lion: 'Lion', tiger: 'Tiger' }, starterSaved: (n) => 'You chose: ' + n,
  saveErr: 'Could not save: ', sync: 'Sync', back: 'Back',
  noConfig: 'Missing configuration: Supabase public key (src/config.js).',
  navProgram: 'Program', navTrack: 'Workout', navProgress: 'Progress', pages: 'Pages',
  openDay: (d) => 'Open ' + d + ' in Workout', exCount: (n) => n + (n === 1 ? ' exercise' : ' exercises'),
  noHistory: 'No sessions saved on this phone.', historyNote: 'Sessions saved on this phone.',
  inProgress: 'in progress', setCount: (n) => n + (n === 1 ? ' set' : ' sets'),
  more: 'More', chooseDay: 'Choose workout', exercises: 'Exercises', notesBtn: 'Notes', closeTimer: 'Close timer',
};
export const LANGS = { it, en };

export function pickLang(saved, nav = typeof navigator !== 'undefined' ? navigator.language : 'en') {
  if (saved === 'it' || saved === 'en') return saved;
  return /^it\b/i.test(nav || '') ? 'it' : 'en';
}

/** Nome tradotto ({it, en}) con ripiego sull'altra lingua. */
export function tr(name, lang) {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name[lang] || name.en || name.it || Object.values(name)[0] || '';
}

/** Data 'AAAA-MM-GG' come giorno e mese, più l'anno se non è quello di oggi. Sempre il giorno prima del mese. */
export function fmtDay(key, locale, todayKey = null) {
  const [y, m, d] = key.split('-').map(Number);
  const year = todayKey && Number(todayKey.slice(0, 4)) !== y ? { year: 'numeric' } : {};
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...year });
}
