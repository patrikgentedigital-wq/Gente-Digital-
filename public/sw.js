// Gente Digital - Indique e Ganhe | Service Worker
// Estratégia cache-first apenas para assets imutáveis do Next (_next/static).
// Demais requests passam direto para a rede.

const STATIC_ASSETS_CACHE = 'gd-static-assets-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches antigos de versões anteriores
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_ASSETS_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Só intercepta GET same-origin de assets imutáveis (_next/static).
  // Tudo mais (navegação, APIs, cross-origin) passa direto.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/_next/static/')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_ASSETS_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Sem rede e sem cache: deixa o erro seguir
        throw err;
      }
    })()
  );
});
