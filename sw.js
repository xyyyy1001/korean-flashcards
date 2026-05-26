// Service Worker — network-first strategy (auto-updates, no version bumping needed)
const CACHE_NAME = 'korean-flashcards';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './srs.js',
    './data.js',
    './firebase-sync.js',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg',
];

// Install — cache all assets for offline use
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate — take control immediately
self.addEventListener('activate', (event) => {
    self.clients.claim();
});

// Fetch — network first, fall back to cache when offline
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Got fresh response — update the cache
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Offline — serve from cache
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
