import test from 'node:test'
import assert from 'node:assert/strict'
import {
  layoutResourceItems,
  normalizeResourcePreference,
  resourceDateKey,
  resourceDateLabel,
  resourceItemHref,
  resourcePeriod,
  resourcePreferenceKey,
  resourceTimeZone,
  shiftResourceDate,
  validResourceDateKey,
} from './resourceCalendarPresentation.js'

test('resource period uses company midnight and a Monday week instead of device timezone', () => {
  const period = resourcePeriod('2026-10-29', 'week', 'Asia/Krasnoyarsk')
  assert.equal(period.startKey, '2026-10-26')
  assert.equal(period.endKey, '2026-11-01')
  assert.equal(period.dateFrom, '2026-10-25T17:00:00.000Z')
  assert.equal(period.dateTo, '2026-11-01T17:00:00.000Z')
  assert.equal(
    resourceDateKey('2026-10-28T18:00:00Z', 'Asia/Krasnoyarsk'),
    '2026-10-29'
  )
  assert.match(
    resourceDateLabel('2026-10-28T18:00:00Z', 'Asia/Krasnoyarsk'),
    /29.*01:00/
  )
  assert.equal(shiftResourceDate('2026-12-31', 1), '2027-01-01')
})

test('resource week preserves civil days across DST and invalid input never requests an invented period', () => {
  const autumn = resourcePeriod('2026-10-25', 'week', 'Europe/Berlin')
  assert.equal(
    (+new Date(autumn.dateTo) - +new Date(autumn.dateFrom)) / 3600000,
    169
  )
  assert.equal(
    (+new Date(autumn.days[6].end) - +new Date(autumn.days[6].start)) / 3600000,
    25
  )
  const spring = resourcePeriod('2026-03-29', 'week', 'Europe/Berlin')
  assert.equal(
    (+new Date(spring.dateTo) - +new Date(spring.dateFrom)) / 3600000,
    167
  )
  assert.equal(validResourceDateKey('2026-02-30'), false)
  assert.equal(resourcePeriod('2026-02-30', 'day', 'UTC'), null)
  assert.equal(shiftResourceDate('not-date', 1), '')
  assert.equal(resourceTimeZone('not/a-zone'), 'Europe/Moscow')
})

test('timeline clips both occupancy and body to the visible period without shifting buffers', () => {
  const start = '2026-10-29T00:00:00Z',
    end = '2026-10-30T00:00:00Z'
  const { intervals } = layoutResourceItems(
    [
      {
        id: 'continuing',
        start: '2026-10-28T23:00:00Z',
        end: '2026-10-29T03:00:00Z',
        occupiedFrom: '2026-10-28T22:00:00Z',
        occupiedUntil: '2026-10-29T04:00:00Z',
      },
      {
        id: 'buffer-only',
        start: '2026-10-30T01:00:00Z',
        end: '2026-10-30T02:00:00Z',
        occupiedFrom: '2026-10-29T23:00:00Z',
        occupiedUntil: '2026-10-30T03:00:00Z',
      },
      {
        id: 'outside',
        start: '2026-10-30T00:00:00Z',
        end: '2026-10-30T01:00:00Z',
      },
      { id: 'unknown', start, end: null },
    ],
    start,
    end
  )
  assert.equal(intervals.length, 2)
  assert.equal(intervals[0].left, 0)
  assert.equal(intervals[0].bodyLeft, 0)
  assert.equal(intervals[0].bodyWidth, 75)
  assert.equal(intervals[1].bodyWidth, 0)
  assert.equal(intervals[1].bodyLeft, 100)
})

test('overlap lanes are visual arrangement and do not fabricate conflict flags or extend durations', () => {
  const rows = [
    {
      id: 'a',
      start: '2026-10-29T10:00:00Z',
      end: '2026-10-29T10:01:00Z',
      conflict: false,
    },
    {
      id: 'b',
      start: '2026-10-29T10:00:30Z',
      end: '2026-10-29T11:00:00Z',
      conflict: false,
    },
    {
      id: 'c',
      start: '2026-10-29T11:00:00Z',
      end: '2026-10-29T12:00:00Z',
      conflict: true,
    },
  ]
  const result = layoutResourceItems(
    rows,
    '2026-10-29T00:00:00Z',
    '2026-10-30T00:00:00Z'
  )
  assert.equal(result.laneCount, 2)
  assert.deepEqual(
    result.intervals.map((row) => row.conflict),
    [false, false, true]
  )
  assert.deepEqual(
    result.intervals.map((row) => row.lane),
    [0, 1, 0]
  )
  assert.ok(Math.abs(result.intervals[0].width - 100 / 1440) < 0.0001)
})

test('resource links use only authorized canonical ids and the selected company', () => {
  const companyId = 'a'.repeat(24),
    orderId = 'b'.repeat(24),
    sessionId = 'c'.repeat(24)
  assert.equal(
    resourceItemHref(
      { kind: 'order', orderId, href: 'https://evil.example/' },
      companyId,
      true
    ),
    `/company/work?companyId=${companyId}&orderId=${orderId}`
  )
  assert.equal(
    resourceItemHref({ kind: 'ticket_session', sessionId }, companyId),
    `/performer/ticketing?companyId=${companyId}&sessionId=${sessionId}`
  )
  assert.equal(
    resourceItemHref({ kind: 'order', href: '/company/settings' }, companyId),
    ''
  )
  assert.equal(
    resourceItemHref({ kind: 'order', orderId }, 'not-a-company'),
    ''
  )
})

test('view preferences are employee/company scoped and an unavailable resource type is discarded', () => {
  assert.notEqual(
    resourcePreferenceKey('a', 'employee1'),
    resourcePreferenceKey('a', 'employee2')
  )
  assert.notEqual(
    resourcePreferenceKey('a', 'employee1'),
    resourcePreferenceKey('b', 'employee1')
  )
  assert.deepEqual(
    normalizeResourcePreference(
      { type: 'inventory', view: 'year', presentation: 'script' },
      [{ id: 'location' }]
    ),
    { type: 'location', view: 'day', presentation: 'timeline' }
  )
  assert.deepEqual(
    normalizeResourcePreference(
      { type: 'staff', view: 'week', presentation: 'agenda' },
      [{ id: 'staff' }]
    ),
    { type: 'staff', view: 'week', presentation: 'agenda' }
  )
})
