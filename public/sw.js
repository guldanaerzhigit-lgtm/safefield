const CACHE = 'safefield-shell-v2';
const SHELL = ['/', '/manifest.webmanifest'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('safefield-shell-') && key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Ешқашан авторизацияланған API жауаптарын кэшке сақтамау.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (await caches.match('/'))));
});
self.addEventListener('push', (event) => {
  let payload = { title: 'SAFEFIELD', body: 'Жаңа қауіпсіздік хабарламасы', url: '/' };
  try { payload = { ...payload, ...(event.data?.json() || {}) }; } catch { /* қауіпсіз әдепкі хабарлама */ }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, data: { url: payload.url }, icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', requireInteraction: true }));
});
self.addEventListener('notificationclick', (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.url || '/')); });
