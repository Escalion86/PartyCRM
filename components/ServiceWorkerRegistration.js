'use client'

import { useEffect } from 'react'
import {
  PARTY_SERVICE_WORKER_URL,
  getPartyServiceWorkerRegistrationOptions,
} from '@helpers/serviceWorkerRegistration'

const ServiceWorkerRegistration = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register(
        PARTY_SERVICE_WORKER_URL,
        getPartyServiceWorkerRegistrationOptions()
      )
      .then((registration) => registration.update())
      .catch(() => null)
  }, [])

  return null
}

export default ServiceWorkerRegistration
