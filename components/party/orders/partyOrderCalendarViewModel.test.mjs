import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartyOrderCalendarGrid,
  buildPartyOrderCalendarItems,
  toPartyOrderCalendarMonthStart,
} from './partyOrderCalendarViewModel.js'

test('buildPartyOrderCalendarGrid creates ArtistCRM-style full week month grid', () => {
  const grid = buildPartyOrderCalendarGrid(new Date('2026-07-15T12:00:00'))

  assert.equal(grid.length, 35)
  assert.equal(grid[0].key, '2026-06-28')
  assert.equal(grid[0].inCurrentMonth, false)
  assert.equal(grid[3].key, '2026-07-01')
  assert.equal(grid[3].inCurrentMonth, true)
  assert.equal(grid.at(-1).key, '2026-08-01')
  assert.equal(grid.at(-1).inCurrentMonth, false)
})

test('buildPartyOrderCalendarItems groups orders and additional events by day', () => {
  const orders = [
    {
      _id: 'late',
      title: 'Выпускной',
      status: 'active',
      eventDate: '2026-07-10T18:00:00',
      additionalEvents: [
        {
          title: 'Позвонить клиенту',
          date: '2026-07-09T07:00:00',
          done: false,
        },
      ],
    },
    {
      _id: 'early',
      title: 'День рождения',
      status: 'draft',
      eventDate: '2026-07-10T09:00:00',
      additionalEvents: [
        {
          title: 'Готово',
          date: '2026-07-09T08:00:00',
          done: true,
        },
      ],
    },
  ]

  const { itemsByDay, meta } = buildPartyOrderCalendarItems(orders)

  assert.equal(meta.orders, 2)
  assert.equal(meta.additional, 2)
  assert.deepEqual(
    itemsByDay.get('2026-07-10').map((item) => item.orderId),
    ['early', 'late']
  )
  assert.deepEqual(
    itemsByDay.get('2026-07-09').map((item) => [
      item.type,
      item.title,
      item.orderId,
      item.done,
    ]),
    [
      ['additional', 'Позвонить клиенту', 'late', false],
      ['additional', 'Готово', 'early', true],
    ]
  )
})

test('toPartyOrderCalendarMonthStart returns first day of the month', () => {
  assert.equal(
    toPartyOrderCalendarMonthStart(new Date('2026-07-31T23:30:00')).toISOString(),
    new Date(2026, 6, 1).toISOString()
  )
})
