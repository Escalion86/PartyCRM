import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES,
  createPartyGoogleCalendarApiCore,
  getPartyGoogleCalendarNonceCookieName,
  getPartyGoogleCalendarNonceCookieNames,
} from './partyGoogleCalendarApiCore.js'

const company = (googleCalendar = {}) => ({
  _id: 'company-1',
  settings: { sibling: true, googleCalendar },
})

const setup = (overrides = {}) => {
  let current = company({ accessToken: 'secret', refreshToken: 'refresh' })
  const core = createPartyGoogleCalendarApiCore({
    loadCompany: async (id) => (id === 'company-1' ? current : null),
    saveGoogleCalendar: async (id, settings) => {
      assert.equal(id, 'company-1')
      current = { ...current, settings: { ...current.settings, googleCalendar: settings } }
      return current
    },
    getAccess: async () => ({ allowCalendarSync: true }),
    createClient: () => ({
      listCalendars: async () => [{ id: 'cal-1', name: 'Рабочий' }],
      getConnectedEmail: () => 'boss@example.com',
    }),
    createAuthUrl: ({ state }) => `https://accounts.google.test/auth?state=${state}`,
    exchangeCode: async () => ({
      tokens: { access_token: 'new-access' },
      email: 'boss@example.com',
    }),
    createState: (payload) => `signed:${JSON.stringify(payload)}`,
    verifyState: (state) => JSON.parse(state.slice(7)),
    randomNonce: () => 'nonce-1',
    now: () => new Date('2026-06-14T10:00:00.000Z'),
    ...overrides,
  })
  return { core, getCompany: () => current }
}

test('status is safe and does not expose OAuth credentials', async () => {
  const { core } = setup()
  const result = await core.status({ companyId: 'company-1' })
  assert.equal(result.status, 200)
  assert.equal(result.data.connected, true)
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal(JSON.stringify(result).includes('refresh'), false)
})

test('tariff denial blocks mutating and Google API operations', async () => {
  const { core } = setup({ getAccess: async () => ({ allowCalendarSync: false }) })
  const result = await core.calendars({ companyId: 'company-1' })
  assert.equal(result.status, 403)
  assert.equal(result.error.code, 'party_calendar_tariff_required')
})

test('select validates calendar against tenant account and preserves sibling settings', async () => {
  const { core, getCompany } = setup()
  const result = await core.select({ companyId: 'company-1', calendarId: 'cal-1' })
  assert.equal(result.status, 200)
  assert.equal(getCompany().settings.sibling, true)
  assert.equal(getCompany().settings.googleCalendar.calendarName, 'Рабочий')
})

test('settings merges normalized public settings without credentials from request', async () => {
  const { core, getCompany } = setup()
  await core.settings({
    companyId: 'company-1',
    patch: { enabled: true, accessToken: 'attacker', syncSettings: { showClient: false } },
  })
  assert.equal(getCompany().settings.googleCalendar.accessToken, 'secret')
  assert.equal(getCompany().settings.googleCalendar.enabled, true)
  assert.equal(getCompany().settings.googleCalendar.syncSettings.showClient, false)
})

test('callback requires matching replay nonce and preserves refresh token', async () => {
  const { core, getCompany } = setup()
  const statePayload = {
    companyId: 'company-1', userId: 'user-1', nonce: 'nonce-1',
    redirectPath: '/company/settings/integrations', expiresAt: Date.now() + 1000,
  }
  const result = await core.callback({
    code: 'code', state: `signed:${JSON.stringify(statePayload)}`,
    nonce: 'nonce-1', authorize: async () => true,
  })
  assert.equal(result.status, 302)
  assert.equal(result.redirectPath, '/company/settings/integrations')
  assert.equal(getCompany().settings.googleCalendar.refreshToken, 'refresh')
})

test('callback rejects replay nonce mismatch before token exchange', async () => {
  let exchanged = false
  const { core } = setup({ exchangeCode: async () => { exchanged = true } })
  const payload = { companyId: 'company-1', userId: 'user-1', nonce: 'nonce-1', redirectPath: '/company/settings/integrations', expiresAt: Date.now() + 1000 }
  const result = await core.callback({ code: 'code', state: `signed:${JSON.stringify(payload)}`, nonce: 'wrong', authorize: async () => true })
  assert.equal(result.status, 302)
  assert.equal(result.errorCode, 'oauth_replay')
  assert.equal(exchanged, false)
})

test('callback converts OAuth, authorization and token save failures to safe errors', async () => {
  const payload = { companyId: 'company-1', userId: 'user-1', nonce: 'nonce-1', redirectPath: '/company/settings/integrations', expiresAt: Date.now() + 1000 }
  for (const overrides of [
    { exchangeCode: async () => { throw new Error('token secret') } },
    { saveGoogleCalendar: async () => { throw new Error('database secret') } },
  ]) {
    const { core } = setup(overrides)
    const result = await core.callback({ code: 'code', state: `signed:${JSON.stringify(payload)}`, nonce: 'nonce-1', authorize: async () => true })
    assert.equal(result.status, 302)
    assert.equal(result.redirectPath, '/company/settings/integrations')
    assert.equal(result.errorCode, 'oauth_failed')
    assert.equal(JSON.stringify(result).includes('secret'), false)
  }
  const { core } = setup()
  const result = await core.callback({ code: 'code', state: `signed:${JSON.stringify(payload)}`, nonce: 'nonce-1', authorize: async () => { throw new Error('membership details') } })
  assert.equal(result.errorCode, 'oauth_failed')

  const invalidState = setup({ verifyState: () => { throw new Error('state payload') } })
  const invalidResult = await invalidState.core.callback({ code: 'code', state: 'invalid', nonce: 'nonce-1', authorize: async () => true })
  assert.equal(invalidResult.status, 302)
  assert.equal(invalidResult.errorCode, 'oauth_failed')
})

test('calendar operations persist refreshed credentials tenant-safe and flush them', async () => {
  let flushed = false
  const { core, getCompany } = setup({
    createClient: (settings, { companyId, onCredentials }) => ({
      listCalendars: async () => {
        assert.equal(companyId, 'company-1')
        await onCredentials({ access_token: 'refreshed-access' })
        return []
      },
      flushCredentialsUpdates: async () => { flushed = true },
    }),
  })
  await core.calendars({ companyId: 'company-1' })
  assert.equal(flushed, true)
  assert.equal(getCompany().settings.googleCalendar.accessToken, 'refreshed-access')
  assert.equal(getCompany().settings.googleCalendar.refreshToken, 'refresh')
})

test('select merges calendar metadata with credentials refreshed during calendar list', async () => {
  const { core, getCompany } = setup({
    createClient: (settings, { onCredentials }) => ({
      listCalendars: async () => {
        await onCredentials({ access_token: 'select-refreshed-access' })
        return [{ id: 'cal-1', name: 'Рабочий' }]
      },
      flushCredentialsUpdates: async () => undefined,
    }),
  })

  const result = await core.select({
    companyId: 'company-1',
    calendarId: 'cal-1',
  })

  assert.equal(result.status, 200)
  assert.equal(
    getCompany().settings.googleCalendar.accessToken,
    'select-refreshed-access'
  )
  assert.equal(getCompany().settings.googleCalendar.refreshToken, 'refresh')
  assert.equal(getCompany().settings.googleCalendar.calendarId, 'cal-1')
})

test('OAuth scopes are limited to event writes, calendar list reads and email identity', () => {
  assert.deepEqual(PARTY_GOOGLE_CALENDAR_OAUTH_SCOPES, [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ])
})

test('disconnect clears credentials and connection metadata', async () => {
  const { core, getCompany } = setup()
  await core.disconnect({ companyId: 'company-1' })
  const saved = getCompany().settings.googleCalendar
  assert.equal(saved.accessToken, '')
  assert.equal(saved.refreshToken, '')
  assert.equal(saved.calendarId, '')
  assert.equal(saved.enabled, false)
})

test('nonce cookie name is company-specific and header-safe', () => {
  assert.equal(getPartyGoogleCalendarNonceCookieName('company-1'), 'party_gcal_nonce_company-1')
  assert.throws(() => getPartyGoogleCalendarNonceCookieName('../bad'))
  assert.deepEqual(
    getPartyGoogleCalendarNonceCookieNames([
      { name: 'session' },
      { name: 'party_gcal_nonce_company-1' },
      { name: 'party_gcal_nonce_company-2' },
    ]),
    ['party_gcal_nonce_company-1', 'party_gcal_nonce_company-2']
  )
})
