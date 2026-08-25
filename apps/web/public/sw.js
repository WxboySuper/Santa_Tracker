// Next.js PWA service worker — replaces Flask cache-first list
const CACHE_NAME = 'santa-tracker-next-v1';
const OFFLINE_PAGE = '/offline';

const urlsToCache = [
  '/',
  '/tracker',
  '/offline',
  '/api/route',
];

function requestCacheKey(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/route') {
    return new Request(new URL('/api/route', self.location.origin));
  }
  return request;
}

function isMapTile(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.tile.openstreetmap.org');
  } catch {
    return false;
  }
}

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then(cache =>
    cache.match(requestCacheKey(request)).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) void cache.put(requestCacheKey(request), response.clone());
        return response;
      });
    }),
  );
}
function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).catch(e=>console.error(e)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):null))));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (isMapTile(req.url)) {
    event.respondWith(cacheFirst(req).catch(() => Response.error()));
    return;
  }
  event.respondWith(
    caches.match(requestCacheKey(req)).then(cached => cached || fetch(req)).catch(()=>{
      if (isNavigationRequest(req)) return caches.match(OFFLINE_PAGE) || new Response('<h1>Offline</h1>', { status: 503, headers: {'Content-Type':'text/html'}});
      return new Response('Service Unavailable', { status: 503 });
    })
  );
});
