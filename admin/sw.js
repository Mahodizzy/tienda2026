/* Refills EC Panel — permite instalar la app y abrirla aunque falle la conexión.
   Siempre intenta traer la versión más nueva; si no hay internet, usa la guardada. */
const CACHE = 'refills-admin-v4';
const BASE = ['./', 'index.html', 'admin.css', 'admin.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
  '../shop/static/config.js', '../shop/static/catalogo.js', '../img/logoo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
