import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exchangePartyVkCode,
  fetchPartyVkUserInfo,
  getPartyVkIdConfig,
} from './partyVkIdAuth.mjs'

const ENV_KEYS = [
  'PARTY_VK_AUTH_ENABLED',
  'PARTY_VK_ID_APP_ID',
  'PARTY_VK_ID_CLIENT_SECRET',
  'PARTY_VK_ID_REDIRECT_URI',
  'NEXT_PUBLIC_PARTY_VK_ID_SCOPE',
]

const withEnv = async (values, callback) => {
  const snapshot = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  )
  try {
    ENV_KEYS.forEach((key) => delete process.env[key])
    Object.assign(process.env, values)
    return await callback()
  } finally {
    ENV_KEYS.forEach((key) => {
      if (snapshot[key] === undefined) delete process.env[key]
      else process.env[key] = snapshot[key]
    })
  }
}

test('PartyCRM VK ID config uses supplied application defaults and stays opt-in', async () => {
  await withEnv({}, () => {
    const config = getPartyVkIdConfig()
    assert.equal(config.appId, '54681802')
    assert.equal(config.redirectUri, 'https://partycrm.ru')
    assert.equal(config.scope, 'phone email')
    assert.equal(config.enabled, false)
  })
})

test('PartyCRM VK ID config enables only with explicit flag and server secret', async () => {
  await withEnv(
    {
      PARTY_VK_AUTH_ENABLED: 'true',
      PARTY_VK_ID_CLIENT_SECRET: 'test-secret',
    },
    () => assert.equal(getPartyVkIdConfig().enabled, true)
  )
})

test('VK user info is normalized without exposing the provider token', async () => {
  const originalFetch = global.fetch
  try {
    await withEnv(
      {
        PARTY_VK_AUTH_ENABLED: 'true',
        PARTY_VK_ID_CLIENT_SECRET: 'test-secret',
      },
      async () => {
        global.fetch = async (_url, options) => {
          assert.match(String(options.body), /access_token=provider-token/)
          return {
            ok: true,
            json: async () => ({
              user: {
                user_id: 12345,
                phone: '8 (913) 123-45-67',
                email: 'USER@EXAMPLE.COM',
                first_name: 'Иван',
                last_name: 'Иванов',
              },
            }),
          }
        }

        const response = await fetchPartyVkUserInfo({
          accessToken: 'provider-token',
        })
        assert.deepEqual(response, {
          success: true,
          data: {
            vkId: '12345',
            phone: '79131234567',
            email: 'user@example.com',
            firstName: 'Иван',
            secondName: 'Иванов',
          },
        })
        assert.doesNotMatch(JSON.stringify(response), /provider-token/)
      }
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('server code exchange rejects a mismatched VK state', async () => {
  const originalFetch = global.fetch
  try {
    await withEnv(
      {
        PARTY_VK_AUTH_ENABLED: 'true',
        PARTY_VK_ID_CLIENT_SECRET: 'test-secret',
      },
      async () => {
        global.fetch = async () => ({
          ok: true,
          json: async () => ({
            access_token: 'provider-token',
            state: 'another-state',
          }),
        })

        const response = await exchangePartyVkCode({
          code: 'code',
          deviceId: 'device',
          codeVerifier: 'verifier',
          state: 'expected-state',
        })
        assert.equal(response.success, false)
        assert.equal(response.data.error.type, 'VK_STATE_MISMATCH')
      }
    )
  } finally {
    global.fetch = originalFetch
  }
})
