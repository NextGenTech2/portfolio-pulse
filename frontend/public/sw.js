// Basic Service Worker to satisfy Chrome PWA install requirements
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  return self.clients.claim();
});

// A fetch event listener is required by Chrome to trigger the "Add to Home Screen" standalone app installation
self.addEventListener('fetch', (event) => {
  // We aren't doing any offline caching right now, just passing the request through
  event.respondWith(fetch(event.request));
});
