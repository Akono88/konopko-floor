// Konopko Floor — Service Worker
const CACHE_NAME = 'floor-v3-2026-04-22';
const APP_SHELL = [
  '/konopko-floor/',
  '/konopko-floor/index.html',
  '/konopko-floor/manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL).catch(()=>{})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Network-first for HTML, cache-first for everything else
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Don't interfere with Supabase or external APIs
  if (!req.url.includes('/konopko-floor/')) return;

  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('/konopko-floor/index.html')))
    );
  } else {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(r => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return r;
      }))
    );
  }
});

// Push notification support (requires VAPID + backend push service to actually fire)
self.addEventListener('push', (e) => {
  let data = { title: 'The Floor', body: 'New update' };
  try { if (e.data) data = e.data.json(); } catch(_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/konopko-floor/icon-192.png',
      badge: '/konopko-floor/icon-192.png',
      tag: data.tag || 'floor',
      data: data.url || '/konopko-floor/'
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) { if (c.url.includes('/konopko-floor/')) return c.focus(); }
      return clients.openWindow(e.notification.data || '/konopko-floor/');
    })
  );
});
