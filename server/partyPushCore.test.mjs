import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyTestPushPayload,
  normalizePartyPushSubscriptionPayload,
} from './partyPushCore.js'

test('normalizePartyPushSubscriptionPayload accepts browser subscription shape', () => {
  const result = normalizePartyPushSubscriptionPayload({
    endpoint: 'https://push.example.test/abc',
    keys: {
      p256dh: 'p256',
      auth: 'auth',
    },
  })

  assert.deepEqual(result, {
    endpoint: 'https://push.example.test/abc',
    keys: {
      p256dh: 'p256',
      auth: 'auth',
    },
  })
})

test('normalizePartyPushSubscriptionPayload rejects incomplete subscriptions', () => {
  assert.equal(
    normalizePartyPushSubscriptionPayload({
      endpoint: 'https://push.example.test/abc',
      keys: { p256dh: 'p256' },
    }),
    null
  )
})

test('buildPartyTestPushPayload returns company-scoped notification payload', () => {
  const payload = buildPartyTestPushPayload({
    companyId: 'company-1',
    companyTitle: 'Праздник 24',
  })

  assert.equal(payload.title, 'PartyCRM')
  assert.equal(payload.data.type, 'party_test')
  assert.equal(payload.data.companyId, 'company-1')
  assert.equal(payload.data.url, '/company/settings/notifications')
  assert.match(payload.body, /Праздник 24/)
})
