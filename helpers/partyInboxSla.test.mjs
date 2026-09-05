import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePartyInboxResponseDueAt, getPartyInboxSlaView, isPartyInboxMeaningfulContent } from './partyInboxSla.js'

const zone = 'Asia/Krasnoyarsk'
const cases = [
  ['Пн 08:50', '2026-09-07T01:50:00.000Z', '2026-09-07T02:30:00.000Z'],
  ['Пн 09:00', '2026-09-07T02:00:00.000Z', '2026-09-07T02:15:00.000Z'],
  ['Сб 09:50', '2026-09-05T02:50:00.000Z', '2026-09-05T03:30:00.000Z'],
  ['Сб 10:00', '2026-09-05T03:00:00.000Z', '2026-09-05T03:15:00.000Z'],
  ['Пн 20:00', '2026-09-07T13:00:00.000Z', '2026-09-08T02:30:00.000Z'],
  ['Пн 19:55', '2026-09-07T12:55:00.000Z', '2026-09-07T13:10:00.000Z'],
]
for (const [name, incoming, expected] of cases) test(name, () => assert.equal(calculatePartyInboxResponseDueAt(incoming, zone).toISOString(), expected))

test('invalid timezone safely falls back and SLA remains open only until a response', () => {
  assert.doesNotThrow(() => calculatePartyInboxResponseDueAt('2026-09-07T02:00:00Z', 'Bad/Zone'))
  assert.deepEqual(getPartyInboxSlaView({ responseDueAt: '2026-09-07T02:15:00Z' }, '2026-09-07T02:16:00Z'), { responseDueAt: new Date('2026-09-07T02:15:00Z'), overdue: true, slaOpen: true })
  assert.equal(getPartyInboxSlaView({ responseDueAt: '2026-09-07T02:15:00Z', respondedAt: new Date() }).slaOpen, false)
})

test('empty delivery events do not start or close a meaningful SLA', () => {
  assert.equal(isPartyInboxMeaningfulContent({ direction: 'incoming', text: '  ' }), false)
  assert.equal(isPartyInboxMeaningfulContent({ direction: 'incoming', attachments: [{}] }), true)
  assert.equal(isPartyInboxMeaningfulContent({ direction: 'incoming', call: true }), true)
  assert.equal(isPartyInboxMeaningfulContent({ direction: 'outgoing', text: 'Ответ' }), true)
})
