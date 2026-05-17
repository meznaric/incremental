// Echoes Beyond the Stars — offline service worker.
//
// Strategy:
//   - precache the app shell on install
//   - HTML (navigation): network-first, fall back to cached index.html
//   - everything else: cache-first, populate on demand
//
// Bump CACHE_VERSION whenever shell asset paths or precache contents change.
// Older caches are dropped on activate.

const CACHE_VERSION = 'v19';
const CACHE_NAME = `echoes-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './og-image.png',

  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './vendor/remixicon/remixicon.css',
  './vendor/remixicon/remixicon.woff2',

  './styles/base.css',
  './styles/shop.css',
  './styles/welcomeBack.css',
  './styles/interstitial.css',
  './styles/cyclePattern.css',
  './styles/network.css',
  './styles/gameLog.css',
  './styles/achievements.css',

  './src/main.js',
  './src/mainUi.js',
  './src/achievements.js',
  './src/achievements-data.js',
  './src/achievementsUi.js',
  './src/bignum.js',
  './src/breakdown.js',
  './src/breakdownUi.js',
  './src/contactLog.js',
  './src/contactLogUi.js',
  './src/cyclePatterns.js',
  './src/debugUi.js',
  './src/display.js',
  './src/episodes.js',
  './src/gambleFx.js',
  './src/gameLog.js',
  './src/gameLogUi.js',
  './src/hero.js',
  './src/interstitial.js',
  './src/interstitialUi.js',
  './src/menu.js',
  './src/patternUi.js',
  './src/periods-data.js',
  './src/periods.js',
  './src/save.js',
  './src/shop.js',
  './src/tap.js',
  './src/upgrades-data.js',
  './src/upgrades.js',
  './src/welcomeBack.js',
  './src/worlds-data.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use {cache: 'reload'} so install doesn't pick up stale HTTP-cache entries.
      cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: try network, fall back to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Static assets: cache-first, populate on demand.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
