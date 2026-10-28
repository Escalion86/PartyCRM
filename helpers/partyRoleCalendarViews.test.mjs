import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPartyOrderCalendarPeriod,
  shiftPartyOrderCalendarPeriod,
} from '../components/party/orders/partyOrderCalendarViewModel.js'
import {
  buildPartyRoleCalendarDays,
  getPartyRoleCalendarRange,
  layoutPartyRoleCalendarDay,
} from './partyRoleCalendar.js'
import {
  readPartyOrderViewPreference,
  writePartyOrderViewPreference,
} from './partyOrderViewPreference.js'

const day = new Date(2026, 9, 28)
const item = (id, from, to) => ({
  id,
  title: id,
  start: new Date(2026, 9, 28, ...from),
  end: to ? new Date(2026, 9, 28, ...to) : null,
})

test('week starts on Monday and includes Sunday across a year boundary', () => {
  const days = buildPartyOrderCalendarPeriod(new Date(2027, 0, 1, 15), 'week')
  assert.deepEqual(
    days.map(({ key }) => key),
    [
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]
  )
  assert.equal(days[0].date.getHours(), 0)
  assert.equal(
    buildPartyOrderCalendarPeriod(new Date(2027, 0, 3), 'week')[0].key,
    '2026-12-28'
  )
})

test('day range covers precisely local midnight to next midnight, and navigation preserves calendar days', () => {
  const days = buildPartyOrderCalendarPeriod(day, 'day')
  assert.equal(days.length, 1)
  assert.deepEqual(getPartyRoleCalendarRange(days), {
    dateFrom: day.toISOString(),
    dateTo: new Date(2026, 9, 29).toISOString(),
  })
  assert.equal(
    +shiftPartyOrderCalendarPeriod(day, 'day', -1),
    +new Date(2026, 9, 27)
  )
  assert.equal(
    +shiftPartyOrderCalendarPeriod(day, 'week', 1),
    +new Date(2026, 10, 4)
  )
  assert.equal(
    +shiftPartyOrderCalendarPeriod(new Date(2026, 0, 31), 'month', 1),
    +new Date(2026, 1, 1)
  )
})

test('month period preserves existing full weeks', () => {
  const days = buildPartyOrderCalendarPeriod(day)
  assert.equal(days.length % 7, 0)
  assert.equal(days[0].date.getDay(), 0)
  assert.ok(days.some((date) => !date.inCurrentMonth))
})

test('overlapping intervals get separate lanes; adjacent intervals and later clusters reuse space', () => {
  const { intervals } = layoutPartyRoleCalendarDay(
    [
      item('a', [9, 0], [11, 0]),
      item('b', [10, 0], [12, 0]),
      item('c', [12, 0], [13, 0]),
      item('d', [15, 0], [16, 0]),
    ],
    day
  )
  assert.deepEqual(
    intervals.map(({ id, lane, laneCount }) => [id, lane, laneCount]),
    [
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
      ['d', 0, 1],
    ]
  )
})

test('chain overlaps retain a shared lane width and short labels do not collide', () => {
  const { intervals } = layoutPartyRoleCalendarDay(
    [
      item('a', [9, 0], [9, 5]),
      item('b', [9, 10], [10, 0]),
      item('c', [9, 50], [10, 30]),
    ],
    day
  )
  assert.equal(intervals[0].endMinute - intervals[0].startMinute, 5)
  assert.equal(intervals[0].labelEndMinute - intervals[0].labelStartMinute, 42)
  assert.equal(intervals[0].lane === intervals[1].lane, false)
  assert.ok(intervals.every((entry) => entry.laneCount === 2))
})

test('unknown/hidden end and zero duration are points, never simulated occupied intervals', () => {
  const data = [item('unknown', [9, 0]), item('zero', [10, 0], [10, 0])]
  const result = layoutPartyRoleCalendarDay(data, day)
  assert.equal(result.intervals.length, 0)
  assert.deepEqual(
    result.points.map((entry) => entry.id),
    ['unknown', 'zero']
  )
  const raw = {
    _id: 'hidden',
    title: 'Private',
    eventDate: data[0].start,
    dateEnd: new Date(2026, 9, 30),
  }
  const days = buildPartyOrderCalendarPeriod(day, 'week')
  const byDay = buildPartyRoleCalendarDays([raw], days, {})
  const hidden = layoutPartyRoleCalendarDay(byDay.get('2026-10-28'), day)
  assert.equal(hidden.points[0].title, 'Заказ')
  assert.equal(hidden.intervals.length, 0)
  assert.equal(byDay.get('2026-10-29').length, 0)
})

test('multi-day events clip to midnight and midnight end does not occupy next day', () => {
  const raw = {
    _id: 'overnight',
    title: 'Night',
    eventDate: new Date(2026, 9, 27, 22),
    dateEnd: new Date(2026, 9, 29, 0),
  }
  const days = buildPartyOrderCalendarPeriod(day, 'week')
  const byDay = buildPartyRoleCalendarDays([raw], days, {
    title: true,
    end: true,
  })
  const previous = layoutPartyRoleCalendarDay(
    byDay.get('2026-10-27'),
    new Date(2026, 9, 27)
  ).intervals[0]
  assert.equal(previous.startMinute, 1320)
  assert.equal(previous.endMinute, 1440)
  assert.equal(previous.continuesAfter, true)
  const current = layoutPartyRoleCalendarDay(byDay.get('2026-10-28'), day)
    .intervals[0]
  assert.equal(current.startMinute, 0)
  assert.equal(current.endMinute, 1440)
  assert.equal(current.continuesBefore, true)
  assert.equal(current.continuesAfter, false)
  assert.equal(byDay.get('2026-10-29').length, 0)
})

test('near-midnight short interval retains actual duration while button stays inside the day', () => {
  const { intervals } = layoutPartyRoleCalendarDay(
    [item('late', [23, 59], [24, 0])],
    day
  )
  assert.equal(intervals[0].startMinute, 1439)
  assert.equal(intervals[0].endMinute, 1440)
  assert.equal(intervals[0].labelStartMinute, 1398)
  assert.equal(intervals[0].labelEndMinute, 1440)
})

test('layout does not mutate source items and handles empty/irrelevant days', () => {
  const original = Object.freeze(item('a', [9, 0], [10, 0]))
  layoutPartyRoleCalendarDay([original], day)
  assert.equal(original.lane, undefined)
  assert.deepEqual(
    layoutPartyRoleCalendarDay([original], new Date(2026, 9, 29)),
    { intervals: [], points: [] }
  )
})

test('order view preferences are isolated by company and employee and do not store historical dates', () => {
  const values = new Map()
  const store = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  writePartyOrderViewPreference(
    'company-a',
    'staff-a',
    { view: 'calendar', calendarView: 'week', date: '2020-01-01' },
    store
  )
  assert.deepEqual(
    readPartyOrderViewPreference('company-a', 'staff-a', store),
    { view: 'calendar', calendarView: 'week' }
  )
  assert.deepEqual(
    readPartyOrderViewPreference('company-b', 'staff-a', store),
    { view: 'list', calendarView: 'month' }
  )
  assert.deepEqual(
    readPartyOrderViewPreference('company-a', 'staff-b', store),
    { view: 'list', calendarView: 'month' }
  )
  assert.doesNotMatch([...values.values()].join(), /2020/)
})

test('broken, missing or disabled preference storage does not block rendering', () => {
  for (const store of [
    { getItem: () => '{broken' },
    {
      getItem: () => {
        throw Error('disabled')
      },
      setItem: () => {
        throw Error('disabled')
      },
    },
    { getItem: () => '{"view":"invalid","calendarView":"invalid"}' },
  ]) {
    assert.deepEqual(readPartyOrderViewPreference('a', 'b', store), {
      view: 'list',
      calendarView: 'month',
    })
    assert.doesNotThrow(() =>
      writePartyOrderViewPreference('a', 'b', { view: 'calendar' }, store)
    )
  }
  assert.deepEqual(readPartyOrderViewPreference('', 'b', {}), {
    view: 'list',
    calendarView: 'month',
  })
})
