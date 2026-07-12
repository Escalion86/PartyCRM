import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPartyHealthPayload,
  canReadPartyHealthDetails,
} from './partyHealthCore.js'

test('party health details require a configured matching secret', () => {
  assert.equal(
    canReadPartyHealthDetails({ requestToken: 'secret', secret: 'secret' }),
    true
  )
  assert.equal(
    canReadPartyHealthDetails({ requestToken: 'wrong', secret: 'secret' }),
    false
  )
  assert.equal(
    canReadPartyHealthDetails({ requestToken: '', secret: '' }),
    false
  )
})

test('public party health payload exposes status without database metadata', () => {
  const payload = buildPartyHealthPayload({
    product: 'partycrm',
    databaseStatus: 'ready',
    latencyMs: 12.6,
  })

  assert.equal(payload.success, true)
  assert.equal(payload.database.status, 'ready')
  assert.equal(payload.database.latencyMs, 13)
  assert.equal(Object.hasOwn(payload, 'details'), false)
})

test('party health payload includes diagnostics only when supplied', () => {
  const payload = buildPartyHealthPayload({
    product: 'partycrm',
    databaseStatus: 'ready',
    latencyMs: 2,
    details: { readyState: 1, collections: { orders: 3 } },
  })

  assert.deepEqual(payload.details, {
    readyState: 1,
    collections: { orders: 3 },
  })
})
