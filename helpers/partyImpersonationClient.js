import {
  PARTY_IMPERSONATION_UI_COOKIE,
  PARTY_OWN_SESSION_CONTEXT,
  PARTY_SESSION_CONTEXT_HEADER,
} from './partyImpersonationConstants.js'

export const PARTY_IMPERSONATION_CHANGE_KEY = 'partycrm.impersonationChanged'

export const readPartyImpersonationMarker = () => {
  if (typeof document === 'undefined') return ''
  const prefix = `${PARTY_IMPERSONATION_UI_COOKIE}=`
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(prefix))
  return cookie?.slice(prefix.length) || ''
}

const initialMarker = readPartyImpersonationMarker()
let switchingAccount = false

export const isPartyImpersonationPage = () => Boolean(initialMarker)

export const hasPartyImpersonationChanged = () =>
  readPartyImpersonationMarker() !== initialMarker

export const partyFetch = (url, options) => {
  if (typeof document === 'undefined' || typeof url !== 'string' || !url.startsWith('/api/party/')) {
    return fetch(url, options)
  }

  // Requests from the previous account can still be queued when a tab reloads.
  const headers = new Headers(options?.headers)
  headers.set(PARTY_SESSION_CONTEXT_HEADER, initialMarker || PARTY_OWN_SESSION_CONTEXT)
  return fetch(url, { ...options, headers })
}

export const isPartyImpersonationSwitching = () => switchingAccount

export const setPartyImpersonationSwitching = (switching) => {
  switchingAccount = switching
}

export const notifyPartyImpersonationChange = () => {
  try {
    window.localStorage.setItem(PARTY_IMPERSONATION_CHANGE_KEY, String(Date.now()))
  } catch {}
}
