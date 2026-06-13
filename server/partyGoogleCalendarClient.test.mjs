import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARTY_GOOGLE_CALENDAR_ERROR_CODES,
  createPartyGoogleCalendarClient,
  isPartyGoogleCalendarEventMissingError,
  isPartyGoogleCalendarReconnectRequiredError,
} from './partyGoogleCalendarClient.js'

const settings = {
  accessToken: ' access-token ',
  refreshToken: ' refresh-token ',
  tokenType: ' Bearer ',
  scope: ' calendar ',
  expiryDate: 1_800_000_000_000,
  connectedEmail: ' OWNER@EXAMPLE.COM ',
}

const env = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  DOMAIN: 'https://party.example.com/',
}

const createHarness = ({ calendarOverrides, onCredentials } = {}) => {
  const calls = { oauthFactory: [], setCredentials: [], calendarFactory: [] }
  const listeners = new Map()
  const oauth = {
    setCredentials(credentials) {
      calls.setCredentials.push(credentials)
    },
    on(event, handler) {
      listeners.set(event, handler)
    },
  }
  const calendar = {
    calendarList: {
      list: async () => ({ data: { items: [] } }),
    },
    events: {
      insert: async (args) => ({ data: args }),
      update: async (args) => ({ data: args }),
      delete: async (args) => ({ data: args }),
    },
    ...calendarOverrides,
  }
  const client = createPartyGoogleCalendarClient(settings, {
    env,
    onCredentials,
    oauthFactory: (...args) => {
      calls.oauthFactory.push(args)
      return oauth
    },
    calendarFactory: (args) => {
      calls.calendarFactory.push(args)
      return calendar
    },
  })
  return { calls, client, listeners }
}

test('creates OAuth client with normalized Party redirect URI and credentials', () => {
  const { calls, client } = createHarness()

  assert.ok(client)
  assert.deepEqual(calls.oauthFactory, [
    [
      'client-id',
      'client-secret',
      'https://party.example.com/api/party/google-calendar/callback',
    ],
  ])
  assert.deepEqual(calls.setCredentials, [
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      scope: 'calendar',
      expiry_date: 1_800_000_000_000,
    },
  ])
  assert.equal(calls.calendarFactory[0].version, 'v3')
})

test('uses valid explicit Party redirect URI from env', () => {
  const oauthCalls = []
  createPartyGoogleCalendarClient(settings, {
    env: {
      ...env,
      PARTY_GOOGLE_OAUTH_REDIRECT_URI:
        'https://oauth.example/api/party/google-calendar/callback',
    },
    oauthFactory: (...args) => {
      oauthCalls.push(args)
      return { setCredentials() {}, on() {} }
    },
    calendarFactory: () => ({}),
  })
  assert.equal(
    oauthCalls[0][2],
    'https://oauth.example/api/party/google-calendar/callback'
  )
})

test('supports shared Google OAuth redirect URI env', () => {
  const oauthCalls = []
  createPartyGoogleCalendarClient(settings, {
    env: {
      ...env,
      GOOGLE_OAUTH_REDIRECT_URI:
        'https://shared.example/api/party/google-calendar/callback',
    },
    oauthFactory: (...args) => {
      oauthCalls.push(args)
      return { setCredentials() {}, on() {} }
    },
    calendarFactory: () => ({}),
  })
  assert.equal(
    oauthCalls[0][2],
    'https://shared.example/api/party/google-calendar/callback'
  )
})

test('normalizes schemeless DOMAIN to https in production', () => {
  const oauthCalls = []
  createPartyGoogleCalendarClient(settings, {
    env: { ...env, NODE_ENV: 'production', DOMAIN: 'party.example.com/' },
    oauthFactory: (...args) => {
      oauthCalls.push(args)
      return { setCredentials() {}, on() {} }
    },
    calendarFactory: () => ({}),
  })
  assert.equal(
    oauthCalls[0][2],
    'https://party.example.com/api/party/google-calendar/callback'
  )
})

test('allows http redirect only for localhost outside production', () => {
  const oauthCalls = []
  const client = createPartyGoogleCalendarClient(settings, {
    env: { ...env, NODE_ENV: 'test', DOMAIN: 'localhost:3000' },
    oauthFactory: (...args) => {
      oauthCalls.push(args)
      return { setCredentials() {}, on() {} }
    },
    calendarFactory: () => ({}),
  })
  assert.ok(client)
  assert.equal(
    oauthCalls[0][2],
    'http://localhost:3000/api/party/google-calendar/callback'
  )
})

test('rejects unsafe or malformed redirect URIs', () => {
  const invalidUris = [
    'http://party.example.com/api/party/google-calendar/callback',
    'https://party.example.com/wrong',
    'https://user:password@party.example.com/api/party/google-calendar/callback',
    'https://party.example.com/api/party/google-calendar/callback#token',
  ]
  for (const redirectUri of invalidUris) {
    assert.equal(
      createPartyGoogleCalendarClient(settings, {
        env: {
          ...env,
          NODE_ENV: 'production',
          PARTY_GOOGLE_OAUTH_REDIRECT_URI: redirectUri,
        },
        oauthFactory: () => assert.fail('oauthFactory must not be called'),
        calendarFactory: () => assert.fail('calendarFactory must not be called'),
      }),
      null
    )
  }
})

test('returns null when required OAuth env is missing', () => {
  assert.equal(
    createPartyGoogleCalendarClient(settings, {
      env: { GOOGLE_OAUTH_CLIENT_ID: 'client-id', DOMAIN: 'example.com' },
      oauthFactory: () => assert.fail('oauthFactory must not be called'),
      calendarFactory: () => assert.fail('calendarFactory must not be called'),
    }),
    null
  )
})

test('forwards refreshed credentials without dropping refresh token', async () => {
  const received = []
  const { client, listeners } = createHarness({
    onCredentials: async (credentials) => received.push(credentials),
  })

  listeners.get('tokens')({ access_token: 'new-token', expiry_date: 42 })
  await client.flushCredentialsUpdates()

  assert.deepEqual(received, [
    {
      access_token: 'new-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      scope: 'calendar',
      expiry_date: 42,
    },
  ])
})

test('serializes refresh persistence and merges from latest snapshot', async () => {
  const saved = []
  let releaseFirst
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const { client, listeners } = createHarness({
    onCredentials: async (credentials) => {
      saved.push(credentials)
      if (saved.length === 1) await firstPending
    },
  })

  listeners.get('tokens')({ access_token: 'first-token', expiry_date: 10 })
  listeners.get('tokens')({ scope: 'updated-scope', expiry_date: 20 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saved.length, 1)
  releaseFirst()
  await client.flushCredentialsUpdates()

  assert.deepEqual(saved, [
    {
      access_token: 'first-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      scope: 'calendar',
      expiry_date: 10,
    },
    {
      access_token: 'first-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      scope: 'updated-scope',
      expiry_date: 20,
    },
  ])
})

test('captures onCredentials rejection without unhandled rejection or token leakage', async () => {
  const secret = 'secret-refresh-token'
  const { client, listeners } = createHarness({
    onCredentials: async () => {
      throw new Error(`database failed ${secret}`)
    },
  })

  listeners.get('tokens')({ refresh_token: secret })

  await assert.rejects(client.flushCredentialsUpdates(), (error) => {
    assert.equal(error.code, PARTY_GOOGLE_CALENDAR_ERROR_CODES.CREDENTIALS_SAVE_FAILED)
    assert.equal(error.message, 'credentials_save_failed')
    assert.equal(error.cause, undefined)
    assert.equal(JSON.stringify(error).includes(secret), false)
    assert.equal(error.stack.includes(secret), false)
    return true
  })
})

test('listCalendars returns only owner and writer calendars', async () => {
  const { client } = createHarness({
    calendarOverrides: {
      calendarList: {
        list: async () => ({
          data: {
            items: [
              { id: '1', summary: 'Main', primary: true, accessRole: 'owner' },
              { id: '2', summary: 'Team', primary: false, accessRole: 'writer' },
              { id: '3', summary: 'Read', accessRole: 'reader' },
            ],
          },
        }),
      },
    },
  })

  assert.deepEqual(await client.listCalendars(), [
    { id: '1', summary: 'Main', name: 'Main', primary: true, accessRole: 'owner' },
    { id: '2', summary: 'Team', name: 'Team', primary: false, accessRole: 'writer' },
  ])
})

test('CRUD methods pass Google Calendar event arguments unchanged', async () => {
  const calls = []
  const events = Object.fromEntries(
    ['insert', 'update', 'delete'].map((method) => [
      method,
      async (args) => {
        calls.push([method, args])
        return { data: { method } }
      },
    ])
  )
  const { client } = createHarness({ calendarOverrides: { events } })

  assert.deepEqual(await client.insertEvent('calendar', { summary: 'New' }), {
    method: 'insert',
  })
  assert.deepEqual(
    await client.updateEvent('calendar', 'event', { summary: 'Updated' }),
    { method: 'update' }
  )
  assert.deepEqual(await client.deleteEvent('calendar', 'event'), {
    method: 'delete',
  })
  assert.deepEqual(calls, [
    ['insert', { calendarId: 'calendar', requestBody: { summary: 'New' } }],
    [
      'update',
      { calendarId: 'calendar', eventId: 'event', requestBody: { summary: 'Updated' } },
    ],
    ['delete', { calendarId: 'calendar', eventId: 'event' }],
  ])
})

test('getConnectedEmail returns normalized company email', () => {
  assert.equal(createHarness().client.getConnectedEmail(), 'owner@example.com')
})

test('classifies event 404 without swallowing delete error', async () => {
  const missing = Object.assign(new Error('secret upstream details'), {
    code: 'ERR_BAD_REQUEST',
    config: { headers: { authorization: 'Bearer secret' } },
    response: { status: 404, headers: { private: 'secret' } },
  })
  const { client } = createHarness({
    calendarOverrides: { events: { delete: async () => Promise.reject(missing) } },
  })

  await assert.rejects(client.deleteEvent('calendar', 'event'), (error) => {
    assert.equal(error.code, PARTY_GOOGLE_CALENDAR_ERROR_CODES.EVENT_MISSING)
    assert.equal(error.message, 'event_missing')
    assert.equal(error.status, 404)
    assert.equal(error.cause, undefined)
    assert.equal(error.config, undefined)
    assert.equal(error.response, undefined)
    assert.equal(JSON.stringify(error).includes('secret'), false)
    assert.equal(isPartyGoogleCalendarEventMissingError(error), true)
    return true
  })
})

test('classifies invalid_grant as reconnect_required', async () => {
  const invalidGrant = Object.assign(new Error('token rejected secret-token'), {
    config: { headers: { authorization: 'Bearer secret-token' } },
    response: { data: { error: 'invalid_grant' } },
  })
  const { client } = createHarness({
    calendarOverrides: {
      events: { insert: async () => Promise.reject(invalidGrant) },
    },
  })

  await assert.rejects(client.insertEvent('calendar', {}), (error) => {
    assert.equal(error.code, PARTY_GOOGLE_CALENDAR_ERROR_CODES.RECONNECT_REQUIRED)
    assert.equal(error.message, 'reconnect_required')
    assert.equal(error.cause, undefined)
    assert.equal(error.config, undefined)
    assert.equal(error.response, undefined)
    assert.equal(JSON.stringify(error).includes('secret-token'), false)
    assert.equal(isPartyGoogleCalendarReconnectRequiredError(error), true)
    return true
  })
})

test('does not reclassify unrelated Google errors', async () => {
  const failure = Object.assign(new Error('quota'), { code: 429 })
  const { client } = createHarness({
    calendarOverrides: { events: { update: async () => Promise.reject(failure) } },
  })

  await assert.rejects(client.updateEvent('calendar', 'event', {}), (error) => {
    assert.equal(error, failure)
    return true
  })
})
