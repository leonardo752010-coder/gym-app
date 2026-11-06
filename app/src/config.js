// Collegamento a Supabase.
//
// Qui va SOLO la chiave pubblica ("publishable", inizia con sb_publishable_): è fatta per stare
// nel telefono di chiunque, perché i dati li proteggono le regole di accesso (RLS) del database.
// MAI la chiave di servizio (service_role / sb_secret_...): la prova tests/unit/config.test.js lo controlla.
//
// Solo il progetto gym-app (ref kclgcqwmvqqkogkhycgb). Mai altri progetti.
export const ONLINE = {
  url: 'https://kclgcqwmvqqkogkhycgb.supabase.co',
  key: 'sb_publishable_EDTcUkhRGCQoQStNdCEp3w_-gHpQiYa', // chiave pubblica (publishable) di gym-app
};

/** In prova sul computer (vite --mode locale) si usa il database locale, mai quello online. */
export function supabaseConfig() {
  const env = import.meta.env || {};
  if (env.MODE === 'locale') return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_KEY, locale: true };
  return { ...ONLINE, locale: false };
}
