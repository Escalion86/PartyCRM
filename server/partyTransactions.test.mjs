import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePartyTransactionPayload,
  serializePartyTransaction,
} from './partyTransactionsCore.js'

test('normalizePartyTransactionPayload normalizes income transaction', () => {
  const payload = normalizePartyTransactionPayload({
    orderId: '507f1f77bcf86cd799439011',
    clientId: '507f1f77bcf86cd799439012',
    amount: '15000.70',
    type: 'income',
    category: 'deposit',
    paymentMethod: 'cash',
    comment: '  предоплата  ',
    date: '2026-01-02T10:00:00.000Z',
  })

  assert.equal(payload.orderId, '507f1f77bcf86cd799439011')
  assert.equal(payload.clientId, '507f1f77bcf86cd799439012')
  assert.equal(payload.amount, 15000)
  assert.equal(payload.type, 'income')
  assert.equal(payload.category, 'deposit')
  assert.equal(payload.paymentMethod, 'cash')
  assert.equal(payload.comment, 'предоплата')
  assert.equal(payload.date.toISOString(), '2026-01-02T10:00:00.000Z')
})

test('normalizePartyTransactionPayload defaults invalid expense category', () => {
  const payload = normalizePartyTransactionPayload({
    orderId: '507f1f77bcf86cd799439011',
    amount: 1000,
    type: 'expense',
    category: 'deposit',
  })

  assert.equal(payload.type, 'expense')
  assert.equal(payload.category, 'other')
  assert.equal(payload.paymentMethod, 'transfer')
})

test('normalizePartyTransactionPayload keeps staffId only for payout expenses', () => {
  const payoutPayload = normalizePartyTransactionPayload({
    orderId: '507f1f77bcf86cd799439011',
    staffId: '507f1f77bcf86cd799439012',
    amount: 1000,
    type: 'expense',
    category: 'payout',
  })
  const materialPayload = normalizePartyTransactionPayload({
    orderId: '507f1f77bcf86cd799439011',
    staffId: '507f1f77bcf86cd799439012',
    amount: 1000,
    type: 'expense',
    category: 'materials',
  })

  assert.equal(payoutPayload.staffId, '507f1f77bcf86cd799439012')
  assert.equal(materialPayload.staffId, null)
})

test('serializePartyTransaction returns stable string ids', () => {
  const serialized = serializePartyTransaction({
    _id: { toString: () => 'tx-1' },
    tenantId: { toString: () => 'company-1' },
    orderId: { toString: () => 'order-1' },
    clientId: null,
    staffId: { toString: () => 'staff-1' },
    amount: 1000,
    type: 'income',
    category: 'deposit',
    date: new Date('2026-01-02T10:00:00.000Z'),
    comment: '',
    paymentMethod: 'transfer',
    createdAt: new Date('2026-01-02T11:00:00.000Z'),
    updatedAt: new Date('2026-01-02T12:00:00.000Z'),
  })

  assert.equal(serialized._id, 'tx-1')
  assert.equal(serialized.tenantId, 'company-1')
  assert.equal(serialized.orderId, 'order-1')
  assert.equal(serialized.staffId, 'staff-1')
  assert.equal(serialized.date, '2026-01-02T10:00:00.000Z')
})
