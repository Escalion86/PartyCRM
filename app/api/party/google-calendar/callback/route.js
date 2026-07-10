import { NextResponse } from 'next/server'
import {
  REDIRECT_PATH,
  getPartyGoogleCalendarNonceCookieNames,
} from '@server/partyGoogleCalendarApiCore'
import {
  REDIRECT_PATH as PERFORMER_REDIRECT_PATH,
  getPartyPerformerGoogleCalendarNonceCookieNames,
} from '@server/partyPerformerGoogleCalendarApiCore'
import { getPartyGoogleCalendarPublicOrigin } from '@server/partyGoogleCalendarRedirect'
import {
  authorizeCallback,
  createCore,
  nonceCookieOptions,
  verifyStatePayload,
} from '../_shared'
import {
  authorizePerformerCallback,
  createPerformerCore,
} from '../../performer/google-calendar/_shared'

const clearNonceCookies = (req, response) => {
  const cookies = req.cookies.getAll()
  const cookieNames = [
    ...getPartyGoogleCalendarNonceCookieNames(cookies),
    ...getPartyPerformerGoogleCalendarNonceCookieNames(cookies),
  ]
  for (const cookieName of cookieNames) {
    response.cookies.set(cookieName, '', { ...nonceCookieOptions, maxAge: 0 })
  }
}

const redirect = (req, status, errorCode = '', redirectPath = REDIRECT_PATH) => {
  const target = new URL(
    redirectPath,
    getPartyGoogleCalendarPublicOrigin({ requestUrl: req.url })
  )
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
    const payload = verifyStatePayload(state)
    const performer = payload.subjectType === 'performer'
    const nonceCookieNames = performer
      ? getPartyPerformerGoogleCalendarNonceCookieNames(req.cookies.getAll())
      : getPartyGoogleCalendarNonceCookieNames(req.cookies.getAll())
    const nonceCookie = req.cookies
      .getAll()
      .find((cookie) => nonceCookieNames.includes(cookie.name))
    const core = performer ? createPerformerCore() : createCore()
    const result = await core.callback({
      code: url.searchParams.get('code'),
      state,
      nonce: nonceCookie?.value,
      authorize: performer ? authorizePerformerCallback : authorizeCallback,
    })
    const redirectPath = performer ? PERFORMER_REDIRECT_PATH : REDIRECT_PATH
    return result.errorCode
      ? redirect(req, 'error', result.errorCode, redirectPath)
      : redirect(req, 'connected', '', redirectPath)
  } catch {
    return redirect(req, 'error', 'oauth_failed')
  }
}
