// Service Worker — Stocks Pédagogiques
// Stratégie ultra-simple : cache minimal, réseau prioritaire
const CACHE_NAME = 'stocks-v33';   // v33 : pushsubscriptionchange (réabonnement push automatique)

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

// Le navigateur a renouvelé l'abonnement push : on le réenregistre sans attendre
// que la personne rouvre l'application (sinon la fonction reçoit des 410 et le supprime).
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const old = event.oldSubscription;
      const key = old && old.options && old.options.applicationServerKey;
      const sub = event.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      });
      // L'identité n'est pas connue du service worker : on prévient les pages ouvertes,
      // sinon checkNotifSubscription resynchronise à la prochaine ouverture.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(c => c.postMessage({ type: 'PUSH_SUB_CHANGED', subscription: sub && sub.toJSON() }));
    } catch (e) { /* resynchronisé à la prochaine ouverture de Demandes */ }
  })());
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
