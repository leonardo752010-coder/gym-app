// Service worker minimo: tiene in cache solo la "cornice" dell'app (schermata di avvio e icone).
// I dati passano sempre dal foglio, mai dalla cache.
const CACHE = 'gym-shell-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;               // Google: sempre rete
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
