'use client'

import { useEffect, useRef } from 'react'
import { sendClientLog } from '@helpers/clientLog'

const byteLength = (value) => {
  try {
    return new Blob([JSON.stringify(value ?? null)]).size
  } catch (error) {
    return 0
  }
}

const countItems = (value) => (Array.isArray(value) ? value.length : 0)

const getNavigationTiming = () => {
  if (typeof performance === 'undefined') return {}
  const entry = performance.getEntriesByType?.('navigation')?.[0]
  if (!entry) return {}

  return {
    domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd || 0),
    loadMs: Math.round(entry.loadEventEnd || 0),
    responseEndMs: Math.round(entry.responseEnd || 0),
  }
}

const scheduleAfterPaint = (callback) => {
  if (typeof window === 'undefined') return () => {}

  let rafA = 0
  let rafB = 0
  rafA = window.requestAnimationFrame(() => {
    rafB = window.requestAnimationFrame(callback)
  })

  return () => {
    window.cancelAnimationFrame(rafA)
    window.cancelAnimationFrame(rafB)
  }
}

const useCabinetPerformanceMetrics = ({
  page,
  events,
  clients,
  transactions,
  services,
  tariffs,
  users,
  eventsPaging,
  isSiteLoading,
}) => {
  const sentRef = useRef(false)

  useEffect(() => {
    if (sentRef.current) return undefined
    if (isSiteLoading) return undefined
    if (typeof window === 'undefined') return undefined

    const startedAt = performance.now?.() ?? Date.now()

    return scheduleAfterPaint(() => {
      if (sentRef.current) return
      sentRef.current = true

      const collections = {
        events: {
          count: countItems(events),
          bytes: byteLength(events),
        },
        clients: {
          count: countItems(clients),
          bytes: byteLength(clients),
        },
        transactions: {
          count: countItems(transactions),
          bytes: byteLength(transactions),
        },
        services: {
          count: countItems(services),
          bytes: byteLength(services),
        },
        tariffs: {
          count: countItems(tariffs),
          bytes: byteLength(tariffs),
        },
        users: {
          count: countItems(users),
          bytes: byteLength(users),
        },
      }

      const totalBytes = Object.values(collections).reduce(
        (sum, item) => sum + item.bytes,
        0
      )

      sendClientLog({
        type: 'cabinet-performance',
        page,
        firstClientRenderMs: Math.round((performance.now?.() ?? Date.now()) - startedAt),
        payload: {
          totalBytes,
          collections,
          eventsPaging: eventsPaging ?? null,
        },
        navigation: getNavigationTiming(),
      })
    })
  }, [
    clients,
    events,
    eventsPaging,
    isSiteLoading,
    page,
    services,
    tariffs,
    transactions,
    users,
  ])
}

export default useCabinetPerformanceMetrics
