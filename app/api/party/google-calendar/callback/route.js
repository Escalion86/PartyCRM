import { NextResponse } from 'next/server'
import {
  REDIRECT_PATH,
  getPartyGoogleCalendarNonceCookieNames,
} from '@server/partyGoogleCalendarApiCore'
import { authorizeCallback, createCore, nonceCookieOptions } from '../_shared'

const clearNonceCookies = (req, response) => {
  for (const cookieName of getPartyGoogleCalendarNonceCookieNames(
    req.cookies.getAll()
  )) {
    response.cookies.set(cookieName, '', { ...nonceCookieOptions, maxAge: 0 })
  }
}

const redirect = (req, status, errorCode = '') => {
  const target = new URL(REDIRECT_PATH, req.url)
  target.searchParams.set('googleCalendar', status)
  if (errorCode) target.searchParams.set('error', errorCode)
  const response = NextResponse.redirect(target)
  clearNonceCookies(req, response)
  return response
}

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const state = url.searchParams.get('state') || ''
    const nonceCookie = req.cookies
      .getAll()
      .find((cookie) => cookie.name.startsWith('party_gcal_nonce_'))
    const result = await createCore().callback({
      code: url.searchParams.get('code'),
      state,
      nonce: nonceCookie?.value,
      authorize: authorizeCallback,
    })
    return result.errorCode
      ? redirect(req, 'error', result.errorCode)
      : redirect(req, 'connected')
  } catch {
    return redirect(req, 'error', 'oauth_failed')
  }
}
