import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PARTY_ORDER_PAYOUT_STATUSES,
  getPartyTransactionCategoryOptions,
  getOrderPaymentStatusLabel,
  getPartyPayoutStatusLabel,
  getOrderPaymentState,
  getOrderTransactionAction,
  getOrderTransactionTotals,
  hasDepositTransaction,
  normalizePartyPayoutStatus,
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

test('getOrderPaymentState derives none state without contract and income', () => {
  assert.deepEqual(
    getOrderPaymentState({ contractAmount: 0, transactions: [] }),
    {
      contractAmount: 0,
      incomeTotal: 0,
      expenseTotal: 0,
      margin: 0,
      balanceDue: 0,
      status: 'none',
      hasDeposit: false,
    }
  )
})

test('getOrderPaymentState derives wait prepayment before first income', () => {
  const state = getOrderPaymentState({
    contractAmount: 12000,
    transactions: [{ type: 'expense', category: 'materials', amount: 1000 }],
  })

  assert.equal(state.status, 'wait_prepayment')
  assert.equal(state.balanceDue, 12000)
  assert.equal(state.margin, -1000)
})

test('getOrderPaymentState derives prepaid state with partial income', () => {
  const state = getOrderPaymentState({
    contractAmount: 12000,
    transactions: [{ type: 'income', category: 'deposit', amount: 3000 }],
  })

  assert.equal(state.status, 'prepaid')
  assert.equal(state.balanceDue, 9000)
  assert.equal(state.hasDeposit, true)
})

test('getOrderTransactionAction requires autosave for unsaved order', () => {
  assert.deepEqual(
    getOrderTransactionAction({ orderId: null, isDraft: false }),
    { type: 'autosave-before-open' }
  )
})

test('getOrderTransactionAction can autosave new draft order before transaction', () => {
  assert.deepEqual(
    getOrderTransactionAction({ orderId: '', isDraft: false }),
    { type: 'autosave-before-open' }
  )
})

test('getOrderTransactionAction allows transactions for saved draft order', () => {
  assert.deepEqual(
    getOrderTransactionAction({ orderId: 'order-1', isDraft: true }),
    { type: 'open' }
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

test('payout status helpers expose stable labels and fallback', () => {
  assert.deepEqual(PARTY_ORDER_PAYOUT_STATUSES, [
    'planned',
    'ready',
    'paid',
    'canceled',
  ])
  assert.equal(getPartyPayoutStatusLabel('ready'), 'Готово к выплате')
  assert.equal(normalizePartyPayoutStatus('unknown'), 'planned')
})

test('getOrderPaymentStatusLabel returns readable payment status', () => {
  assert.equal(getOrderPaymentStatusLabel('wait_prepayment'), 'Ждет предоплату')
  assert.equal(getOrderPaymentStatusLabel('paid'), 'Оплачено')
})

test('getPartyTransactionCategoryOptions filters categories by transaction type', () => {
  assert.deepEqual(
    getPartyTransactionCategoryOptions('income').map((option) => option.value),
    ['deposit', 'final_payment', 'client_payment']
  )
  assert.deepEqual(
    getPartyTransactionCategoryOptions('expense').map((option) => option.value),
    ['payout', 'refund', 'taxes', 'materials', 'travel', 'other']
  )
})
