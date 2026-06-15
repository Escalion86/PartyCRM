import assert from 'node:assert/strict'
import test from 'node:test'

import { getPartyGoogleCalendarPublicOrigin } from './partyGoogleCalendarRedirect.js'

test('uses the configured public PartyCRM domain behind a reverse proxy', () => {
  const origin = getPartyGoogleCalendarPublicOrigin({
    env: {
      NODE_ENV: 'production',
      DOMAIN: 'https://partycrm.ru',
      GOOGLE_OAUTH_REDIRECT_URI:
        'https://partycrm.ru/api/party/google-calendar/callback',
    },
    requestUrl:
      'https://localhost:3007/api/party/google-calendar/callback?code=secret',
  })

  assert.equal(origin, 'https://partycrm.ru')
})

test('uses the configured OAuth callback origin when DOMAIN is absent', () => {
  const origin = getPartyGoogleCalendarPublicOrigin({
    env: {
      NODE_ENV: 'production',
      PARTY_GOOGLE_OAUTH_REDIRECT_URI:
        'https://partycrm.ru/api/party/google-calendar/callback',
    },
    requestUrl:
      'https://localhost:3007/api/party/google-calendar/callback?code=secret',
  })

  assert.equal(origin, 'https://partycrm.ru')
})

test('never exposes an internal localhost origin in production', () => {
  const origin = getPartyGoogleCalendarPublicOrigin({
    env: { NODE_ENV: 'production' },
    requestUrl:
      'https://localhost:3007/api/party/google-calendar/callback?code=secret',
  })

  assert.equal(origin, 'https://partycrm.ru')
})

test('allows request origin fallback during local development', () => {
  const origin = getPartyGoogleCalendarPublicOrigin({
    env: { NODE_ENV: 'development' },
    requestUrl:
      'http://localhost:3107/api/party/google-calendar/callback?code=secret',
  })

  assert.equal(origin, 'http://localhost:3107')
})
