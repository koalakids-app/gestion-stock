// Service Worker — Réglementation Micro-Crèches
// Version du cache — incrémenter à chaque mise à jour de l'app
const CACHE_NAME = 'microcreches-v1';

// Ressources à mettre en cache immédiatement à l'installation
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// ── Installation : mise en cache des ressources statiques ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Mise en cache des ressources statiques');
        // Cache index.html et manifest en priorité ; les fonts peuvent échouer hors ligne
        return cache.addAll(PRECACHE_URLS.slice(0, 4))
          .then(() => {
            // Tenter les fonts sans bloquer l'installation
            return cache.addAll([PRECACHE_URLS[4]]).catch(() => {
              console.log('[SW] Fonts non cachées (réseau requis au premier lancement)');
            });
          });
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage des anciens caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie Cache First avec fallback réseau ─────────────────────
self.addEventListener('fetch', event => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') return;

  // Ignorer les requêtes vers d'autres origines (APIs externes, analytics...)
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isGoogleFont = url.hostname.includes('fonts.googleapis.com') || 
                       url.hostname.includes('fonts.gstatic.com');

  if (!isLocal && !isGoogleFont) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Ressource en cache : servir immédiatement
          // Mettre à jour le cache en arrière-plan (stale-while-revalidate)
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, networkResponse.clone()));
              }
            })
            .catch(() => {}); // Silencieux si hors ligne
          return cachedResponse;
        }

        // Pas en cache : tenter le réseau
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            // Mettre en cache pour la prochaine fois
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseToCache));
            return networkResponse;
          })
          .catch(() => {
            // Hors ligne et pas en cache : retourner la page principale
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// ── Message : forcer la mise à jour depuis l'interface ─────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
