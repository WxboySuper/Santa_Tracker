// filepath: /sw.js
const CACHE_NAME = 'santa-tracker-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/src/static/styles.css',
  '/src/static/script.js',
  '/src/static/images/santa-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
]

// Install event handler
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(error => console.error('Cache installation failed:', error))
  )
})

// Activate event handler
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
          return null
        })
      )
    })
  )
})

// Fetch event handler
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request)
      })
      .catch(error => {
        console.error('Fetch failed:', error)
        return new Response('Network error', { status: 404 })
      })
  )
})
