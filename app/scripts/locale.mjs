// Collegamento al database LOCALE di prova (Docker), mai a quello online.
// Legge indirizzo e chiavi locali da "supabase status" ogni volta: nessuna chiave scritta nel repository.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(appDir, '..');

export function localStatus() {
  let out;
  try {
    out = execSync('npx supabase status -o env', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    throw new Error('Il database locale non risponde. Avvia Docker Desktop e poi, nella cartella del progetto: npx supabase start');
  }
  const env = {};
  for (const line of out.split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) env[m[1]] = m[2]; }
  const url = env.API_URL;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error('Rifiuto: API_URL non è locale (' + url + ')');
  const anon = env.PUBLISHABLE_KEY || env.ANON_KEY;
  const service = env.SECRET_KEY || env.SERVICE_ROLE_KEY;
  if (!anon || !service) throw new Error('Chiavi locali non trovate: il servizio di accesso (auth) è avviato? npx supabase start');
  return { url, anon, service };
}

/** File .env.locale (ignorato da git) per "vite --mode locale": solo indirizzo e chiave pubblica LOCALI. */
export function writeEnvLocale(extra = {}) {
  const s = localStatus();
  const prev = readEnvLocale();
  const all = { ...prev, VITE_SUPABASE_URL: s.url, VITE_SUPABASE_KEY: s.anon, ...extra };
  fs.writeFileSync(path.join(appDir, '.env.locale'), Object.entries(all).map(([k, v]) => k + '=' + v).join('\n') + '\n');
  return s;
}

export function readEnvLocale() {
  const f = path.join(appDir, '.env.locale');
  if (!fs.existsSync(f)) return {};
  const env = {};
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
  return env;
}
