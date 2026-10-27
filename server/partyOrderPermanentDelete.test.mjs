import test from 'node:test'
import assert from 'node:assert/strict'
import { getPartyOrderPermanentDeleteBlocker } from './partyOrderPermanentDelete.js'

test('an unpaid performed order retains its earned-service history', async () => {
  const blocker = await getPartyOrderPermanentDeleteBlocker({
    tenantId: 'tenant',
    order: {
      _id: 'order',
      status: 'active',
      fulfillment: { performedAt: '2026-01-10', amountKopecks: 12345 },
    },
  })
  assert.equal(blocker.code, 'partycrm_order_fulfillment_history_readonly')
})

test('a durable create identity blocks hard deletion even after receipt removal', async () => {
  const blocker = await getPartyOrderPermanentDeleteBlocker({
    tenantId: 'tenant',
    order: { _id: 'order', createRequestKey: 'create-key' },
  })
  assert.equal(blocker.code, 'partycrm_order_create_history_readonly')
})

test('embedded or persisted financial history blocks deletion with tenant-scoped reads', async () => {
  assert.equal(
    (
      await getPartyOrderPermanentDeleteBlocker({
        tenantId: 'tenant',
        order: { _id: 'order', transactions: [{ type: 'income', amount: 10 }] },
      })
    ).code,
    'partycrm_order_financial_history_readonly'
  )
  const Transactions = {
    findOne: (filter) => {
      assert.deepEqual(filter, { tenantId: 'tenant', orderId: 'order' })
      return { select: () => ({ lean: async () => ({ _id: 'receipt' }) }) }
    },
  }
  assert.equal(
    (
      await getPartyOrderPermanentDeleteBlocker({
        tenantId: 'tenant',
        order: { _id: 'order' },
        Transactions,
      })
    ).code,
    'partycrm_order_financial_history_readonly'
  )
  assert.equal(
    await getPartyOrderPermanentDeleteBlocker({
      tenantId: 'tenant',
      order: { _id: 'order' },
      Transactions: {
        findOne: () => ({ select: () => ({ lean: async () => null }) }),
      },
    }),
    null
  )
})
