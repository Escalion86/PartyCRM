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


test('custom hours, closed weekdays and local holiday overrides determine next opening', async () => {
  const { defaultPartyInboxSchedule } = await import('./partyInboxSchedule.js')
  const schedule = defaultPartyInboxSchedule()
  schedule.week[1] = { closed: false, opens: '11:15', closes: '17:45' }
  schedule.week[2].closed = true
  schedule.exceptions = [{ date: '2026-09-09', closed: true }, { date: '2026-09-10', closed: false, opens: '12:20', closes: '15:00' }]
  const due = (at) => calculatePartyInboxResponseDueAt(at, zone, schedule).toISOString()
  assert.equal(due('2026-09-07T04:14:59Z'), '2026-09-07T04:45:00.000Z')
  assert.equal(due('2026-09-07T04:15:00Z'), '2026-09-07T04:30:00.000Z')
  assert.equal(due('2026-09-07T10:45:00Z'), '2026-09-10T05:50:00.000Z')
  assert.equal(due('2026-09-08T18:00:00Z'), '2026-09-10T05:50:00.000Z')
  schedule.week[0].closed = true
  schedule.exceptions.push({ date: '2026-09-13', closed: false, opens: '08:30', closes: '12:00' })
  assert.equal(due('2026-09-13T01:30:00Z'), '2026-09-13T01:45:00.000Z')
})

test('366 closed exceptions still find the following weekly opening across year boundary', async () => {
  const { defaultPartyInboxSchedule } = await import('./partyInboxSchedule.js')
  const schedule = defaultPartyInboxSchedule()
  schedule.week.forEach((day, index) => { day.closed = index !== 1 })
  schedule.exceptions = Array.from({ length: 366 }, (_, day) => ({ date: new Date(Date.UTC(2026, 0, day + 1)).toISOString().slice(0, 10), closed: true }))
  assert.equal(calculatePartyInboxResponseDueAt('2025-12-31T17:00:00Z', zone, schedule).toISOString(), '2027-01-04T02:30:00.000Z')
})


test('sparse holiday exceptions can postpone the only weekly opening for years', async () => {
  const { defaultPartyInboxSchedule } = await import('./partyInboxSchedule.js')
  const schedule = defaultPartyInboxSchedule()
  schedule.week.forEach((day, index) => { day.closed = index !== 1 })
  schedule.exceptions = Array.from({ length: 366 }, (_, week) => ({ date: new Date(Date.UTC(2026, 0, 5 + week * 7)).toISOString().slice(0, 10), closed: true }))
  const expected = new Date(Date.UTC(2026, 0, 5 + 366 * 7, 2, 30)).toISOString()
  assert.equal(calculatePartyInboxResponseDueAt('2026-01-04T17:00:00Z', zone, schedule).toISOString(), expected)
})

test('empty timezone is normalized to company fallback instead of machine local timezone', async () => {
  const { normalizePartyInboxTimeZone } = await import('./partyInboxSla.js')
  for (const input of [undefined, null, '', '  ', 123]) assert.equal(normalizePartyInboxTimeZone(input), zone)
})
