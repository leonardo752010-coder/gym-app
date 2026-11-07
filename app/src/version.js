// Versione dell'app: data e ora della build (gg/mm/aaaa hh:mm), scritta da vite.config.js dentro il codice.
// È quella del codice che sta girando davvero: ogni build nuova ha file nuovi e un service worker nuovo.
// Una sola funzione per tutti i punti dove si mostra (accesso, caricamento, menu, Programma).
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

/** "Versione 08/11/2026 02:42" (o "Version ..."); con il database locale di prova aggiunge "(locale)". */
export function versionText(label, locale = false, v = APP_VERSION) {
  return label + ' ' + v + (locale ? ' (locale)' : '');
}
