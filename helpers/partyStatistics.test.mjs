import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPartyStatistics, getStatisticsPeriod } from './partyStatistics.js'

const baseOrder = {
  _id: 'order-1',
  eventDate: '2026-07-10T10:00:00.000Z',
  status: 'closed',
  placeType: 'client_address',
  clientId: 'client-1',
  servicesIds: ['service-1', 'service-2'],
  transactions: [
    { type: 'income', amount: 30000 },
    { type: 'expense', category: 'materials', amount: 2000 },
    { type: 'expense', category: 'payout', amount: 5000 },
  ],
  assignedStaff: [{ payoutAmount: 5000 }],
}

test('statistics filters orders and does not count payout twice', () => {
  const result = buildPartyStatistics({
    orders: [baseOrder],
    services: [{ _id: 'service-1', title: 'Шоу' }, { _id: 'service-2', title: 'Фото' }],
    clients: [{ _id: 'client-1', firstName: 'Анна' }],
    filters: { from: '2026-07-01', to: '2026-07-31', serviceId: 'service-1' },
  })

  assert.equal(result.totals.revenue, 30000)
  assert.equal(result.totals.expenses, 2000)
  assert.equal(result.totals.payouts, 5000)
  assert.equal(result.totals.profit, 23000)
  assert.equal(result.totals.clients, 1)
  assert.equal(result.services[0].profit, 11500)
})

test('statistics excludes orders outside period', () => {
  const result = buildPartyStatistics({
    orders: [baseOrder],
    filters: { from: '2026-08-01', to: '2026-08-31' },
  })
  assert.equal(result.totals.orders, 0)
})

test('year preset spans the selected calendar year', () => {
  const period = getStatisticsPeriod('year', new Date(2026, 6, 12))
  assert.equal(period.from.getFullYear(), 2026)
  assert.equal(period.from.getMonth(), 0)
  assert.equal(period.to.getMonth(), 11)
})
