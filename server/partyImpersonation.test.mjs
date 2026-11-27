import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { compileFunction } from 'node:vm'
import * as constants from '../helpers/partyImpersonationConstants.js'
import * as tokenHelpers from './partyImpersonationToken.mjs'
import { isPartySameOriginRequest } from './partySameOrigin.mjs'

const ACTOR_ID = 'a'.repeat(24)
const TARGET_ID = 'b'.repeat(24)
const SECRET = 'party-impersonation-test-secret'
const SESSION_COOKIE = 'partycrm_session'
const { PARTY_IMPERSONATION_COOKIE, PARTY_IMPERSONATION_UI_COOKIE } = constants

const load = async (file, dependencies, exports) => {
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
    .replace(/^export /gm, '')
  return compileFunction(
    `${source}\nreturn { ${exports} }`,
    Object.keys(dependencies)
  )(...Object.values(dependencies))
}

const request = (method, body, headers = {}) =>
  new Request('http://127.0.0.1:3007/api/party/auth/impersonation', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      host: 'partycrm.example',
      origin: 'https://partycrm.example',
      'sec-fetch-site': 'same-origin',
      'x-forwarded-proto': 'https',
      ...headers,
    },
  })

const setup = async () => {
  const cookieJar = new Map()
  const actor = { _id: ACTOR_ID, role: 'dev', status: 'active' }
  const target = {
    _id: TARGET_ID,
    role: 'user',
    status: 'active',
    firstName: 'Тест',
    secondName: 'Пользователь',
    interfaceRoles: ['performer'],
  }
  const auth = await load('./partyAuth.js', {
    crypto,
    ...constants,
    ...tokenHelpers,
    process: { env: { AUTH_SECRET: SECRET, NODE_ENV: 'production' } },
    cookies: async () => cookieJar,
    getPartyUserModel: async () => ({
      findOne: ({ _id, status }, projection) => {
        if (typeof status === 'string') assert.deepEqual(projection, { password: 0 })
        return {
          lean: async () =>
            [actor, target].find((user) =>
              user._id === _id.toLowerCase() &&
              (typeof status === 'string' ? user.status === status : user.status !== status.$ne)
            ) || null,
        }
      },
    }),
  }, [
    'createPartySessionToken',
    'setPartySessionCookie',
    'clearPartySessionCookie',
    'getPartySessionUser',
    'getPartyOriginalSession',
    'canStartPartyImpersonation',
    'getPartyImpersonationStatus',
    'getPartyImpersonationTarget',
    'setPartyImpersonationCookie',
    'clearPartyImpersonationCookie',
  ].join(', '))

  const json = (body, options) => {
    const changes = []
    return {
      body,
      options,
      changes,
      cookies: {
        set(name, value, attributes) {
          changes.push({ name, value, attributes })
        },
      },
    }
  }
  const apply = (result) => {
    for (const { name, value, attributes } of result.changes) {
      if (attributes.maxAge === 0) cookieJar.delete(name)
      else cookieJar.set(name, { value })
    }
    return result
  }
  const route = await load('../app/api/party/auth/impersonation/route.js', {
    ...auth,
    ...constants,
    ...tokenHelpers,
    isPartySameOriginRequest,
    getPartyAuthInfrastructureError: () => ({ status: 500, code: 'test' }),
    NextResponse: { json },
    console: { info() {}, error() {} },
  }, 'GET, POST, DELETE')
  const login = () => apply(auth.setPartySessionCookie(json(), actor))
  login()
  return { actor, target, cookieJar, auth, route, json, apply, login }
}

test('starts with the target identity and returns to the original signed-in account', async () => {
  const { cookieJar, route, auth, apply, target } = await setup()
  const originalCookie = cookieJar.get(SESSION_COOKIE)
  const started = apply(await route.POST(request('POST', { userId: TARGET_ID })))
  assert.equal(started.body.data.redirectTo, '/party/entry')
  assert.equal(started.options.headers['Cache-Control'], 'no-store')
  assert.deepEqual(started.changes.map(({ name, attributes }) => [
    name, attributes.httpOnly, attributes.sameSite, attributes.secure,
  ]), [
    [PARTY_IMPERSONATION_COOKIE, true, 'lax', true],
    [PARTY_IMPERSONATION_UI_COOKIE, false, 'lax', true],
  ])
  assert.match(cookieJar.get(PARTY_IMPERSONATION_UI_COOKIE).value, /^[a-f0-9-]{36}$/)
  assert.equal(cookieJar.get(SESSION_COOKIE), originalCookie)
  assert.equal((await auth.getPartySessionUser())._id, TARGET_ID)
  assert.equal((await auth.getPartySessionUser()).role, target.role)
  assert.deepEqual((await route.GET()).body.data, {
    active: true,
    userName: 'Тест Пользователь',
  })

  const ended = apply(await route.DELETE(request('DELETE')))
  assert.equal(ended.body.data.redirectTo, constants.PARTY_IMPERSONATION_RETURN_PATH)
  assert.equal(cookieJar.get(SESSION_COOKIE), originalCookie)
  assert.equal((await auth.getPartySessionUser())._id, ACTOR_ID)
  assert.deepEqual((await route.GET()).body.data, { active: false })
})

test('checks origin, authentication, current role, target state and nesting', async () => {
  const { actor, target, route, cookieJar, apply, login, auth, json } = await setup()
  const start = (userId = TARGET_ID, headers) => route.POST(request('POST', { userId }, headers))
  assert.equal((await start(TARGET_ID, { origin: 'https://other.partycrm.example' })).options.status, 403)
  assert.equal((await start(ACTOR_ID.toUpperCase())).options.status, 400)
  assert.equal((await start('invalid')).options.status, 400)

  actor.role = 'admin'
  assert.equal((await start()).options.status, 403)
  actor.role = 'dev'
  actor.status = 'blocked'
  assert.equal((await start()).options.status, 403)
  actor.status = 'active'
  for (const status of ['archived', 'blocked']) {
    target.status = status
    assert.equal((await start()).options.status, 404)
  }
  target.status = 'active'
  target.role = 'dev'
  apply(await start())
  assert.equal((await auth.getPartySessionUser())._id, TARGET_ID)
  assert.equal((await start()).options.status, 409)
  assert.equal((await route.DELETE(request('DELETE', undefined, {
    'sec-fetch-site': 'cross-site',
  }))).options.status, 403)
  assert.equal(cookieJar.has(PARTY_IMPERSONATION_COOKIE), true)

  login()
  assert.equal(cookieJar.has(PARTY_IMPERSONATION_COOKIE), false)
  assert.equal(cookieJar.has(PARTY_IMPERSONATION_UI_COOKIE), false)
  apply(await start())
  apply(auth.clearPartySessionCookie(json()))
  assert.equal(cookieJar.size, 0)
  assert.equal((await start()).options.status, 401)
})

test('keeps the target identity beyond the former 30-minute limit', async (t) => {
  const now = Date.now()
  t.mock.timers.enable({ apis: ['Date'], now })
  const { route, auth, apply } = await setup()
  apply(await route.POST(request('POST', { userId: TARGET_ID })))

  t.mock.timers.setTime(now + 7 * 24 * 60 * 60 * 1000)

  assert.equal((await auth.getPartySessionUser())._id, TARGET_ID)
  assert.deepEqual((await route.GET()).body.data, {
    active: true,
    userName: 'Тест Пользователь',
  })
})

test('fails closed for forged, orphaned and revoked impersonation sessions', async () => {
  const { actor, target, cookieJar, route, auth, apply } = await setup()
  apply(await route.POST(request('POST', { userId: TARGET_ID })))
  const originalView = cookieJar.get(PARTY_IMPERSONATION_COOKIE)
  const sessionToken = cookieJar.get(SESSION_COOKIE).value
  const assertUnavailable = async () => {
    assert.equal(await auth.getPartySessionUser(), null)
    assert.deepEqual((await route.GET()).body.data, {
      active: true,
      unavailable: true,
    })
  }
  for (const value of ['forged', '', auth.createPartySessionToken(actor)]) {
    cookieJar.set(PARTY_IMPERSONATION_COOKIE, { value })
    await assertUnavailable()
  }
  cookieJar.set(PARTY_IMPERSONATION_COOKIE, originalView)
  cookieJar.set(SESSION_COOKIE, { value: auth.createPartySessionToken({ ...actor, phone: '123' }) })
  await assertUnavailable()
  cookieJar.delete(SESSION_COOKIE)
  await assertUnavailable()
  cookieJar.set(SESSION_COOKIE, { value: sessionToken })
  target.status = 'blocked'
  await assertUnavailable()
  target.status = 'active'
  actor.status = 'blocked'
  await assertUnavailable()
  actor.status = 'active'
  actor.role = 'support'
  await assertUnavailable()
  assert.equal(apply(await route.DELETE(request('DELETE'))).body.data.redirectTo, '/party/entry')
  assert.equal((await auth.getPartySessionUser())._id, ACTOR_ID)
})

test('rejects legacy read-only cookies and lets the developer return and start again', async () => {
  const { cookieJar, route, auth, apply } = await setup()
  const originalCookie = cookieJar.get(SESSION_COOKIE)
  const sessionDigest = crypto.createHash('sha256')
    .update(originalCookie.value)
    .digest('base64url')
  const legacyPayload = Buffer.from(JSON.stringify({
    actorId: ACTOR_ID,
    targetId: TARGET_ID,
    sessionDigest,
    expiresAt: Date.now() + 60 * 1000,
  })).toString('base64url')
  const legacySignature = crypto.createHmac('sha256', SECRET)
    .update(`partycrm-impersonation:v1:${legacyPayload}`)
    .digest('base64url')
  cookieJar.set(PARTY_IMPERSONATION_COOKIE, { value: `${legacyPayload}.${legacySignature}` })

  assert.equal(await auth.getPartySessionUser(), null)
  assert.deepEqual((await route.GET()).body.data, { active: true, unavailable: true })
  const ended = apply(await route.DELETE(request('DELETE')))
  assert.equal(ended.body.data.redirectTo, constants.PARTY_IMPERSONATION_RETURN_PATH)
  assert.equal(cookieJar.get(SESSION_COOKIE), originalCookie)
  assert.equal((await auth.getPartySessionUser())._id, ACTOR_ID)

  apply(await route.POST(request('POST', { userId: TARGET_ID })))
  assert.equal((await auth.getPartySessionUser())._id, TARGET_ID)
})

test('matches the browser origin to the external host and HTTPS scheme', () => {
  assert.equal(isPartySameOriginRequest(request('POST')), true)
  assert.equal(isPartySameOriginRequest(new Request('http://localhost:3000/test', {
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
  })), true)
  for (const headers of [
    { origin: 'null' },
    { origin: '' },
    { origin: 'http://partycrm.example' },
    { origin: 'https://partycrm.example:8443' },
    { host: 'evil.example@partycrm.example' },
    { 'sec-fetch-site': 'same-site' },
    { 'x-forwarded-proto': 'https, http' },
  ]) {
    assert.equal(isPartySameOriginRequest(request('POST', undefined, headers)), false)
  }
})
