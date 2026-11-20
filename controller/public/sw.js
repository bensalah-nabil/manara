// The parent console's service worker: what makes it installable as an app, and nothing more.
// It caches no console data and no API answer: a parent must never see stale rules or activity.
// The only thing kept is a small "you're offline" page, shown when a page can't load at all.
const OFFLINE = 'manara-offline-v1'
const OFFLINE_FILES = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE).then((cache) => cache.addAll(OFFLINE_FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method === 'GET' && OFFLINE_FILES.includes(new URL(request.url).pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)))
    return
  }
  // Pages: always the network; the offline page only when there is no network at all.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
  }
  // Everything else (the API included) goes to the network untouched.
})
