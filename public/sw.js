// Service worker: lets Bullet open without a connection.
// Network first, so a new version on the server arrives at once; if the
// network does not answer in time, the stored copy is used. The server
// (api.php, oauth.php) is never cached.

// The real app and its test copy lie side by side on one web space; each
// keeps its own store, named after its folder.
const FOLDER = new URL(self.registration.scope).pathname;
const CACHE = `bullet-v1 ${FOLDER}`;
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('bullet-') && k.endsWith(` ${FOLDER}`) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.php')) return;
  event.respondWith(networkFirst(request, url));
});

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  // Built files carry a fingerprint in their name: once stored, always right.
  if (url.pathname.includes('/assets/')) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  network.catch(() => null);
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || await network;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const index = await cache.match('./', { ignoreSearch: true }) || await cache.match('index.html', { ignoreSearch: true });
      if (index) return index;
    }
    throw new Error('offline');
  }
}
