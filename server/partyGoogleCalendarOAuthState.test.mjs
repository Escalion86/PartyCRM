import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterEach, test } from 'node:test'

import oauthState from './partyGoogleCalendarOAuthState.js'

const {
  createPartyGoogleCalendarOAuthState,
  verifyPartyGoogleCalendarOAuthState,
  resolvePartyGoogleCalendarOAuthStateSecret,
} = oauthState

const secret = 'test-secret-with-enough-entropy'
const now = 1_800_000_000_000
const validInput = {
  companyId: 'company-1',
  userId: 'user-1',
  redirectPath: '/company/settings/integrations',
  nonce: 'nonce-1',
}

const signPayload = (payload) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
  return `${encodedPayload}.${signature}`
}

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  LOGIN: process.env.LOGIN,
  PASSWORD: process.env.PASSWORD,
}

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('creates and verifies a signed state with the complete payload', () => {
  const state = createPartyGoogleCalendarOAuthState(validInput, {
    secret,
    now: () => now,
  })

  assert.match(state, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.deepEqual(
    verifyPartyGoogleCalendarOAuthState(state, {
      secret,
      now: () => now + 1,
    }),
    { ...validInput, expiresAt: now + 10 * 60 * 1000 }
  )
})

test('supports a shorter TTL but rejects TTL above ten minutes', () => {
  const state = createPartyGoogleCalendarOAuthState(validInput, {
    secret,
    now: () => now,
    ttlMs: 60_000,
  })

  assert.equal(
    verifyPartyGoogleCalendarOAuthState(state, { secret, now: () => now }).expiresAt,
    now + 60_000
  )
  assert.throws(
    () =>
      createPartyGoogleCalendarOAuthState(validInput, {
        secret,
        now: () => now,
        ttlMs: 600_001,
      }),
    /oauth state/i
  )
})

test('rejects a correctly signed state whose remaining TTL exceeds ten minutes', () => {
  const state = signPayload({
    ...validInput,
    expiresAt: now + 10 * 60 * 1000 + 1,
  })

  assert.throws(
    () => verifyPartyGoogleCalendarOAuthState(state, { secret, now: () => now }),
    /oauth state/i
  )
})

test('rejects a correctly signed state longer than 4096 characters', () => {
  const state = signPayload({
    ...validInput,
    expiresAt: now + 60_000,
    padding: 'a'.repeat(4096),
  })
  assert.ok(state.length > 4096)

  assert.throws(
    () => verifyPartyGoogleCalendarOAuthState(state, { secret, now: () => now }),
    /oauth state/i
  )
})

test('rejects redirect paths outside the exact allowlist', () => {
  for (const redirectPath of [
    'https://evil.example/company/settings/integrations',
    '//evil.example/company/settings/integrations',
    '/company/settings',
    '/company/settings/integrations/other',
  ]) {
    assert.throws(
      () =>
        createPartyGoogleCalendarOAuthState(
          { ...validInput, redirectPath },
          { secret, now: () => now }
        ),
      /oauth state/i
    )
  }
})

test('rejects tampering, a wrong secret, expiry and malformed state without leaking payload', () => {
  const state = createPartyGoogleCalendarOAuthState(validInput, {
    secret,
    now: () => now,
  })
  const [payload, signature] = state.split('.')
  const cases = [
    `${payload.slice(0, -1)}A.${signature}`,
    state,
    state,
    'not-a-valid-state',
  ]
  const options = [
    { secret, now: () => now },
    { secret: 'wrong-secret', now: () => now },
    { secret, now: () => now + 600_001 },
    { secret, now: () => now },
  ]

  cases.forEach((candidate, index) => {
    assert.throws(
      () => verifyPartyGoogleCalendarOAuthState(candidate, options[index]),
      (error) => {
        assert.match(error.message, /oauth state/i)
        assert.doesNotMatch(error.message, /company-1|user-1|nonce-1/)
        return true
      }
    )
  })
})

test('rejects signed payloads with missing or invalid required fields', () => {
  for (const field of ['companyId', 'userId', 'redirectPath', 'nonce', 'expiresAt']) {
    const decoded = { ...validInput, expiresAt: now + 60_000 }
    delete decoded[field]

    assert.throws(
      () => verifyPartyGoogleCalendarOAuthState(signPayload(decoded), { secret, now: () => now }),
      /oauth state/i
    )
  }


  assert.throws(
    () =>
      verifyPartyGoogleCalendarOAuthState(
        signPayload({ ...validInput, expiresAt: 'soon' }),
        { secret, now: () => now }
      ),
    /oauth state/i
  )
})

test('resolves NEXTAUTH_SECRET in production', () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXTAUTH_SECRET = ' primary-secret '
  process.env.LOGIN = 'ignored'
  process.env.PASSWORD = 'ignored'
  assert.equal(resolvePartyGoogleCalendarOAuthStateSecret(), 'primary-secret')
})

test('resolves non-empty LOGIN:PASSWORD fallback in development', () => {
  process.env.NODE_ENV = 'development'
  delete process.env.NEXTAUTH_SECRET
  process.env.LOGIN = ' login '
  process.env.PASSWORD = ' password '
  assert.equal(resolvePartyGoogleCalendarOAuthStateSecret(), 'login:password')
})

test('rejects LOGIN:PASSWORD fallback in production with a safe configuration error', () => {
  process.env.NODE_ENV = 'production'
  delete process.env.NEXTAUTH_SECRET
  process.env.LOGIN = 'login'
  process.env.PASSWORD = 'password'

  assert.throws(
    () => resolvePartyGoogleCalendarOAuthStateSecret(),
    (error) => {
      assert.match(error.message, /oauth state configuration/i)
      assert.doesNotMatch(error.message, /login|password|NEXTAUTH_SECRET/)
      return true
    }
  )
})

test('throws a safe configuration error when no production secret is configured', () => {
  delete process.env.NEXTAUTH_SECRET
  process.env.LOGIN = ' '
  process.env.PASSWORD = ''

  assert.throws(
    () => resolvePartyGoogleCalendarOAuthStateSecret(),
    (error) => {
      assert.match(error.message, /oauth state configuration/i)
      assert.doesNotMatch(error.message, /LOGIN|PASSWORD|NEXTAUTH_SECRET/)
      return true
    }
  )
})
