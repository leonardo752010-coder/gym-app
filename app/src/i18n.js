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
  // schermata della serie (grafica nuova): obiettivo, confronto con la volta scorsa, tabella, tasto viola
  goal: 'Obiettivo', vsLast: 'vs volta scorsa', repDiff: (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n) + ' rep',
  weightCol: (u) => 'Peso (' + u + ')', complete: 'Completa serie', rirTap: 'RIR, tocca per cambiare',
  // Progressi: Storico (con filtri) e Grafico; tasto "Storico" nell'esercizio (ultime 3 volte)
  histTab: 'Storico', chartTab: 'Grafico', histBtn: 'Storico', fWorkout: 'Workout', fExercise: 'Esercizio',
  allWorkouts: 'Tutti i workout', allExercises: 'Tutti gli esercizi', noMatch: 'Nessuna seduta con questi filtri.',
  otherMachine: 'altra macchina', noMachine: 'senza macchina',
  chartNone: 'Nessun esercizio con serie salvate sul telefono.',
  chartFew: 'Servono almeno 2 sedute di questo esercizio (su questa macchina) per disegnare il grafico.',
  e1rm: 'e1RM stimato', chartHint: 'Un punto per seduta: la serie migliore, peso × (1 + (rep + RIR) / 30). Tocca un punto per vedere le serie.',
  pointAria: (d, v) => d + ': e1RM ' + v, best: 'migliore',
  histTitle: 'Ultime 3 volte', histNone: 'Nessuna volta precedente per questo esercizio.',
  // Programma: modifica di un esercizio del piano (solo online)
  peEdit: 'Modifica', peEditAria: (n) => 'Modifica ' + n, peEditTitle: 'Modifica esercizio', peSave: 'Salva', peSaving: 'Salvo…',
  peSets: 'Serie', peSetsMax: 'Serie max', peRepsMin: 'Rep min', peRepsMax: 'Rep max', peRirMin: 'RIR min', peRirMax: 'RIR max',
  peRest: 'Recupero (secondi)', peNotes: 'Note', peSetsHint: '0 = fuori dal volume', peOptional: 'vuoto = nessuno',
  peNeedNet: 'Serve internet per modificare il piano.', peSaved: 'Piano aggiornato', peSaveErr: 'Non salvato: ',
  peDenied: 'Non salvato: questo esercizio non si può modificare da questo account.',
  peDay: 'Giorno', pePos: (i, n) => 'Posizione ' + i + ' di ' + n, peUp: '↑ Su', peDown: '↓ Giù',
  chBtn: 'Cambia esercizio', chTitle: 'Cambia esercizio', chNow: (n) => 'Adesso: ' + n, chSearch: 'Cerca esercizio',
  chLoading: 'Carico gli esercizi…', chNone: 'Nessun esercizio trovato.', chCreate: (n) => '+ Crea nuovo esercizio: «' + n + '»',
  chPicked: (n) => 'Scelto: ' + n, chPickedNew: (n) => 'Nuovo esercizio: ' + n, chClub: (n) => 'Palestra: ' + n, chHome: 'principale',
  chMachine: 'Macchina', chAlt: 'Alternativa (facoltativa)', chNoMachine: 'Nessuna macchina', chNoAlt: 'Nessuna', chNoClub: 'Nessuna palestra collegata: l\'esercizio resterà senza macchina.',
  chKeep: 'Serie, rep e RIR restano quelli di adesso. Le sedute già fatte restano con il vecchio esercizio e la vecchia macchina.',
  chBack: 'Indietro', chSaved: 'Esercizio cambiato', chNeedNet: 'Serve internet per cambiare esercizio.', chLoadErr: 'Non riesco a caricare gli esercizi: ',
  chErr: {
    pick: 'Scegli un esercizio dall\'elenco, oppure scrivi il nome e tocca «Crea nuovo esercizio».',
    name: 'Nome del nuovo esercizio: da 1 a 80 caratteri.',
    altNoMachine: 'Alternativa: scegli prima la macchina di quella palestra.',
    altSame: 'L\'alternativa deve essere diversa dalla macchina.',
    today: 'Oggi hai già fatto serie di questo esercizio: il cambio si può fare da domani. Le serie di oggi restano come sono.',
    notAllowed: 'Non salvato: questo esercizio non si può cambiare da questo account.',
    machines: 'Una macchina non va bene per quella palestra: chiudi la finestra, riaprila e riprova.',
    exercise: 'Questo esercizio non si può usare: scegline un altro.',
  },
  peUpAria: 'Sposta su nel giorno', peDownAria: 'Sposta giù nel giorno', peSsHint: 'In superserie: si sposta solo dentro la superserie, e non in un altro giorno.',
  peErr: {
    sets: 'Serie: un numero intero da 0 a 20 (0 = fuori dal volume).',
    setsMax: 'Serie max: lascia vuoto, oppure un numero intero da 1 a 20.',
    setsMaxLow: 'Serie max non può essere meno di Serie.',
    reps: 'Rep min e Rep max: numeri interi da 1 a 200, tutti e due.',
    repsOrder: 'Rep min non può essere più di Rep max.',
    rir: 'RIR: un numero da 0 a 10 (al massimo un decimale), oppure vuoto.',
    rirOrder: 'RIR min non può essere più di RIR max.',
    rest: 'Recupero: secondi interi da 0 a 3600, oppure vuoto.',
    superset: 'Questo esercizio è in una superserie: non si può spostare in un altro giorno.',
    full: 'Il giorno scelto è pieno (al massimo 100 esercizi).',
    missing: 'Questo esercizio non è più nel piano: aggiorna l\'app e riprova.',
  },
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
  goal: 'Target', vsLast: 'vs. last time', repDiff: (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n) + (Math.abs(n) === 1 ? ' rep' : ' reps'),
  weightCol: (u) => 'Weight (' + u + ')', complete: 'Complete set', rirTap: 'RIR, tap to change',
  histTab: 'History', chartTab: 'Chart', histBtn: 'History', fWorkout: 'Workout', fExercise: 'Exercise',
  allWorkouts: 'All workouts', allExercises: 'All exercises', noMatch: 'No sessions with these filters.',
  otherMachine: 'other machine', noMachine: 'no machine',
  chartNone: 'No exercise with sets saved on this phone.',
  chartFew: 'At least 2 sessions of this exercise (on this machine) are needed to draw the chart.',
  e1rm: 'Estimated e1RM', chartHint: 'One point per session: the best set, weight × (1 + (reps + RIR) / 30). Tap a point to see the sets.',
  pointAria: (d, v) => d + ': e1RM ' + v, best: 'best',
  histTitle: 'Last 3 times', histNone: 'No previous time for this exercise.',
  // Program: editing an exercise of the plan (online only)
  peEdit: 'Edit', peEditAria: (n) => 'Edit ' + n, peEditTitle: 'Edit exercise', peSave: 'Save', peSaving: 'Saving…',
  peSets: 'Sets', peSetsMax: 'Max sets', peRepsMin: 'Min reps', peRepsMax: 'Max reps', peRirMin: 'Min RIR', peRirMax: 'Max RIR',
  peRest: 'Rest (seconds)', peNotes: 'Notes', peSetsHint: '0 = not counted in volume', peOptional: 'empty = none',
  peNeedNet: 'You need internet to edit the plan.', peSaved: 'Plan updated', peSaveErr: 'Not saved: ',
  peDenied: 'Not saved: this exercise cannot be edited from this account.',
  peDay: 'Day', pePos: (i, n) => 'Position ' + i + ' of ' + n, peUp: '↑ Up', peDown: '↓ Down',
  chBtn: 'Change exercise', chTitle: 'Change exercise', chNow: (n) => 'Now: ' + n, chSearch: 'Search exercise',
  chLoading: 'Loading exercises…', chNone: 'No exercise found.', chCreate: (n) => '+ Create new exercise: “' + n + '”',
  chPicked: (n) => 'Chosen: ' + n, chPickedNew: (n) => 'New exercise: ' + n, chClub: (n) => 'Gym: ' + n, chHome: 'main',
  chMachine: 'Machine', chAlt: 'Alternative (optional)', chNoMachine: 'No machine', chNoAlt: 'None', chNoClub: 'No gym linked: the exercise will have no machine.',
  chKeep: 'Sets, reps and RIR stay as they are now. Past sessions keep the old exercise and the old machine.',
  chBack: 'Back', chSaved: 'Exercise changed', chNeedNet: 'You need internet to change the exercise.', chLoadErr: 'Could not load the exercises: ',
  chErr: {
    pick: 'Pick an exercise from the list, or type the name and tap “Create new exercise”.',
    name: 'New exercise name: 1 to 80 characters.',
    altNoMachine: 'Alternative: pick the machine for that gym first.',
    altSame: 'The alternative must be different from the machine.',
    today: 'You already did sets of this exercise today: you can change it from tomorrow. Today\'s sets stay as they are.',
    notAllowed: 'Not saved: this exercise cannot be changed from this account.',
    machines: 'A machine does not fit that gym: close the window, open it again and retry.',
    exercise: 'This exercise cannot be used: pick another one.',
  },
  peUpAria: 'Move up in the day', peDownAria: 'Move down in the day', peSsHint: 'In a superset: it moves only inside the superset, and not to another day.',
  peErr: {
    sets: 'Sets: a whole number from 0 to 20 (0 = not counted in volume).',
    setsMax: 'Max sets: leave empty, or a whole number from 1 to 20.',
    setsMaxLow: 'Max sets cannot be less than Sets.',
    reps: 'Min reps and Max reps: whole numbers from 1 to 200, both of them.',
    repsOrder: 'Min reps cannot be more than Max reps.',
    rir: 'RIR: a number from 0 to 10 (one decimal at most), or empty.',
    rirOrder: 'Min RIR cannot be more than Max RIR.',
    rest: 'Rest: whole seconds from 0 to 3600, or empty.',
    superset: 'This exercise is in a superset: it cannot move to another day.',
    full: 'The chosen day is full (100 exercises at most).',
    missing: 'This exercise is no longer in the plan: refresh the app and try again.',
  },
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
