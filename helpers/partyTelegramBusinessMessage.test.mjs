import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyTelegramBusinessMessageDirection,
  isPartyTelegramReplyWindowOpen,
} from './partyTelegramBusinessMessage.js'

test('recognizes incoming and outgoing Telegram Business messages', () => {
  assert.equal(getPartyTelegramBusinessMessageDirection({
    message: { from: { id: 101 }, chat: { id: 101 } },
    businessAccountUserId: '202',
  }), 'incoming')
  assert.equal(getPartyTelegramBusinessMessageDirection({
    message: { from: { id: 202 }, chat: { id: 101 } },
    businessAccountUserId: '',
  }), 'outgoing')
  assert.equal(getPartyTelegramBusinessMessageDirection({
    message: { from: { id: 303 }, chat: { id: 101 }, sender_business_bot: { id: 303 } },
    businessAccountUserId: '',
  }), 'outgoing')
})

test('enforces Telegram 24-hour reply window', () => {
  const now = Date.parse('2026-08-11T12:00:00.000Z')
  assert.equal(isPartyTelegramReplyWindowOpen('2026-08-10T12:00:01.000Z', now), true)
  assert.equal(isPartyTelegramReplyWindowOpen('2026-08-10T11:59:59.000Z', now), false)
  assert.equal(isPartyTelegramReplyWindowOpen(null, now), false)
})
