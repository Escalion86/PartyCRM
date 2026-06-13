const STATIC_CACHE = 'partycrm-static-v3'
const PAGE_CACHE = 'partycrm-pages-v3'

const isSameOrigin = (url) => url.origin === self.location.origin

const getPushApiBase = () =>
  self.location.hostname.toLowerCase().includes('partycrm')
    ? '/api/party/push'
    : '/api/push'

const isStaticAsset = (pathname) =>
  pathname.startsWith('/_next/static/') ||
  pathname.startsWith('/icons/') ||
  pathname.startsWith('/img/') ||
  pathname.startsWith('/fonts/') ||
  pathname === '/manifest.json' ||
  pathname === '/party-manifest.json' ||
  pathname === '/favicon.ico'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isSameOrigin(url)) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/image')) return
  if (url.pathname === '/party-sw.js' || url.pathname === '/sw.js') return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(PAGE_CACHE)
            await cache.put(request, response.clone())
          }
          return response
        } catch {
          return (await caches.match(request)) || Response.error()
        }
      })()
    )
    return
  }

  if (!isStaticAsset(url.pathname)) return

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request)
      if (cachedResponse) return cachedResponse
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(STATIC_CACHE)
        await cache.put(request, response.clone())
      }
      return response
    })()
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const registration = self.registration
      if (!registration?.pushManager) return

      let subscription = event.newSubscription || null
      const apiBase = getPushApiBase()

      if (!subscription) {
        try {
          const keyResponse = await fetch(`${apiBase}/public-key`, {
            headers: { Accept: 'application/json' },
          })
          const keyPayload = await keyResponse.json().catch(() => ({}))
          const publicKey = keyPayload?.data?.publicKey
          if (!keyResponse.ok || !publicKey) return

          const padding = '='.repeat((4 - (publicKey.length % 4)) % 4)
          const base64 = (publicKey + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/')
          const rawData = atob(base64)
          const applicationServerKey = new Uint8Array(rawData.length)

          for (let index = 0; index < rawData.length; index += 1) {
            applicationServerKey[index] = rawData.charCodeAt(index)
          }

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          })
        } catch {
          return
        }
      }

      if (!subscription) return

      await fetch(`${apiBase}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }).catch(() => null)
    })()
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {
      title: 'PartyCRM',
      body: event.data ? String(event.data.text()) : '',
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'PartyCRM', {
      body: payload.body || '',
      icon:
        payload.icon ||
        '/icons/AppImages/android/android-launchericon-192-192.png',
      badge: payload.badge || '/icons/notification-badge.svg',
      tag: payload.tag || undefined,
      data: payload.data || {},
      actions: Array.isArray(payload.actions) ? payload.actions : [],
      renotify: Boolean(payload.renotify),
      requireInteraction: Boolean(payload.requireInteraction),
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification?.data || {}
  const callId = data.callId || ''
  let targetUrl = data.url || '/party/entry'

  const openTarget = (url) =>
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const sameOriginClient = clients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin
          } catch {
            return false
          }
        })

        if (sameOriginClient) {
          sameOriginClient.focus()
          return url ? sameOriginClient.navigate(url) : null
        }
        return self.clients.openWindow(url)
      })

  if (data.type === 'novofon_recording' && callId && event.action) {
    const decision =
      event.action === 'create_event'
        ? 'create_event'
        : event.action === 'no_event'
          ? 'no_event'
          : ''

    if (decision) {
      targetUrl =
        decision === 'create_event'
          ? `/cabinet/calls?callId=${encodeURIComponent(callId)}`
          : data.url || '/cabinet/calls'

      event.waitUntil(
        fetch(`/api/calls/${encodeURIComponent(callId)}/decision`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ decision }),
        })
          .then((response) => response.json().catch(() => null))
          .then((payload) => openTarget(payload?.data?.url || targetUrl))
      )
      return
    }
  }

  event.waitUntil(openTarget(targetUrl))
})
