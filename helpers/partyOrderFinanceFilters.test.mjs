import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyOrderFinanceFlags,
  matchesPartyOrderFinanceFilter,
} from './partyOrderFinanceFilters.js'

test('getPartyOrderFinanceFlags detects prepayment, debt, unpaid payouts and negative margin', () => {
  const flags = getPartyOrderFinanceFlags({
    contractAmount: 20000,
    assignedStaff: [{ payoutAmount: 8000, payoutStatus: 'ready' }],
    transactions: [
      { type: 'income', amount: 5000, category: 'deposit' },
      { type: 'expense', amount: 9000, category: 'materials' },
    ],
  })

  assert.deepEqual(flags, {
    waitsPrepayment: false,
    hasClientDebt: true,
    hasUnpaidPayouts: true,
    hasNegativeMargin: true,
  })
})

test('getPartyOrderFinanceFlags detects order waiting for prepayment', () => {
  assert.equal(
    getPartyOrderFinanceFlags({
      contractAmount: 12000,
      transactions: [],
      assignedStaff: [],
    }).waitsPrepayment,
    true
  )
})

test('matchesPartyOrderFinanceFilter maps filter names to finance flags', () => {
  const order = {
    contractAmount: 10000,
    assignedStaff: [{ payoutAmount: 3000, payoutStatus: 'paid' }],
    transactions: [{ type: 'income', amount: 10000 }],
  }

  assert.equal(matchesPartyOrderFinanceFilter(order, 'finance_debt'), false)
  assert.equal(
    matchesPartyOrderFinanceFilter(order, 'finance_negative_margin'),
    false
  )
})
