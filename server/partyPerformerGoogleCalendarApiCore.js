import {
  mergePartyGoogleCalendarCredentials,
  normalizePartyGoogleCalendarSettings,
  toPublicPartyGoogleCalendarStatus,
} from './partyGoogleCalendarSettings.js'

const REDIRECT_PATH = '/performer/settings/integrations'
const error = (status, code, message) => ({ status, error: { code, message } })
const callbackFailure = (errorCode) => ({
  status: 302,
  redirectPath: REDIRECT_PATH,
  errorCode,
})

const getPartyPerformerGoogleCalendarNonceCookieName = (userId) => {
  const value = String(userId || '')
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid user id')
  return `party_perf_gcal_nonce_${value}`
}

const getPartyPerformerGoogleCalendarNonceCookieNames = (cookies = []) =>
  cookies
    .map((cookie) => cookie?.name)
    .filter(
      (name) =>
        typeof name === 'string' && name.startsWith('party_perf_gcal_nonce_')
    )

const createPartyPerformerGoogleCalendarApiCore = (deps) => {
  const load = async (userId) => {
    const user = await deps.loadUser(userId)
    if (!user || user.status === 'archived' || user.status === 'blocked') {
      return {
        failure: error(404, 'party_performer_not_found', 'Исполнитель не найден'),
      }
    }
    return {
      user,
      settings: normalizePartyGoogleCalendarSettings(
        user.performerSettings?.googleCalendar
      ),
    }
  }
  const publicResult = (settings) => ({
    status: 200,
    data: toPublicPartyGoogleCalendarStatus({
      settings,
      allowCalendarSync: true,
    }),
  })
  const save = async (userId, settings) => {
    await deps.saveGoogleCalendar(
      userId,
      normalizePartyGoogleCalendarSettings(settings)
    )
    return publicResult(settings)
  }
  const withClient = async (userId) => {
    const loaded = await load(userId)
    if (loaded.failure) return loaded
    let credentials = loaded.settings
    const client = deps.createClient(loaded.settings, {
      onCredentials: async (tokens) => {
        credentials = mergePartyGoogleCalendarCredentials({
          settings: credentials,
          tokens,
          email: credentials.connectedEmail,
          connectedByUserId: credentials.connectedByUserId,
          now: deps.now(),
        })
        await deps.saveGoogleCalendar(userId, credentials)
      },
    })
    if (!client) {
      return {
        failure: error(
          503,
          'party_performer_calendar_unavailable',
          'Google Calendar не настроен'
        ),
      }
    }
    return { ...loaded, client, getCredentials: () => credentials }
  }

  return {
    async status({ userId }) {
      const loaded = await load(userId)
      return loaded.failure || publicResult(loaded.settings)
    },
    async authUrl({ userId }) {
      const loaded = await load(userId)
      if (loaded.failure) return loaded.failure
      const nonce = deps.randomNonce()
      const state = deps.createState({
        subjectType: 'performer',
        userId,
        nonce,
        redirectPath: REDIRECT_PATH,
      })
      return {
        status: 200,
        data: { url: deps.createAuthUrl({ state }) },
        nonce,
        cookieName: getPartyPerformerGoogleCalendarNonceCookieName(userId),
      }
    },
    async calendars({ userId }) {
      const loaded = await withClient(userId)
      if (loaded.failure) return loaded.failure
      const calendars = await loaded.client.listCalendars()
      await loaded.client.flushCredentialsUpdates?.()
      return { status: 200, data: { calendars } }
    },
    async select({ userId, calendarId }) {
      const loaded = await withClient(userId)
      if (loaded.failure) return loaded.failure
      const calendars = await loaded.client.listCalendars()
      await loaded.client.flushCredentialsUpdates?.()
      const selected = calendars.find(
        (item) => item.id === String(calendarId || '').trim()
      )
      if (!selected) {
        return error(400, 'party_performer_calendar_invalid_selection', 'Календарь недоступен')
      }
      return save(userId, {
        ...loaded.getCredentials(),
        calendarId: selected.id,
        calendarName: selected.name || selected.summary || '',
        updatedAt: deps.now(),
      })
    },
    async settings({ userId, patch = {} }) {
      const loaded = await load(userId)
      if (loaded.failure) return loaded.failure
      const allowed = {}
      for (const key of ['enabled', 'reminders']) {
        if (Object.hasOwn(patch, key)) allowed[key] = patch[key]
      }
      return save(userId, { ...loaded.settings, ...allowed, updatedAt: deps.now() })
    },
    async disconnect({ userId }) {
      const loaded = await load(userId)
      if (loaded.failure) return loaded.failure
      return save(userId, {
        ...loaded.settings,
        enabled: false,
        accessToken: '',
        refreshToken: '',
        tokenType: '',
        scope: '',
        expiryDate: null,
        connectedEmail: '',
        connectedByUserId: '',
        connectedAt: null,
        calendarId: '',
        calendarName: '',
        updatedAt: deps.now(),
      })
    },
    async callback({ code, state, nonce, authorize }) {
      try {
        const payload = deps.verifyState(state)
        if (payload.subjectType !== 'performer') return callbackFailure('oauth_forbidden')
        if (!nonce || nonce !== payload.nonce) return callbackFailure('oauth_replay')
        if (!code) return callbackFailure('oauth_code_missing')
        if (!(await authorize(payload))) return callbackFailure('oauth_forbidden')
        const loaded = await load(payload.userId)
        if (loaded.failure) return callbackFailure('oauth_forbidden')
        const exchanged = await deps.exchangeCode(code)
        const merged = mergePartyGoogleCalendarCredentials({
          settings: loaded.settings,
          tokens: exchanged.tokens,
          email: exchanged.email,
          connectedByUserId: payload.userId,
          now: deps.now(),
        })
        await deps.saveGoogleCalendar(payload.userId, merged)
        return { status: 302, redirectPath: REDIRECT_PATH }
      } catch {
        return callbackFailure('oauth_failed')
      }
    },
  }
}

export {
  REDIRECT_PATH,
  createPartyPerformerGoogleCalendarApiCore,
  getPartyPerformerGoogleCalendarNonceCookieName,
  getPartyPerformerGoogleCalendarNonceCookieNames,
}
