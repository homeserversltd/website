const CACHE_NAME = 'homeserver-fallback-v1';
const urlsToCache = [
    '/fallback.html',
    '/android-chrome-192x192.png',
    '/favicon-32x32.png',
    '/favicon-16x16.png',
    '/favicon.ico'
];

// Install event - cache resources
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event - serve from cache when offline or redirect to fallback
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Don't intercept external requests (CDN, etc.) - let browser handle them natively
    // This prevents service worker errors when external resources fail offline
    if (url.origin !== self.location.origin) {
        return; // Let the request go through normally without service worker intervention
    }
    
    // Don't intercept API requests - let them fail naturally for server detection
    if (url.pathname.startsWith('/api/')) {
        return; // Let the request go through normally without service worker intervention
    }
    
    // Handle main app routes (/, /index.html, etc.)
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/static/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // If main app fails to load, redirect to cached fallback
                    console.log('[ServiceWorker] Main app unreachable, serving fallback');
                    return caches.match('/fallback.html');
                })
        );
        return;
    }
    
    // Handle fallback page and its assets
    if (urlsToCache.some(cachedUrl => url.pathname === cachedUrl)) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    // Return cached version or fetch from network
                    if (response) {
                        return response;
                    }
                    return fetch(event.request);
                })
        );
        return;
    }
    
    // For all other requests (except API), try network first, then cache
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
}); 