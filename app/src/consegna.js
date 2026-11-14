// Consegna del file dell'export: menu di condivisione del telefono quando funziona davvero, altrimenti download.
// Niente DOM e niente browser fissi: navigator, document, URL e setTimeout arrivano da fuori (env), così si prova
// con tests/unit/consegna.test.js.
//
// Perché così (bug del 15/11 su Samsung Z Fold 7, Chrome Android): Chrome Android condivide solo alcuni tipi di file
// (immagini, audio, video, pdf, testo, csv…). Per un .xlsx navigator.canShare può dire "sì", ma navigator.share poi
// rifiuta con NotAllowedError. Prima quell'errore veniva preso per "serve un tocco nuovo": tasto viola, nuovo tentativo,
// stesso errore, tasto di nuovo… e il download non partiva mai, senza messaggi.

/** Estensioni che Chrome su Android accetta di condividere (le altre: share() rifiuta con NotAllowedError). */
export const ANDROID_SHAREABLE = /\.(bmp|css|csv|ehtml|flac|gif|html?|ico|jfif|jpe?g|m4a|m4v|mp3|mp4|mpe?g|oga|ogg|ogm|ogv|opus|pdf|pjp|pjpeg|png|s?htm|shtml|svgz?|text|tiff?|txt|wav|weba|webm|webp|xbm)$/i;

/** Tempo prima di liberare il file scaricato: il browser deve avere il tempo di salvarlo. */
export const REVOKE_AFTER_MS = 60000;

/** Nome dell'errore per i messaggi: "NotAllowedError (Permission denied)". */
export function errorLabel(e) {
  if (!e) return 'Error';
  const name = e.name || 'Error';
  const msg = e.message && e.message !== name ? String(e.message) : '';
  return msg ? name + ' (' + msg + ')' : name;
}

/**
 * Il menu di condivisione si può provare? Solo su schermo touch, con canShare / share presenti e canShare({files}) vero;
 * mai su Android per i tipi che Chrome non condivide (.xlsx compreso); mai se su questo telefono è già fallito (noShare).
 */
export function shareAllowed(file, { nav, ua = '', touch = false, noShare = false } = {}) {
  if (!file || !touch || noShare || !nav) return false;
  if (typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false;
  if (/Android/i.test(ua) && !ANDROID_SHAREABLE.test(file.name || '')) return false;
  try { return !!nav.canShare({ files: [file] }); } catch (e) { return false; }
}

/**
 * Download: link <a> con l'attributo download, aggiunto alla pagina, cliccato e tolto; l'indirizzo del file si libera
 * solo dopo REVOKE_AFTER_MS. Niente pagine nuove, niente window.open. Un errore viene lanciato (mai in silenzio).
 */
export function downloadBlob(blob, name, { doc, url, setTimeout: later, keepMs = REVOKE_AFTER_MS }) {
  const href = url.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  try { a.click(); }
  finally {
    if (a.parentNode) a.parentNode.removeChild(a);
    later(() => url.revokeObjectURL(href), keepMs);
  }
}

/**
 * Consegna: { result: 'shared' | 'cancelled' | 'need-tap' | 'downloaded', shareError? }.
 * - share non permesso (vedi shareAllowed) → download subito, senza tasto viola;
 * - dopo l'attesa dello scaricamento il tocco non vale più (navigator.userActivation non attivo) → 'need-tap':
 *   la pagina mostra il tasto viola, e il tocco su quello arriva con fresh = true;
 * - menu chiuso senza scegliere (AbortError) → 'cancelled', niente;
 * - share rifiutato per qualsiasi altro motivo → download (shareError dice perché), mai un altro tasto viola.
 * Se anche il download non riesce: errore con downloadError e shareError (la pagina mostra il nome dell'errore).
 */
export async function deliverFile(blob, name, env) {
  const { nav, fresh = false, makeFile } = env;
  const file = makeFile ? makeFile(blob, name) : null;
  let shareError = null;
  if (shareAllowed(file, env)) {
    const ua = nav.userActivation;
    if (!fresh && ua && ua.isActive === false) return { result: 'need-tap' };
    try {
      await nav.share({ files: [file], title: name });
      return { result: 'shared' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { result: 'cancelled' };
      // senza navigator.userActivation non si sa se il tocco era scaduto: un solo tocco nuovo, poi download
      if (!fresh && !ua && e && e.name === 'NotAllowedError') return { result: 'need-tap', shareError: e };
      shareError = e || new Error('share failed');
    }
  }
  try {
    downloadBlob(blob, name, env);
  } catch (e) {
    const err = new Error('download failed');
    err.downloadError = e;
    err.shareError = shareError;
    throw err;
  }
  return { result: 'downloaded', shareError };
}
