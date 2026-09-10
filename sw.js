// Service Worker — Stocks Pédagogiques
// Stratégie ultra-simple : cache minimal, réseau prioritaire
const CACHE_NAME = 'stocks-v11';   // v11 : ajout notifications push

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['./index.html', './manifest.json', './js/kiosque.js', './js/vaccinations.js']))
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

// --- Notifications Push ---
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Koala Kids', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: './icons/icon-192.png',
    data: { url: payload.url || './demandes.html' },
    tag: payload.tag || 'koala-notif',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Koala Kids', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './demandes.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl.replace('./', '')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
