import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatePartyFinancialOverview,
  parsePartyOverviewPeriod,
} from './partyFinancialOverview.js'

const access = {
  orderUnmarked: true,
  orderPayments: true,
  orderRefunds: true,
  orderEarned: true,
  ticketFinance: true,
}
const period = (from, to) =>
  parsePartyOverviewPeriod({ from, to, timeZone: 'Asia/Krasnoyarsk' })
test('an advance is received in October and earned in November without a second receipt', () => {
  const orders = [
    {
      _id: 'order',
      eventDate: '2026-11-15T10:00:00Z',
      fulfillment: {
        performedAt: '2026-11-15T12:00:00Z',
        amountKopecks: 2000000,
      },
    },
  ]
  const transactions = [
    {
      orderId: 'order',
      type: 'income',
      amount: 5000,
      date: '2026-10-20T10:00:00Z',
    },
    {
      orderId: 'order',
      type: 'income',
      amount: 15000,
      date: '2026-11-15T10:00:00Z',
    },
  ]
  const october = calculatePartyFinancialOverview({
    period: period('2026-10-01', '2026-10-31'),
    orders,
    transactions,
    access,
  })
  const november = calculatePartyFinancialOverview({
    period: period('2026-11-01', '2026-11-30'),
    orders,
    transactions,
    access,
  })
  assert.equal(october.orderPaymentsKopecks, 500000)
  assert.equal(october.orderEarnedKopecks, 0)
  assert.equal(november.orderPaymentsKopecks, 1500000)
  assert.equal(november.orderEarnedKopecks, 2000000)
})
test('persisted journals override embedded mirrors even when receipts are outside the period', () => {
  const result = calculatePartyFinancialOverview({
    period: period('2026-11-01', '2026-11-30'),
    orders: [
      {
        _id: 'order',
        transactions: [{ type: 'income', amount: 9000, date: '2026-11-01' }],
      },
    ],
    transactions: [],
    persistedOrderIds: ['order'],
    access,
  })
  assert.equal(result.orderPaymentsKopecks, 0)
})
test('unpaid performed orders retain earned amounts and closed unmarked orders do not invent fulfillment', () => {
  const result = calculatePartyFinancialOverview({
    period: period('2026-01-01', '2026-01-31'),
    orders: [
      {
        _id: 'performed',
        status: 'active',
        fulfillment: {
          performedAt: '2026-01-10T00:00:00Z',
          amountKopecks: 77700,
        },
      },
      {
        _id: 'legacy',
        status: 'closed',
        eventDate: '2026-01-15T00:00:00Z',
        contractAmount: 9000,
      },
    ],
    access,
  })
  assert.equal(result.orderEarnedKopecks, 77700)
  assert.equal(result.orderPaymentsKopecks, 0)
  assert.equal(result.unmarkedPastOrders, 1)
})
test('open visits earn exact immutable admission values and refunds have their own date', () => {
  const sale = {
    _id: 'sale',
    admission: 'open',
    quantity: 3,
    refundedQuantity: 1,
    totalAmountKopecks: 100,
    createdAt: '2026-01-01',
  }
  const ticketLedger = [
    {
      saleId: 'sale',
      kind: 'admission',
      quantity: 1,
      amountKopecks: 33,
      occurredAt: '2026-01-10',
    },
    {
      saleId: 'sale',
      kind: 'admission',
      quantity: 1,
      amountKopecks: 34,
      occurredAt: '2026-01-11',
    },
    {
      saleId: 'sale',
      kind: 'refund',
      quantity: 1,
      amountKopecks: 33,
      occurredAt: '2026-02-01',
    },
  ]
  const jan = calculatePartyFinancialOverview({
    period: period('2026-01-01', '2026-01-31'),
    sales: [sale],
    ticketLedger,
    access,
  })
  const feb = calculatePartyFinancialOverview({
    period: period('2026-02-01', '2026-02-28'),
    sales: [sale],
    ticketLedger,
    access,
  })
  assert.equal(jan.ticketEarnedKopecks, 67)
  assert.equal(jan.ticketQuantity, 3)
  assert.equal(jan.refundedTicketQuantity, 0)
  assert.equal(feb.ticketRefundsKopecks, 33)
  assert.equal(feb.refundedTicketQuantity, 1)
})
test('session revenue keeps the performance snapshot after a late refund', () => {
  const result = calculatePartyFinancialOverview({
    period: period('2026-01-01', '2026-01-31'),
    sales: [
      {
        _id: 'sale',
        sessionId: 'session',
        admission: 'session',
        quantity: 2,
        refundedQuantity: 2,
        totalAmountKopecks: 200,
        fulfilledAt: '2026-01-15',
        earnedAmountKopecks: 200,
      },
    ],
    access,
  })
  assert.equal(result.ticketEarnedKopecks, 200)
})
test('missing finance grants return unknown rather than exposing hidden amounts or false zero settlements', () => {
  const result = calculatePartyFinancialOverview({
    period: period('2026-01-01', '2026-01-31'),
    orders: [
      {
        _id: 'order',
        fulfillment: { performedAt: '2026-01-15', amountKopecks: 12345 },
      },
    ],
    access: {},
  })
  assert.equal(result.orderEarnedKopecks, null)
  assert.equal(result.orderPaymentsKopecks, null)
  assert.equal(result.ticketPaymentsKopecks, null)
  assert.equal(result.aggregatorSettlementsKopecks, null)
})
test('company-zone dates include midnight and reject impossible or oversized periods', () => {
  assert.equal(
    period('2026-10-01', '2026-10-31').dateFrom.toISOString(),
    '2026-09-30T17:00:00.000Z'
  )
  assert.equal(
    period('2026-10-01', '2026-10-31').dateTo.toISOString(),
    '2026-10-31T17:00:00.000Z'
  )
  for (const [from, to] of [
    ['2026-02-30', '2026-03-01'],
    ['2026-10-20', '2026-10-01'],
    ['2025-01-01', '2026-12-31'],
  ])
    assert.throws(() => period(from, to))
})

test('a legacy order remains ongoing for its duration when dateEnd is absent', () => {
  const today = new Date().toISOString().slice(0, 10)
  const range = parsePartyOverviewPeriod({
    from: today,
    to: today,
    timeZone: 'UTC',
  })
  const result = calculatePartyFinancialOverview({
    period: range,
    orders: [
      {
        _id: 'ongoing',
        eventDate: new Date(Date.now() - 60000),
        dateEnd: null,
        durationMinutes: 60,
      },
    ],
    access,
  })
  assert.equal(result.unmarkedPastOrders, 0)
})
