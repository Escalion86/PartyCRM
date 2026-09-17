import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPartyInboxSchedule, parsePartyInboxSchedule } from './partyInboxSchedule.js'

test('default schedule is independent and retains agreed hours', () => {
  const first = defaultPartyInboxSchedule()
  first.week[1].closed = true
  const second = defaultPartyInboxSchedule()
  assert.equal(second.week[1].closed, false)
  assert.equal(second.week[0].opens, '10:00')
  assert.equal(second.week[1].closes, '20:00')
})

test('parser validates actual dates, unique exceptions and usable weekly hours', () => {
  for (const invalid of [null, {}, { week: [] }, { ...defaultPartyInboxSchedule(), week: Array(7).fill({ closed: true }) }, { ...defaultPartyInboxSchedule(), exceptions: [{ date: '2026-02-29', closed: true }] }, { ...defaultPartyInboxSchedule(), exceptions: [{ date: '2026-09-16', closed: true }, { date: '2026-09-16', closed: true }] }]) assert.throws(() => parsePartyInboxSchedule(invalid))
  for (const changes of [{ closed: 'false' }, { opens: '9:00' }, { closes: '24:00' }, { opens: '20:00', closes: '09:00' }, { opens: '09:00', closes: '09:00' }]) {
    const input = defaultPartyInboxSchedule()
    Object.assign(input.week[1], changes)
    assert.throws(() => parsePartyInboxSchedule(input))
  }
  const schedule = defaultPartyInboxSchedule()
  schedule.exceptions = [{ date: '2028-02-29', closed: true }]
  assert.deepEqual(parsePartyInboxSchedule(schedule).exceptions, [{ date: '2028-02-29', closed: true, opens: '09:00', closes: '20:00' }])
  schedule.exceptions = Array(367).fill({ date: '2028-02-29', closed: true })
  assert.throws(() => parsePartyInboxSchedule(schedule))
})
