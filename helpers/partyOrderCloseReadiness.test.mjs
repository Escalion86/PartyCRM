import test from 'node:test'
import assert from 'node:assert/strict'

import { getPartyOrderCloseReadiness } from './partyOrderCloseReadiness.js'

test('getPartyOrderCloseReadiness allows fully paid order with paid payouts and done tasks', () => {
  const readiness = getPartyOrderCloseReadiness({
    order: {
      contractAmount: 10000,
      assignedStaff: [{ payoutAmount: 3000, payoutStatus: 'paid' }],
      additionalEvents: [{ title: 'Позвонить', done: true }],
    },
    transactions: [
      { type: 'income', amount: 10000 },
      { type: 'expense', category: 'materials', amount: 1000 },
    ],
  })

  assert.equal(readiness.ok, true)
  assert.deepEqual(readiness.blockers, [])
  assert.deepEqual(readiness.summary, {
    contractAmount: 10000,
    incomeTotal: 10000,
    expenseTotal: 1000,
    balanceDue: 0,
    paymentStatus: 'paid',
    payoutTotal: 3000,
    paidPayoutTotal: 3000,
    unpaidPayoutTotal: 0,
    unpaidPayoutCount: 0,
    payoutStatus: 'paid',
    grossMargin: 6000,
  })
})

test('getPartyOrderCloseReadiness blocks debt, unpaid payouts and open tasks', () => {
  const readiness = getPartyOrderCloseReadiness({
    order: {
      contractAmount: 15000,
      assignedStaff: [
        { payoutAmount: 4000, payoutStatus: 'ready' },
        { payoutAmount: 0, payoutStatus: 'planned' },
      ],
      additionalEvents: [
        { title: 'Подготовить реквизит', done: false },
        { title: 'Закрытая задача', done: true },
      ],
    },
    transactions: [{ type: 'income', amount: 5000 }],
  })

  assert.equal(readiness.ok, false)
  assert.deepEqual(
    readiness.blockers.map((blocker) => blocker.code),
    ['client_debt', 'unpaid_payouts', 'open_tasks']
  )
})
