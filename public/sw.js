const CACHE_NAME = 'ticket-manager-static-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/ticket-manager.svg', '/icons/ticket-manager-192.png', '/icons/ticket-manager-512.png', '/icons/ticket-manager-maskable-192.png', '/icons/ticket-manager-maskable-512.png']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const pagina = await fetch('/', { cache: 'no-store' })
    if (!pagina.ok) throw new Error('No se pudo preparar Ticket Manager para instalar.')
    await cache.put('/', pagina.clone())
    const html = await pagina.text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match => match[1])
    await cache.addAll([...APP_SHELL.slice(1), ...new Set(assets)])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('ticket-manager-static-') && name !== CACHE_NAME).map(name => caches.delete(name)))),
    self.clients.claim(),
  ]))
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('/', response.clone()))
      return response
    }).catch(() => caches.match('/')))
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
      return response
    })))
  }
})
