import test from 'node:test'
import assert from 'node:assert/strict'

import { getPartyOrderCloseReadiness } from './partyOrderCloseReadiness.js'

test('getPartyOrderCloseReadiness allows fully paid order with paid payouts and done tasks', () => {
  const readiness = getPartyOrderCloseReadiness({
    order: {
      contractAmount: 10000,
      assignedStaff: [
        { staffId: '507f1f77bcf86cd799439011', payoutAmount: 3000 },
      ],
      additionalEvents: [{ title: 'Позвонить', done: true }],
    },
    transactions: [
      { type: 'income', amount: 10000 },
      { type: 'expense', category: 'materials', amount: 1000 },
      {
        type: 'expense',
        category: 'payout',
        amount: 3000,
        staffId: '507f1f77bcf86cd799439011',
      },
    ],
  })

  assert.equal(readiness.ok, true)
  assert.deepEqual(readiness.blockers, [])
  assert.deepEqual(readiness.summary, {
    contractAmount: 10000,
    incomeTotal: 10000,
    expenseTotal: 4000,
    balanceDue: 0,
    paymentStatus: 'paid',
    payoutTotal: 3000,
    paidPayoutTotal: 3000,
    unpaidPayoutTotal: 0,
    unpaidPayoutCount: 0,
    payoutStatus: 'paid',
    grossMargin: 6000,
    preparation: {
      totalItems: 0,
      pendingItems: 0,
      clientCheckStatus: 'waiting',
      clientCheckComplete: false,
      assemblyStatus: 'not_started',
      assemblyReady: false,
      addressChanged: false,
      assignedAcknowledgementCount: 0,
      missingAddressAcknowledgementCount: 0,
    },
  })
})

test('getPartyOrderCloseReadiness blocks debt, unpaid payouts and open tasks', () => {
  const readiness = getPartyOrderCloseReadiness({
    order: {
      contractAmount: 15000,
      assignedStaff: [
        { staffId: '507f1f77bcf86cd799439011', payoutAmount: 4000 },
        { staffId: '507f1f77bcf86cd799439012', payoutAmount: 0 },
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
