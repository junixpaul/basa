// Offline support. App files and Supabase reads: network first, saved copy when offline.
// Libraries and fonts from CDNs: saved copy first (they never change at a given URL).
// The Whisper model is cached by transformers.js itself, so it is left alone here.
const APP = 'basa-app', DATA = 'basa-data', CDN = 'basa-cdn'
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(APP).then(c => c.addAll(['./', 'index.html', 'config.js', 'logo.svg', 'manifest.webmanifest', 'src/app.js'])))
})
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET') return
  if (url.origin === location.origin) return e.respondWith(networkFirst(APP, req))
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) return e.respondWith(networkFirst(DATA, req))
  if (CDN_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(CDN, req))
})

async function networkFirst(name, req) {
  try {
    const res = await fetch(req)
    if (res.ok) (await caches.open(name)).put(req, res.clone())
    return res
  } catch (err) {
    // ignoreVary: Supabase varies on the auth header, which changes when the token refreshes
    const hit = await caches.match(req, { cacheName: name, ignoreVary: true })
      ?? (req.mode === 'navigate' ? await caches.match('index.html', { cacheName: APP }) : undefined)
    if (hit) return hit
    throw err
  }
}

async function cacheFirst(name, req) {
  const hit = await caches.match(req, { cacheName: name })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok || res.type === 'opaque') (await caches.open(name)).put(req, res.clone())
  return res
}
