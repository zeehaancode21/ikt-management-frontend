// Network-first for pages so users always get the newest version after a deploy.
// (The old version cached index.html forever, which could cause a blank screen after updates.)
const CACHE_NAME = 'ikt-cache-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// No fetch handler on purpose: the browser handles requests normally.