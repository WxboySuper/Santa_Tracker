// filepath: /sw.js
const CACHE_NAME = 'santa-tracker-v1';

self.addEventListener('activate', event => {
  event.waitUntil(
    CacheStorage.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

const urlsToCache = [
  '/',
  '/index.html',
  'src/static/styles.css',
  'src/static/script.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request)
          .catch(() => {
            return caches.match('/offline.html');
          });
      })
  );
});
