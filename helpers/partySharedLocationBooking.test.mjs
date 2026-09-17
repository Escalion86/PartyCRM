import test from 'node:test'
import assert from 'node:assert/strict'
import { sharePartyLocationBooking } from './partySharedLocationBooking.js'

const part = (overrides = {}) => ({
  partyEventGroupId: 'holiday-a',
  sharedLocationBooking: true,
  ...overrides,
})

test('explicit shared booking exempts location overlaps within the same group', () => {
  assert.equal(sharePartyLocationBooking(part(), part()), true)
  assert.equal(sharePartyLocationBooking(part(), part({ partyEventGroupId: 'holiday-b' })), false)
})

test('linking alone and stale one-sided enablement do not exempt conflicts', () => {
  for (const flag of [false, undefined, null, 'true', 1]) {
    assert.equal(sharePartyLocationBooking(part({ sharedLocationBooking: flag }), part()), false)
    assert.equal(sharePartyLocationBooking(part(), part({ sharedLocationBooking: flag })), false)
  }
})

test('missing group identifiers never create an exemption for unrelated orders', () => {
  for (const id of ['', null, undefined]) {
    assert.equal(sharePartyLocationBooking(part({ partyEventGroupId: id }), part({ partyEventGroupId: id })), false)
    assert.equal(sharePartyLocationBooking(part(), part({ partyEventGroupId: id })), false)
  }
  assert.equal(sharePartyLocationBooking(null, part()), false)
  assert.equal(sharePartyLocationBooking(part(), undefined), false)
})
