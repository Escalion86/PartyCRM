import assert from 'node:assert/strict'
import test from 'node:test'
import {
  partyDateAtTime,
  partyDateInZone,
  partyWorkingWindow,
  parsePartyWorkingSchedule,
  isPartyWithinWorkingSchedule,
} from './partyWorkingSchedule.js'

const timeZone = 'Asia/Krasnoyarsk'
const schedule = {
  week: Array.from({ length: 7 }, () => ({
    closed: false,
    opens: '09:00',
    closes: '21:00',
  })),
  exceptions: [
    { date: '2026-11-04', closed: false, opens: '11:00', closes: '18:00' },
    { date: '2026-11-05', closed: true, opens: '09:00', closes: '21:00' },
  ],
}
test('company local times are independent of the host timezone and use existing IANA rules', () => {
  assert.equal(
    partyDateAtTime('2026-11-03', '09:30', timeZone).toISOString(),
    '2026-11-03T02:30:00.000Z'
  )
  assert.equal(partyDateInZone('2026-11-03T18:00:00Z', timeZone), '2026-11-04')
})
test('a date exception replaces the weekly window and closed dates have no slots', () => {
  const parsed = parsePartyWorkingSchedule(schedule)
  assert.equal(
    partyWorkingWindow('2026-11-04', parsed, timeZone).startsAt.toISOString(),
    '2026-11-04T04:00:00.000Z'
  )
  assert.equal(partyWorkingWindow('2026-11-05', parsed, timeZone), null)
})
test('availability requires a configured schedule and includes the full buffered occupation', () => {
  assert.equal(
    isPartyWithinWorkingSchedule({
      startsAt: '2026-11-03T02:00:00Z',
      endsAt: '2026-11-03T03:00:00Z',
      timeZone,
      schedule: null,
    }),
    false
  )
  assert.equal(
    isPartyWithinWorkingSchedule({
      startsAt: '2026-11-03T02:00:00Z',
      endsAt: '2026-11-03T14:00:00Z',
      timeZone,
      schedule,
    }),
    true
  )
  assert.equal(
    isPartyWithinWorkingSchedule({
      startsAt: '2026-11-03T01:59:00Z',
      endsAt: '2026-11-03T03:00:00Z',
      timeZone,
      schedule,
    }),
    false
  )
  assert.equal(
    isPartyWithinWorkingSchedule({
      startsAt: '2026-11-03T02:00:00Z',
      endsAt: '2026-11-03T14:01:00Z',
      timeZone,
      schedule,
    }),
    false
  )
})
test('invalid calendar dates and duplicate exceptions cannot be saved', () => {
  assert.throws(() =>
    parsePartyWorkingSchedule({
      ...schedule,
      exceptions: [{ ...schedule.exceptions[0], date: '2026-02-30' }],
    })
  )
  assert.throws(() =>
    parsePartyWorkingSchedule({
      ...schedule,
      exceptions: [schedule.exceptions[0], schedule.exceptions[0]],
    })
  )
  assert.throws(() => partyDateAtTime('2026-03-29', '02:30', 'Europe/Berlin'))
})
