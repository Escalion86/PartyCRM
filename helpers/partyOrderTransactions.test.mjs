import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getOrderPaymentState,
  getOrderTransactionAction,
  getOrderTransactionTotals,
  hasDepositTransaction,
} from './partyOrderTransactions.js'

test('hasDepositTransaction detects income deposit', () => {
  assert.equal(
    hasDepositTransaction([
      { type: 'income', category: 'deposit', amount: 5000 },
    ]),
    true
  )
})

test('getOrderTransactionTotals splits income and expense', () => {
  assert.deepEqual(
    getOrderTransactionTotals([
      { type: 'income', amount: 10000 },
      { type: 'expense', amount: 3000 },
    ]),
    { incomeTotal: 10000, expenseTotal: 3000, margin: 7000 }
  )
})

test('getOrderPaymentState derives paid state from contract and income', () => {
  assert.deepEqual(
    getOrderPaymentState({
      contractAmount: 15000,
      transactions: [
        { type: 'income', category: 'deposit', amount: 5000 },
        { type: 'income', category: 'final_payment', amount: 10000 },
        { type: 'expense', category: 'payout', amount: 4000 },
      ],
    }),
    {
      contractAmount: 15000,
      incomeTotal: 15000,
      expenseTotal: 4000,
      margin: 11000,
      balanceDue: 0,
      status: 'paid',
      hasDeposit: true,
    }
  )
})

test('getOrderTransactionAction requires autosave for unsaved order', () => {
  assert.deepEqual(
    getOrderTransactionAction({ orderId: null, isDraft: false }),
    { type: 'autosave-before-open' }
  )
})

test('getOrderTransactionAction blocks cloned order', () => {
  assert.deepEqual(
    getOrderTransactionAction({ orderId: 'order-1', isClone: true }),
    {
      type: 'blocked',
      error: 'В копии транзакции недоступны до сохранения',
    }
  )
})
