// ASSIMILATE service worker — offline shell + versioned caches (docs/DEPLOYMENT.md §sw).
// __SW_VERSION__ is stamped by scripts/stamp-sw.mjs on every build, so each deploy is a
// new worker: the old cache is swept on activate and the app shows the update toast.
//
// Strategy (deliberately boring):
//   /api/*            → network ONLY (never cache money/saves/leaderboards)
//   /assets/* (hashed) → cache-first, immutable by construction
//   navigations        → network-first, cache fallback (the offline entry point)
//   everything else GET, same-origin → stale-while-revalidate-ish network-first

const VERSION = '__SW_VERSION__';
const CACHE = `asm-${VERSION}`;
// The game shell is a real asset directory at /play/ (its own Vite entry); the domain
// root is the marketing site's Home. Precache only the game shell — site pages are
// cached individually by the network-first branch as they're visited.
const SHELL = [
  '/play/', '/manifest.json',
  // Typography rides the shell: offline play keeps its face (fonts are tiny + immutable).
  '/fonts/exo2-var.woff2', '/fonts/chakra-petch-500.woff2', '/fonts/chakra-petch-600.woff2', '/fonts/chakra-petch-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('asm-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only — always live

  // Content-hashed assets never change: serve from cache, fill once. Fonts are
  // filename-versioned (a new face = a new file) so they ride the same branch.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations + the rest: freshest wins, cache keeps us alive offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate' && url.pathname.startsWith('/play')) {
          const shell = await caches.match('/play/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
