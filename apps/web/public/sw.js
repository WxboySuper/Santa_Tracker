// Next.js PWA service worker — replaces Flask cache-first list
const CACHE_NAME = 'santa-tracker-next-v1';
const OFFLINE_PAGE = '/offline';

const urlsToCache = [
  '/',
  '/tracker',
  '/offline',
  '/data/santa_route.json',
];

function isExternalUrl(url) {
  try { return new URL(url).origin !== self.location.origin; } catch { return false; }
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
  if (isExternalUrl(req.url)) {
    event.respondWith(fetch(req).catch(()=>Response.error()));
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req)).catch(()=>{
      if (isNavigationRequest(req)) return caches.match(OFFLINE_PAGE) || new Response('<h1>Offline</h1>', { status: 503, headers: {'Content-Type':'text/html'}});
      return new Response('Service Unavailable', { status: 503 });
    })
  );
});
