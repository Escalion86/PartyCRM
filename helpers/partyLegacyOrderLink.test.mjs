import test from 'node:test'
import assert from 'node:assert/strict'
import { readPartyLegacyOrderLink, loadPartyLegacyLinkedOrder } from './partyLegacyOrderLink.js'
const companyId = 'a'.repeat(24), orderId = 'b'.repeat(24), foreign = 'c'.repeat(24)

test('legacy order links are additive and require valid identifiers', () => {
  assert.equal(readPartyLegacyOrderLink('http://test/company/orders?create=order'), null)
  assert.deepEqual(readPartyLegacyOrderLink(`http://test/company/orders?order=${orderId}&company=${companyId}`), { orderId, companyId })
  for (const query of ['order=bad', `order=${orderId}&company=bad`, 'order=']) assert.throws(() => readPartyLegacyOrderLink(`http://test/company/orders?${query}`))
})

test('a loaded current-company order opens without an extra fetch', async () => {
  const order = { _id: orderId, tenantId: companyId, title: 'Заказ' }
  const result = await loadPartyLegacyLinkedOrder({ link: { orderId, companyId }, companyId, orders: [order], loadOrder: () => assert.fail('already loaded') })
  assert.equal(result, order)
})

test('an order outside the initial 120 is hydrated using the scoped single-order loader', async () => {
  let requested
  const order = { _id: orderId, tenantId: companyId, transactions: [{ amount: 42 }] }
  const result = await loadPartyLegacyLinkedOrder({ link: { orderId, companyId }, companyId, orders: [], loadOrder: async (id) => { requested = id; return order } })
  assert.equal(requested, orderId)
  assert.equal(result.transactions[0].amount, 42)
})

test('a foreign-company link is rejected before loading or changing a company', async () => {
  await assert.rejects(loadPartyLegacyLinkedOrder({ link: { orderId, companyId: foreign }, companyId, orders: [], loadOrder: () => assert.fail('must not fetch foreign link') }), { code: 'partycrm_order_link_company_denied' })
})

test('mismatched or missing API data cannot open an unrelated order', async () => {
  for (const order of [null, { _id: orderId, tenantId: foreign }, { _id: foreign, tenantId: companyId }]) await assert.rejects(loadPartyLegacyLinkedOrder({ link: { orderId, companyId }, companyId, orders: [], loadOrder: async () => order }), { code: 'partycrm_order_link_not_found' })
})
