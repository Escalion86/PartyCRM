import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPartyFinanceCsv, filterPartyOrdersByEventPeriod } from './partyFinanceCsv.js'

test('buildPartyFinanceCsv exports transaction rows with escaped values', () => {
  const csv = buildPartyFinanceCsv([
    {
      _id: 'order-1',
      title: 'День рождения, зал 1',
      eventDate: '2026-06-20T12:00:00.000Z',
      client: { name: 'Иван "Клиент"' },
      contractAmount: 20000,
      transactions: [
        {
          date: '2026-06-10T09:00:00.000Z',
          type: 'income',
          category: 'deposit',
          amount: 5000,
          paymentMethod: 'cash',
          comment: 'предоплата',
        },
      ],
    },
  ])

  assert.match(csv, /^Дата заказа;Заказ;Клиент;/)
  assert.match(csv, /"День рождения, зал 1"/)
  assert.match(csv, /"Иван ""Клиент"""/)
  assert.match(csv, /Поступление;Предоплата;5000/)
})

test('filterPartyOrdersByEventPeriod keeps orders inside inclusive period', () => {
  const orders = [
    { _id: 'before', eventDate: '2026-05-31T23:59:00.000Z' },
    { _id: 'inside', eventDate: '2026-06-15T12:00:00.000Z' },
    { _id: 'after', eventDate: '2026-07-01T00:00:00.000Z' },
  ]

  assert.deepEqual(
    filterPartyOrdersByEventPeriod(orders, {
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    }).map((order) => order._id),
    ['inside']
  )
})
