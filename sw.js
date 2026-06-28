// Service Worker — Stocks Pédagogiques
// Stratégie ultra-simple : cache minimal, réseau prioritaire
const CACHE_NAME = 'stocks-v4';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['./index.html', './manifest.json']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Laisser passer TOUT sans interférer — réseau uniquement
  // Sauf index.html : cache en fallback si hors ligne
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
  }
  // Tout le reste (Supabase, CDN, fonts) : réseau direct sans interférence
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
