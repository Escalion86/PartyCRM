import { google } from 'googleapis'

import { normalizePartyGoogleCalendarSettings } from './partyGoogleCalendarSettings.js'

const PARTY_GOOGLE_CALENDAR_ERROR_CODES = Object.freeze({
  CREDENTIALS_SAVE_FAILED: 'credentials_save_failed',
  EVENT_MISSING: 'event_missing',
  RECONNECT_REQUIRED: 'reconnect_required',
})

const CALLBACK_PATH = '/api/party/google-calendar/callback'

const getRedirectUri = (env) => {
  const explicit = String(
    env.PARTY_GOOGLE_OAUTH_REDIRECT_URI ?? env.GOOGLE_OAUTH_REDIRECT_URI ?? ''
  ).trim()
  const domain = String(env.DOMAIN ?? '').trim().replace(/\/+$/, '')
  if (!explicit && !domain) return ''

  let candidate = explicit
  if (!candidate) {
    const isLocalhost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
      domain
    )
    const protocol = isLocalhost && env.NODE_ENV !== 'production' ? 'http' : 'https'
    candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(domain)
      ? `${domain}${CALLBACK_PATH}`
      : `${protocol}://${domain}${CALLBACK_PATH}`
  }

  try {
    const url = new URL(candidate)
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    const validProtocol =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && isLocalhost && env.NODE_ENV !== 'production')
    if (
      !validProtocol ||
      url.pathname !== CALLBACK_PATH ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    ) {
      return ''
    }
    return url.toString()
  } catch {
    return ''
  }
}

const createSafeError = (code, status) => {
  const error = new Error(code)
  error.code = code
  if (status !== undefined) error.status = status
  return error
}

const isInvalidGrantError = (error) => {
  const values = [
    error?.code,
    error?.response?.data?.error,
    error?.response?.data?.error?.status,
    error?.errors?.[0]?.reason,
  ]
  return values.some(
    (value) => value === 'invalid_grant' || value === 'reconnect_required'
  )
}

const classifyGoogleCalendarError = (error) => {
  if (isInvalidGrantError(error)) {
    return createSafeError(PARTY_GOOGLE_CALENDAR_ERROR_CODES.RECONNECT_REQUIRED)
  }
  const responseStatus = Number(error?.response?.status)
  const errorCode = Number(error?.code)
  if (responseStatus === 404 || errorCode === 404) {
    return createSafeError(PARTY_GOOGLE_CALENDAR_ERROR_CODES.EVENT_MISSING, 404)
  }
  return error
}

const isPartyGoogleCalendarEventMissingError = (error) =>
  error?.code === PARTY_GOOGLE_CALENDAR_ERROR_CODES.EVENT_MISSING

const isPartyGoogleCalendarReconnectRequiredError = (error) =>
  error?.code === PARTY_GOOGLE_CALENDAR_ERROR_CODES.RECONNECT_REQUIRED

const createPartyGoogleCalendarClient = (
  companyGoogleSettings,
  {
    env = process.env,
    oauthFactory = (clientId, clientSecret, redirectUri) =>
      new google.auth.OAuth2(clientId, clientSecret, redirectUri),
    calendarFactory = (options) => google.calendar(options),
    onCredentials,
  } = {}
) => {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim()
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim()
  const redirectUri = getRedirectUri(env)
  if (!clientId || !clientSecret || !redirectUri) return null

  const settings = normalizePartyGoogleCalendarSettings(companyGoogleSettings)
  let credentials = {
    access_token: settings.accessToken || undefined,
    refresh_token: settings.refreshToken || undefined,
    token_type: settings.tokenType || undefined,
    scope: settings.scope || undefined,
    expiry_date: settings.expiryDate ?? undefined,
  }
  const oauth = oauthFactory(clientId, clientSecret, redirectUri)
  oauth.setCredentials(credentials)

  let credentialsQueue = Promise.resolve()
  let credentialsSaveError = null
  if (typeof onCredentials === 'function') {
    oauth.on('tokens', (tokens = {}) => {
      credentials = {
        access_token: tokens.access_token ?? credentials.access_token,
        refresh_token: tokens.refresh_token ?? credentials.refresh_token,
        token_type: tokens.token_type ?? credentials.token_type,
        scope: tokens.scope ?? credentials.scope,
        expiry_date: tokens.expiry_date ?? credentials.expiry_date,
      }
      const snapshot = { ...credentials }
      credentialsQueue = credentialsQueue
        .catch(() => undefined)
        .then(() => onCredentials(snapshot))
        .catch(() => {
          credentialsSaveError = createSafeError(
            PARTY_GOOGLE_CALENDAR_ERROR_CODES.CREDENTIALS_SAVE_FAILED
          )
        })
    })
  }

  const calendar = calendarFactory({ version: 'v3', auth: oauth })
  const call = async (operation) => {
    try {
      const response = await operation()
      return response?.data
    } catch (error) {
      throw classifyGoogleCalendarError(error)
    }
  }

  return {
    async flushCredentialsUpdates() {
      await credentialsQueue
      if (credentialsSaveError) {
        const error = credentialsSaveError
        credentialsSaveError = null
        throw error
      }
    },
    async listCalendars() {
      const items = await call(async () => {
        const response = await calendar.calendarList.list()
        return { data: Array.isArray(response?.data?.items) ? response.data.items : [] }
      })
      return items
        .filter((item) => item?.accessRole === 'owner' || item?.accessRole === 'writer')
        .map((item) => ({
          id: item.id,
          summary: item.summary,
          name: item.summary,
          primary: Boolean(item.primary),
          accessRole: item.accessRole,
        }))
    },
    insertEvent(calendarId, requestBody) {
      return call(() => calendar.events.insert({ calendarId, requestBody }))
    },
    updateEvent(calendarId, eventId, requestBody) {
      return call(() =>
        calendar.events.update({ calendarId, eventId, requestBody })
      )
    },
    deleteEvent(calendarId, eventId) {
      return call(() => calendar.events.delete({ calendarId, eventId }))
    },
    getConnectedEmail() {
      return settings.connectedEmail
    },
  }
}

export {
  PARTY_GOOGLE_CALENDAR_ERROR_CODES,
  classifyGoogleCalendarError,
  createPartyGoogleCalendarClient,
  isPartyGoogleCalendarEventMissingError,
  isPartyGoogleCalendarReconnectRequiredError,
}
