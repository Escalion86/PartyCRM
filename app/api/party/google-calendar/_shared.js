import crypto from 'node:crypto'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { getPartyCompanyModel, getPartyStaffModel } from '@server/partyModels'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { createPartyGoogleCalendarClient } from '@server/partyGoogleCalendarClient'
import oauthState from '@server/partyGoogleCalendarOAuthState'
import {
  PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES,
  createPartyGoogleCalendarApiCore,
} from '@server/partyGoogleCalendarApiCore'

const { createPartyGoogleCalendarOAuthState, verifyPartyGoogleCalendarOAuthState } = oauthState
const callbackUri = () => String(process.env.PARTY_GOOGLE_OAUTH_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI || `${String(process.env.DOMAIN || '').replace(/\/+$/, '')}/api/party/google-calendar/callback`).trim()
const oauth = () => new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, callbackUri())

export const createCore = () => createPartyGoogleCalendarApiCore({
  loadCompany: async (id) => (await getPartyCompanyModel()).findById(id).lean(),
  saveGoogleCalendar: async (id, settings) => (await getPartyCompanyModel()).updateOne({ _id: id }, { $set: { 'settings.googleCalendar': settings } }),
  getAccess: async (company) => (await getPartyCompanyTariffAccessState(company)).access,
  createClient: (settings, { onCredentials }) =>
    createPartyGoogleCalendarClient(settings, { onCredentials }),
  createState: createPartyGoogleCalendarOAuthState,
  verifyState: verifyPartyGoogleCalendarOAuthState,
  randomNonce: () => crypto.randomBytes(24).toString('base64url'),
  now: () => new Date(),
  createAuthUrl: ({ state }) => oauth().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES,
  }),
  exchangeCode: async (code) => {
    const client = oauth()
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)
    const user = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
    return { tokens, email: user.data?.email || '' }
  },
})

export const authorizeCallback = async ({ companyId, userId }) => Boolean(await (await getPartyStaffModel()).exists({ tenantId: companyId, authUserId: userId, role: { $in: ['owner', 'admin'] }, status: { $ne: 'archived' } }))
export const jsonResult = (result) => NextResponse.json(result.error ? { success: false, error: result.error } : { success: true, data: result.data }, { status: result.status })
export const nonceCookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/party/google-calendar/callback', maxAge: 600 }
export const verifyStatePayload = verifyPartyGoogleCalendarOAuthState
export const createGoogleCalendarAuthUrl = ({ state }) => oauth().generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  state,
  scope: PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES,
})
export const exchangeGoogleCalendarCode = async (code) => {
  const client = oauth()
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)
  const user = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
  return { tokens, email: user.data?.email || '' }
}
