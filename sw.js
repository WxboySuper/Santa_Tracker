// filepath: /sw.js
const CACHE_NAME = 'santa-tracker-v2';
const OFFLINE_PAGE = '/offline.html';

// Only cache local assets - avoid caching third-party CDN resources
const urlsToCache = [
    '/',
    '/index.html',
    '/offline.html',
    '/src/static/styles.css',
    '/src/static/script.js',
    '/src/static/images/santa-icon.png'
];

/**
 * Check if a URL is from an external origin (third-party CDN)
 * @param {string} url - The URL to check
 * @returns {boolean} - True if the URL is external
 */
function isExternalUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.origin !== self.location.origin;
    } catch (e) {
        return false;
    }
}

/**
 * Check if the request is a navigation request (HTML page)
 * @param {Request} request - The fetch request
 * @returns {boolean} - True if this is a navigation request
 */
function isNavigationRequest(request) {
    return request.mode === 'navigate' ||
           (request.method === 'GET' &&
            request.headers.get('accept') &&
            request.headers.get('accept').includes('text/html'));
}

// Install event handler
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .catch(error => console.error('Cache installation failed:', error))
    );
});

// Activate event handler
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                    return null;
                })
            );
        })
    );
});

// Fetch event handler
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Skip caching for external URLs (third-party CDN resources)
    if (isExternalUrl(request.url)) {
        event.respondWith(
            fetch(request).catch(error => {
                console.error('External fetch failed:', error);
                return new Response('Service Unavailable', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
        );
        return;
    }

    // Handle local requests with cache-first strategy
    event.respondWith(
        caches.match(request)
            .then(response => {
                return response || fetch(request);
            })
            .catch(error => {
                console.error('Fetch failed:', error);

                // For navigation requests, serve the offline page
                if (isNavigationRequest(request)) {
                    return caches.match(OFFLINE_PAGE).then(offlineResponse => {
                        // Return offline page if cached, otherwise return a basic offline response
                        return offlineResponse || new Response(
                            '<!DOCTYPE html><html><head><title>Offline</title></head>' +
                            '<body><h1>You are offline</h1><p>Please check your connection.</p></body></html>',
                            {
                                status: 503,
                                statusText: 'Service Unavailable',
                                headers: { 'Content-Type': 'text/html' }
                            }
                        );
                    });
                }

                // For other requests, return 503 Service Unavailable
                return new Response('Service Unavailable', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});
