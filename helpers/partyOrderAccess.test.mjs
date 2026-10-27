import test from 'node:test'
import assert from 'node:assert/strict'
import { maskPartyOrderBlockers, maskPartyOrderFinancialSummary, maskPartyOrderConflicts } from './partyOrderAccess.js'

const context = { tenantId: 'a', role: 'performer', staff: { _id: 's', tenantId: 'a', role: 'performer', status: 'active', positionId: 'p' }, position: { _id: 'p', tenantId: 'a', active: true, permissions: { orders: 'read', 'orders.status': 'edit' }, orderScope: {} } }
const order = { tenantId: 'a', status: 'active' }

test('a closing permission does not disclose hidden debt or payout amounts', () => {
  const output = maskPartyOrderBlockers(context, order, [{ code: 'client_debt', message: 'Долг 976543 ₽', amount: 976543 }, { code: 'unpaid_payouts', message: 'Выплаты 86421 ₽', staffId: 'private' }])
  assert.equal(JSON.stringify(output).includes('976543'), false)
  assert.equal(JSON.stringify(output).includes('private'), false)
  assert.deepEqual(maskPartyOrderFinancialSummary(context, order, { contractAmount: 10000, balanceDue: 976543, futureSecret: 'private' }), {})
})

test('conflict checks retain the fact of a collision without revealing inaccessible order details', () => {
  const result = maskPartyOrderConflicts(context, { locationConflicts: [{ orderId: 'private', title: 'secret-party', phone: 'phone' }], staffConflicts: [] })
  assert.equal(result.locationConflicts.length, 1)
  assert.equal(JSON.stringify(result).includes('secret-party'), false)
  assert.equal(JSON.stringify(result).includes('private'), false)
})
