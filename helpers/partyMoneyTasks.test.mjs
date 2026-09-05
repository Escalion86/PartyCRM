import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCustodyBalance,
  normalizeMoneyTask,
  normalizeMoneyTaskSubmission,
  resolveMoneyTaskReview,
} from './partyMoneyTasks.js'
const orderId = '507f1f77bcf86cd799439011',
  staffId = '507f1f77bcf86cd799439012',
  responsibleStaffId = staffId
test('task normalizes kopecks, deadline and optional settlement reference', () => {
  const value = normalizeMoneyTask({
    type: 'receive_from_client',
    orderId,
    staffId,
    responsibleStaffId,
    amountKopecks: 100050,
    dueAt: '2026-09-08T10:00:00Z',
    paymentMethod: 'transfer',
    recipientType: 'client',
    recipientLabel: 'Заказчик',
    idempotencyKey: 'task_create_123456',
  })
  assert.equal(value.amountKopecks, 100050)
  assert.equal(value.settlementId, null)
  assert.equal(value.dueAt.toISOString(), '2026-09-08T10:00:00.000Z')
})
test('invalid references, negative/fractional money and deadline fail closed', () => {
  const base = {
    type: 'receive_from_client',
    orderId,
    staffId,
    responsibleStaffId,
    amountKopecks: 1,
    dueAt: '2026-09-08',
    paymentMethod: 'cash',
    recipientType: 'client',
    recipientLabel: 'Клиент',
    idempotencyKey: 'task_create_123456',
  }
  assert.throws(() => normalizeMoneyTask({ ...base, staffId: 'foreign' }))
  assert.throws(() =>
    normalizeMoneyTask({
      ...base,
      responsibleStaffId: '507f1f77bcf86cd799439013',
    })
  )
  assert.throws(() => normalizeMoneyTask({ ...base, amountKopecks: -1 }))
  assert.throws(() => normalizeMoneyTask({ ...base, amountKopecks: 1.5 }))
  assert.throws(() => normalizeMoneyTask({ ...base, dueAt: 'wrong' }))
  assert.throws(() => normalizeMoneyTask({ ...base, paymentMethod: 'crypto' }))
  assert.throws(() => normalizeMoneyTask({ ...base, recipientType: 'company' }))
  assert.throws(() => normalizeMoneyTask({ ...base, idempotencyKey: 'short' }))
  assert.throws(() => normalizeMoneyTaskSubmission({ actualAmountKopecks: -1 }))
})
test('custody balance is isolated per order/staff and ignores payroll payments', () => {
  const items = [
    {
      type: 'custody_received_from_client',
      orderId,
      staffId,
      amountKopecks: 10000,
    },
    {
      type: 'custody_transferred_to_company',
      orderId,
      staffId,
      amountKopecks: 8000,
    },
    { type: 'payment', orderId, staffId, amountKopecks: 99999 },
    { type: 'received_on_site', orderId, staffId, amountKopecks: 1000 },
    {
      type: 'custody_received_from_client',
      orderId: '507f1f77bcf86cd799439014',
      staffId,
      amountKopecks: 500,
    },
  ]
  assert.equal(
    calculateCustodyBalance(items, {
      orderId,
      staffId,
      retainedKopecks: 500,
    }),
    500
  )
})
test('review transition requires current revision and review comment', () => {
  const task = { status: 'submitted', revision: 2 }
  assert.deepEqual(
    resolveMoneyTaskReview({
      task,
      action: 'request_revision',
      revision: 2,
      comment: 'Нужен чек',
    }),
    {
      expectedStatus: 'submitted',
      patch: { status: 'pending', reviewComment: 'Нужен чек' },
    }
  )
  assert.throws(
    () =>
      resolveMoneyTaskReview({
        task,
        action: 'request_revision',
        revision: 1,
        comment: 'old',
      }),
    { status: 409 }
  )
  assert.throws(() =>
    resolveMoneyTaskReview({
      task,
      action: 'request_revision',
      revision: 2,
      comment: '',
    })
  )
  assert.throws(
    () =>
      resolveMoneyTaskReview({
        task: { status: 'completed', revision: 2 },
        action: 'cancel',
        revision: 2,
      }),
    { status: 409 }
  )
})
