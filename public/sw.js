/*
 * 75 Hard Tracker service worker — hand written, no Workbox.
 *
 * The app is deployed under /Habit-tracker/ on GitHub Pages, so every URL here
 * is RELATIVE: a service worker resolves relative URLs against its own
 * location, which is the app root. Absolute paths like `/index.html` would
 * point at the wrong site entirely.
 *
 * Two things are cached, in one cache:
 *
 *   1. The shell, precached on install. Vite hashes the real script and style
 *      filenames at build time, so they cannot be listed here — only the entry
 *      documents can.
 *   2. Everything else (the hashed /assets/* files, icons), cached lazily the
 *      first time it is requested.
 *
 * Because both live in one versioned cache, bumping CACHE on release drops the
 * whole lot — including hashed assets left behind by older builds — and the
 * next online load repopulates it.
 */

/* Bump this on release to drop every cached file and start clean. */
const CACHE = 'hard75-v1'

/* Resolved eagerly so the fetch handler can compare against plain strings. */
const ROOT = new URL('./', self.location).href
const INDEX = new URL('./index.html', self.location).href
const OFFLINE = new URL('./offline.html', self.location).href

const SHELL = [
  ROOT,
  INDEX,
  OFFLINE,
  new URL('./manifest.webmanifest', self.location).href,
  new URL('./icon.svg', self.location).href,
]

/** Destinations worth keeping around; documents are handled separately. */
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest'])

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Not `addAll`: that is atomic, so one 404 would leave the app with no
      // offline support at all. Each miss should cost only its own entry.
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

/** The page posts this from an update prompt to activate a waiting worker. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever cache same-origin GETs. POSTs are not cacheable, and a
  // cross-origin response is either opaque (unusable) or somebody else's to
  // manage.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    // Kick the refresh off here, synchronously, so waitUntil is registered
    // while the event is unambiguously still active — it has to outlive the
    // response when we answer from the cache.
    const revalidate = refresh(request)
    event.waitUntil(revalidate)
    event.respondWith(staleWhileRevalidate(request, revalidate))
  }
})

/** A 200 from our own origin — anything else must not enter the cache. */
function isCacheable(response) {
  return response.status === 200 && (response.type === 'basic' || response.type === 'default')
}

/**
 * Navigations: network first, so a deploy is picked up on the next load, with
 * the cached shell as the offline answer. Deep links (`?date=…`) never match a
 * cache entry exactly, hence the walk down to index.html and then to the
 * standalone offline page.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (isCacheable(response)) await cache.put(request, response.clone())
    return response
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ??
      (await cache.match(INDEX)) ??
      (await cache.match(ROOT)) ??
      (await cache.match(OFFLINE))
    return cached ?? Response.error()
  }
}

/** Fetches and re-caches one asset. Resolves to undefined if the network is out. */
function refresh(request) {
  return fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) {
        const cache = await caches.open(CACHE)
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)
}

/**
 * Static assets: serve the cached copy immediately and let `refresh` update it
 * in the background. Vite's filenames are content-hashed, so a stale hit is
 * never the wrong bytes — a new build simply asks for a new name.
 */
async function staleWhileRevalidate(request, revalidate) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  return cached ?? (await revalidate) ?? Response.error()
}
