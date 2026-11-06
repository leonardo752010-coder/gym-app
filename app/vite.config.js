import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';

// Service worker scritto alla fine della build con l'elenco esatto dei file:
// la prima visita li mette tutti in cache, poi l'app si apre anche senza rete.
function serviceWorker() {
  return {
    name: 'gym-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff'));
      const extra = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
      const list = ['./', ...files.filter((f) => f !== 'index.html'), ...extra];
      const version = createHash('sha256').update(files.sort().join('|') + JSON.stringify(Object.values(bundle).map((b) => b.code || b.source?.length || ''))).digest('hex').slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: SW.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(list)) });
    },
  };
}

const SW = `// Service worker della PWA Gym (creato dalla build).
const CACHE = 'gym-__VERSION__';
const FILES = __FILES__;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('gym-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // Supabase e altro: sempre rete, mai cache
  if (req.mode === 'navigate') {                         // la pagina: subito dalla cache (apertura veloce e offline)
    e.respondWith(caches.match('./', { cacheName: CACHE, ignoreVary: true, ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(req)));
});
`;

export default defineConfig(({ mode }) => ({
  base: './',
  envPrefix: 'VITE_',
  define: { __APP_VERSION__: JSON.stringify(new Date().toLocaleString('sv-SE').slice(0, 16)) },   // data e ora (locali) della build
  build: { target: 'es2020', sourcemap: false, assetsInlineLimit: 0 },
  plugins: [serviceWorker()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
}));
