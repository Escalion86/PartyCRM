import { partyPrivateLinkPath } from './partyPrivateLinkPaths'

export const sendClientLog = (payload) => {
  if (typeof window === 'undefined' || partyPrivateLinkPath.test(window.location.pathname)) return
  try {
    const body = JSON.stringify(payload)
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/client-log', blob)
      return
    }
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch (_) {
    return undefined
  }
}
