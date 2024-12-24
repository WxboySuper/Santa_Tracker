// filepath: /sw.js
const CACHE_NAME = 'santa-tracker-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/styles.css',
  '/static/script.js'
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
      .then(response => response || fetch(event.request))
  );
});