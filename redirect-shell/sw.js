// Retirement service worker for the old GitHub Pages origin.
//
// Publishing the "we've moved" page is not enough on its own. Anyone who added
// the old app to their home screen still has the previous service worker
// registered at /busybeegrocer/, and its NavigationRoute answers every
// navigation from the precache -- so the browser never asks the server and
// never sees that anything moved. Deleting sw.js makes that permanent rather
// than fixing it: the update check fetches HTML, fails, and leaves the old
// worker in place indefinitely.
//
// So this replaces it at the same URL and shuts the old one down: it stops
// serving from the cache immediately, deletes every cache, unregisters itself,
// and reloads any open window so it lands on the real page.

self.addEventListener('install', () => {
  // Don't wait for existing tabs to close -- the point is to take over now.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))

      await self.registration.unregister()

      // Anything already open is still showing the old cached app. Reloading
      // now goes to the network, which is the "we've moved" page.
      const windows = await self.clients.matchAll({ type: 'window' })
      for (const client of windows) {
        client.navigate(client.url)
      }
    })(),
  )
})

// Belt and braces for the window between activating and unregistering: pass
// everything straight to the network so nothing is answered from the old cache.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
