'use strict';

/* Roman Task Manager — SW v4.1
   Strategia: cache-first per tutti gli asset statici,
   stale-while-revalidate per navigazione.
   NO skipWaiting aggressivo — evita reload loop su iOS Safari PWA.
*/

var CACHE_NAME = 'roman-v4.1';
var PRECACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-152.png'
];

/* INSTALL — precache assets, non attivare subito */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
    /* NON chiamare skipWaiting() qui:
       su iOS Safari PWA skipWaiting durante un update
       causa un hard reload immediato → splash loop */
  );
});

/* ACTIVATE — rimuovi cache vecchie, poi prendi controllo */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      /* clients.claim() solo dopo aver pulito le cache vecchie */
      return self.clients.claim();
    })
  );
});

/* FETCH */
self.addEventListener('fetch', function(e) {
  var req = e.request;

  /* Ignora non-GET e richieste browser-internal */
  if (req.method !== 'GET') return;
  if (req.url.startsWith('chrome-extension')) return;
  if (req.url.startsWith('safari-extension')) return;

  /* Font Google: cache-first, non blocca se assente */
  if (req.url.indexOf('fonts.googleapis.com') !== -1 ||
      req.url.indexOf('fonts.gstatic.com') !== -1) {
    e.respondWith(cacheFirst(req, true));
    return;
  }

  /* Navigazione (document): stale-while-revalidate
     → risponde subito dalla cache (nessun delay, nessun loop),
       poi aggiorna la cache in background */
  if (req.mode === 'navigate') {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  /* Asset statici (JS, CSS, PNG, ecc.): cache-first */
  e.respondWith(cacheFirst(req, false));
});

/* ── Strategie ── */

function cacheFirst(req, allowOpaque) {
  return caches.match(req).then(function(cached) {
    if (cached) return cached;
    return fetch(req).then(function(resp) {
      if (resp && resp.status === 200 &&
          (resp.type === 'basic' || (allowOpaque && resp.type === 'opaque'))) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
      }
      return resp;
    }).catch(function() {
      /* offline e non in cache: per navigazione ritorna index */
      if (req.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 503 });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(req).then(function(cached) {
      var fetchPromise = fetch(req).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          cache.put(req, resp.clone());
        }
        return resp;
      }).catch(function() {
        /* offline: ritorna la cache se disponibile */
        return cached || caches.match('./index.html');
      });
      /* Se ho la cache la uso subito, altrimenti aspetto la rete */
      return cached || fetchPromise;
    });
  });
}
