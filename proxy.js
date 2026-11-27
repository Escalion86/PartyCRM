import { NextResponse } from 'next/server'
import {
  PARTY_IMPERSONATION_COOKIE,
  PARTY_IMPERSONATION_UI_COOKIE,
  PARTY_OWN_SESSION_CONTEXT,
  PARTY_SESSION_CONTEXT_HEADER,
} from './helpers/partyImpersonationConstants'

const PRODUCTION_HOST = 'artistcrm.ru'
const LEGACY_HOSTS = new Set(['www.artistcrm.ru'])
const PARTYCRM_HOST = process.env.DOMAIN || 'partycrm.ru'
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
const PARTY_SESSION_CHANGE_PATHS = new Set([
  '/api/party/auth/login',
  '/api/party/auth/logout',
  '/api/party/auth/register',
  '/api/party/auth/vk',
])

const partySessionConflict = (error) =>
  NextResponse.json(
    { success: false, error },
    { status: 409, headers: { 'Cache-Control': 'private, no-store' } }
  )

const normalizeHost = (host) =>
  String(host || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '')

export function proxy(request) {
  const host = normalizeHost(request.headers.get('host'))
  const forwardedProto = request.headers.get('x-forwarded-proto') || ''
  const url = request.nextUrl
  const impersonating = request.cookies.has(PARTY_IMPERSONATION_COOKIE)
  const isPartyApi = url.pathname.startsWith('/api/party/')
  const disableCache = (response) => {
    if (impersonating) response.headers.set('Cache-Control', 'private, no-store')
    return response
  }

  if (isPartyApi) {
    const tabContext = request.headers.get(PARTY_SESSION_CONTEXT_HEADER)
    const currentContext = request.cookies.get(PARTY_IMPERSONATION_UI_COOKIE)?.value ||
      PARTY_OWN_SESSION_CONTEXT
    if (tabContext !== null && tabContext !== currentContext) {
      return partySessionConflict('Аккаунт в этой вкладке сменился. Обновите страницу.')
    }
    if (
      impersonating &&
      request.method === 'POST' &&
      PARTY_SESSION_CHANGE_PATHS.has(url.pathname)
    ) {
      return partySessionConflict('Сначала вернитесь в свой аккаунт.')
    }
    if (impersonating && tabContext === null && url.pathname === '/api/party/push/subscribe') {
      return partySessionConflict('Откройте кабинет, чтобы подключить уведомления.')
    }
    return disableCache(NextResponse.next())
  }

  const partyHost = normalizeHost(PARTYCRM_HOST)
  const isLocalDevHost = LOCAL_DEV_HOSTS.has(host)

  if (!isLocalDevHost && partyHost && host === partyHost && url.pathname === '/') {
    const rewriteUrl = url.clone()
    rewriteUrl.pathname = '/party'
    return disableCache(NextResponse.rewrite(rewriteUrl))
  }

  if (
    !isLocalDevHost &&
    partyHost &&
    host === partyHost &&
    url.pathname === '/manifest.json'
  ) {
    const rewriteUrl = url.clone()
    rewriteUrl.pathname = '/party-manifest.json'
    return NextResponse.rewrite(rewriteUrl)
  }

  const isProductionHost = host === PRODUCTION_HOST || LEGACY_HOSTS.has(host)
  if (!isProductionHost) return disableCache(NextResponse.next())

  const shouldUseApex = LEGACY_HOSTS.has(host)
  const shouldUseHttps = forwardedProto === 'http' || url.protocol === 'http:'

  if (!shouldUseApex && !shouldUseHttps) return disableCache(NextResponse.next())

  const redirectUrl = url.clone()
  redirectUrl.hostname = PRODUCTION_HOST
  redirectUrl.protocol = 'https:'

  return disableCache(NextResponse.redirect(redirectUrl, 308))
}

export const config = {
  matcher: [
    '/api/party/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|workbox-.*|worker-.*|icons|img).*)',
  ],
}
