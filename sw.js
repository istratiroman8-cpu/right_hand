// Roman Task Manager — Service Worker
// Versione cache: aggiorna questo valore ad ogni deploy per invalidare la cache
const CACHE_NAME = 'roman-tasks-v1';

// Risorse da pre-cachare (tutte le risorse essenziali dell'app)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── INSTALL: pre-cacha le risorse essenziali ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Attiva immediatamente senza aspettare che le tab esistenti vengano chiuse
  self.skipWaiting();
});

// ── ACTIVATE: rimuovi cache obsolete ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  // Prendi il controllo di tutte le tab immediatamente
  self.clients.claim();
});

// ── FETCH: strategia Cache First, poi Network ─────────────────────────────────
self.addEventListener('fetch', event => {
  // Ignora richieste non-GET e richieste a domini esterni (es. Google Fonts)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Per Google Fonts usa Network First (per aggiornamenti font)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Per tutto il resto: Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cacha solo risposte valide
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
