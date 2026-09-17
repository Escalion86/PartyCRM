import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPartyRelatedOrdersSummary } from './partyRelatedOrders.js'

const order = (id, extra = {}) => ({
  _id: id, tenantId: 'company', title: id, status: 'active',
  contractAmount: 1000, ...extra,
})
const transaction = (id, orderId, amount, extra = {}) => ({
  _id: id, tenantId: 'company', orderId, amount, type: 'income', ...extra,
})

test('summarizes separate order balances without offsetting overpayments', () => {
  const result = buildPartyRelatedOrdersSummary({
    orders: [order('first'), order('second')],
    transactions: [transaction('a', 'first', 1500), transaction('b', 'second', 200)],
  })
  assert.deepEqual(result.totals, {
    contractAmount: 2000, incomeTotal: 1700, expenseTotal: 0, balanceDue: 800,
  })
  assert.equal(result.orders[0].finance.balanceDue, 0)
  assert.equal(result.orders[1].finance.balanceDue, 800)
  assert.deepEqual(Object.keys(result.orders[0].finance).sort(),
    ['balanceDue', 'contractAmount', 'expenseTotal', 'incomeTotal'])
})

test('counts each order and persisted transaction id once; persisted replaces embedded', () => {
  const first = order('first', { transactions: [{ type: 'income', amount: 999 }] })
  const payment = transaction('a', 'first', 200)
  const result = buildPartyRelatedOrdersSummary({
    orders: [first, first], transactions: [payment, payment],
  })
  assert.equal(result.orders.length, 1)
  assert.equal(result.totals.incomeTotal, 200)
  assert.equal(result.totals.contractAmount, 1000)
})

test('legacy transactions deduplicate known ids but retain independent idless entries', () => {
  const embedded = { _id: 'a', type: 'income', amount: 200 }
  const result = buildPartyRelatedOrdersSummary({
    orders: [order('first', { transactions: [embedded, embedded,
      { type: 'income', amount: 50 }, { type: 'income', amount: 50 }] })],
  })
  assert.equal(result.totals.incomeTotal, 300)
})

test('canceled contract and balance excluded while real payments and refunds retained', () => {
  const result = buildPartyRelatedOrdersSummary({
    orders: [order('first'), order('canceled', { status: 'canceled' })],
    transactions: [transaction('a', 'canceled', 400),
      transaction('b', 'canceled', 400, { type: 'expense', category: 'refund' })],
  })
  assert.deepEqual(result.totals, {
    contractAmount: 1000, incomeTotal: 400, expenseTotal: 400, balanceDue: 1000,
  })
  assert.deepEqual(result.orders[1].finance, {
    contractAmount: 1000, incomeTotal: 400, expenseTotal: 400, balanceDue: 600,
  })
})

test('payer, locations and persisted payments must match order tenant', () => {
  const result = buildPartyRelatedOrdersSummary({
    orders: [order('first', { contactRoles: { payerClientId: 'p' }, locationId: 'l',
      transactions: [{ type: 'income', amount: 20 }] }),
    order('second', { contactRoles: { payerClientId: 'valid' }, locationId: 'valid' })],
    clients: [{ _id: 'p', tenantId: 'foreign', firstName: 'Secret' },
      { _id: 'valid', tenantId: 'company', firstName: 'Анна', secondName: 'Иванова' }],
    locations: [{ _id: 'l', tenantId: 'foreign', title: 'Secret' },
      { _id: 'valid', tenantId: 'company', title: 'Дино' }],
    transactions: [transaction('foreign', 'first', 900, { tenantId: 'foreign' })],
  })
  assert.equal(result.orders[0].payerName, 'Не указан')
  assert.equal(result.orders[0].locationTitle, '')
  assert.equal(result.orders[0].finance.incomeTotal, 20)
  assert.equal(result.orders[1].payerName, 'Иванова Анна')
  assert.equal(result.orders[1].locationTitle, 'Дино')
})

test('empty summary and safe projection do not expose staff or transaction details', () => {
  assert.deepEqual(buildPartyRelatedOrdersSummary(), { orders: [], totals: {
    contractAmount: 0, incomeTotal: 0, expenseTotal: 0, balanceDue: 0,
  } })
  const result = buildPartyRelatedOrdersSummary({ orders: [order('first', {
    assignedStaff: [{ payoutAmount: 900 }], businessId: 'private',
  })] })
  assert.deepEqual(Object.keys(result.orders[0]).sort(),
    ['_id', 'eventDate', 'finance', 'locationTitle', 'payerName', 'status', 'title'])
})
