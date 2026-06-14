import {
  mergePartyGoogleCalendarCredentials,
  normalizePartyGoogleCalendarSettings,
  toPublicPartyGoogleCalendarStatus,
} from './partyGoogleCalendarSettings.js'

const REDIRECT_PATH = '/company/settings/integrations'
const PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
])
const error = (status, code, message) => ({ status, error: { code, message } })
const callbackFailure = (errorCode) => ({
  status: 302,
  redirectPath: REDIRECT_PATH,
  errorCode,
})

const getPartyGoogleCalendarNonceCookieName = (companyId) => {
  const value = String(companyId || '')
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid company id')
  return `party_gcal_nonce_${value}`
}

const getPartyGoogleCalendarNonceCookieNames = (cookies = []) =>
  cookies
    .map((cookie) => cookie?.name)
    .filter(
      (name) =>
        typeof name === 'string' && name.startsWith('party_gcal_nonce_')
    )

const createPartyGoogleCalendarApiCore = (deps) => {
  const load = async (companyId, requireTariff = false) => {
    const company = await deps.loadCompany(companyId)
    if (!company) return { failure: error(404, 'party_company_not_found', 'Компания не найдена') }
    const access = await deps.getAccess(company)
    if (requireTariff && !access?.allowCalendarSync) {
      return { failure: error(403, 'party_calendar_tariff_required', 'Интеграция недоступна на текущем тарифе') }
    }
    return { company, access, settings: normalizePartyGoogleCalendarSettings(company.settings?.googleCalendar) }
  }
  const publicResult = (settings, access) => ({ status: 200, data: toPublicPartyGoogleCalendarStatus({ settings, allowCalendarSync: access?.allowCalendarSync }) })
  const save = async (companyId, settings, access) => {
    await deps.saveGoogleCalendar(companyId, normalizePartyGoogleCalendarSettings(settings))
    return publicResult(settings, access)
  }
  const withClient = async (companyId) => {
    const loaded = await load(companyId, true)
    if (loaded.failure) return loaded
    let credentials = loaded.settings
    const client = deps.createClient(loaded.settings, {
      companyId,
      onCredentials: async (tokens) => {
        credentials = mergePartyGoogleCalendarCredentials({
          settings: credentials,
          tokens,
          email: credentials.connectedEmail,
          connectedByUserId: credentials.connectedByUserId,
          now: deps.now(),
        })
        await deps.saveGoogleCalendar(companyId, credentials)
      },
    })
    if (!client) return { failure: error(503, 'party_calendar_unavailable', 'Google Calendar не настроен') }
    return {
      ...loaded,
      client,
      getCredentials: () => credentials,
    }
  }
  return {
    async status({ companyId }) {
      const loaded = await load(companyId)
      return loaded.failure || publicResult(loaded.settings, loaded.access)
    },
    async authUrl({ companyId, userId }) {
      const loaded = await load(companyId, true)
      if (loaded.failure) return loaded.failure
      const nonce = deps.randomNonce()
      const state = deps.createState({ companyId, userId, nonce, redirectPath: REDIRECT_PATH })
      return { status: 200, data: { url: deps.createAuthUrl({ state }) }, nonce, cookieName: getPartyGoogleCalendarNonceCookieName(companyId) }
    },
    async calendars({ companyId }) {
      const loaded = await withClient(companyId)
      if (loaded.failure) return loaded.failure
      const calendars = await loaded.client.listCalendars()
      await loaded.client.flushCredentialsUpdates?.()
      return { status: 200, data: { calendars } }
    },
    async select({ companyId, calendarId }) {
      const loaded = await withClient(companyId)
      if (loaded.failure) return loaded.failure
      const calendars = await loaded.client.listCalendars()
      await loaded.client.flushCredentialsUpdates?.()
      const selected = calendars.find((item) => item.id === String(calendarId || '').trim())
      if (!selected) return error(400, 'party_calendar_invalid_selection', 'Календарь недоступен')
      return save(companyId, { ...loaded.getCredentials(), calendarId: selected.id, calendarName: selected.name || selected.summary || '', updatedAt: deps.now() }, loaded.access)
    },
    async settings({ companyId, patch = {} }) {
      const loaded = await load(companyId, true)
      if (loaded.failure) return loaded.failure
      const allowed = {}
      for (const key of ['enabled', 'reminders', 'statusColors', 'syncSettings', 'deleteCanceledFromCalendar']) {
        if (Object.hasOwn(patch, key)) allowed[key] = patch[key]
      }
      return save(companyId, { ...loaded.settings, ...allowed, updatedAt: deps.now() }, loaded.access)
    },
    async disconnect({ companyId }) {
      const loaded = await load(companyId, true)
      if (loaded.failure) return loaded.failure
      return save(companyId, { ...loaded.settings, enabled: false, accessToken: '', refreshToken: '', tokenType: '', scope: '', expiryDate: null, connectedEmail: '', connectedByUserId: '', connectedAt: null, calendarId: '', calendarName: '', updatedAt: deps.now() }, loaded.access)
    },
    async callback({ code, state, nonce, authorize }) {
      try {
        const payload = deps.verifyState(state)
        if (!nonce || nonce !== payload.nonce) return callbackFailure('oauth_replay')
        if (!code) return callbackFailure('oauth_code_missing')
        if (!(await authorize(payload))) return callbackFailure('oauth_forbidden')
        const loaded = await load(payload.companyId, true)
        if (loaded.failure) return callbackFailure('oauth_forbidden')
        const exchanged = await deps.exchangeCode(code)
        const merged = mergePartyGoogleCalendarCredentials({ settings: loaded.settings, tokens: exchanged.tokens, email: exchanged.email, connectedByUserId: payload.userId, now: deps.now() })
        await deps.saveGoogleCalendar(payload.companyId, merged)
        return { status: 302, redirectPath: REDIRECT_PATH }
      } catch {
        return callbackFailure('oauth_failed')
      }
    },
  }
}

export {
  PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES,
  REDIRECT_PATH,
  createPartyGoogleCalendarApiCore,
  getPartyGoogleCalendarNonceCookieName,
  getPartyGoogleCalendarNonceCookieNames,
}
