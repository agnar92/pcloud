// Tiny cache for app shell; skip API calls.
const CACHE = 'pccloud-kiosk-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/webrtc.js',
  './js/discovery.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Don’t cache API calls
  if (url.pathname.includes('/api/')) return;
  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
