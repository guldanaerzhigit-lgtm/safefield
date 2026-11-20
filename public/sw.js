const CACHE = 'safefield-shell-v1';
const SHELL = ['/', '/manifest.webmanifest'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); } return response; }).catch(async () => (await caches.match(request)) || (await caches.match('/'))));
});
self.addEventListener('push', (event) => {
  let payload = { title: 'SAFEFIELD', body: 'Новое уведомление безопасности', url: '/' };
  try { payload = { ...payload, ...(event.data?.json() || {}) }; } catch { /* safe fallback */ }
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, data: { url: payload.url }, icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', requireInteraction: true }));
});
self.addEventListener('notificationclick', (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.url || '/')); });
