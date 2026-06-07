import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPartyOrderTransactionsViewModel } from './partyOrderTransactionViewModel.js'

test('builds income and expense groups sorted by date desc', () => {
  const result = buildPartyOrderTransactionsViewModel([
    { _id: '2', type: 'income', amount: 5000, date: '2026-01-02T10:00:00.000Z' },
    { _id: '1', type: 'income', amount: 3000, date: '2026-01-01T10:00:00.000Z' },
    { _id: '3', type: 'expense', amount: 1000, date: '2026-01-03T10:00:00.000Z' },
  ])

  assert.equal(result.income[0]._id, '2')
  assert.equal(result.expense[0]._id, '3')
  assert.equal(result.incomeTotal, 8000)
  assert.equal(result.expenseTotal, 1000)
  assert.equal(result.margin, 7000)
  assert.equal(result.hasTransactions, true)
})
