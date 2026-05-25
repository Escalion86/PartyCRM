'use client'

import { useEffect } from 'react'

const DevelopmentServiceWorkerCleanup = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .then(() => {
        if (!window.caches?.keys) return null
        return window.caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter(
                  (key) =>
                    key.includes('workbox') ||
                    key.includes('precache') ||
                    key.includes('crm-app-shell') ||
                    key.includes('crm-runtime')
                )
                .map((key) => window.caches.delete(key))
            )
          )
      })
      .catch(() => null)
  }, [])

  return null
}

export default DevelopmentServiceWorkerCleanup
