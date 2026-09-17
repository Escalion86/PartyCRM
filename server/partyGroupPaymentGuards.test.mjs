import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { normalizePartyTransactionPayload, serializePartyTransaction } from './partyTransactionsCore.js'

const source = (await readFile(new URL('../app/api/party/transactions/[id]/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export async function ', 'async function ')
const id = 'a'.repeat(24)
const tenantId = 'b'.repeat(24)
const params = { params: { id } }
const setup = ({ grouped = false, denied = false, missing = false } = {}) => {
  const writes = []
  const existing = { _id: id, tenantId, orderId: 'c'.repeat(24), amount: 500, type: 'income', category: 'deposit', groupPaymentId: grouped ? 'd'.repeat(24) : null }
  const assertScope = (filter) => { assert.equal(filter.tenantId, tenantId); assert.equal(filter._id, id) }
  const model = {
    findOne: (filter) => { assertScope(filter); return { lean: async () => missing ? null : existing } },
    findOneAndUpdate: async (filter, update) => { assertScope(filter); writes.push(update); return { ...existing, ...update.$set } },
    findOneAndDelete: (filter) => { assertScope(filter); writes.push(filter); return { lean: async () => existing } },
  }
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyTransactionModel: async () => { assert.equal(denied, false); return model },
    getPartyRequestContext: async ({ managementOnly }) => { assert.equal(managementOnly, true); return denied ? { error: { status: 403 } } : { context: { tenantId } } },
    isValidObjectId: (value) => /^[a-f0-9]{24}$/.test(value || ''),
    parseJsonBody: async (req) => req.body || {},
    partyError: (status, code) => ({ status, body: { code } }),
    normalizePartyTransactionPayload, serializePartyTransaction,
    validatePartyTransactionOrder: async (args) => { assert.equal(args.tenantId, tenantId); return { order: { _id: existing.orderId, status: 'active' } } },
    validatePartyPayoutTransactionStaff: () => ({}),
    syncPartyOrderCalendarAfterCrud: async () => {}, recordPartyOrderAudit: async () => {},
  }
  return { writes, api: compileFunction(`${source}\nreturn {PATCH,DELETE}`, Object.keys(deps))(...Object.values(deps)) }
}

test('group marker is output-only; absent historical marker serializes as null', () => {
  const payload = normalizePartyTransactionPayload({ orderId: id, amount: 5, groupPaymentId: id, tenantId })
  assert.equal(Object.hasOwn(payload, 'groupPaymentId'), false)
  assert.equal(Object.hasOwn(payload, 'tenantId'), false)
  assert.equal(serializePartyTransaction({ _id: id, orderId: id, tenantId, groupPaymentId: id }).groupPaymentId, id)
  assert.equal(serializePartyTransaction({ _id: id, orderId: id, tenantId }).groupPaymentId, null)
})
test('split payment parts reject PATCH and DELETE without writes, even marker-clearing body', async () => {
  const s = setup({ grouped: true })
  for (const method of ['PATCH', 'DELETE']) {
    const result = await s.api[method]({ body: { groupPaymentId: null, amount: 1 } }, params)
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'partycrm_group_payment_transaction_readonly')
  }
  assert.equal(s.writes.length, 0)
})
test('both methods enforce management guard and tenant lookup before exposing marker', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await setup({ denied: true }).api[method]({}, params)).status, 403)
    const s = setup({ missing: true })
    assert.equal((await s.api[method]({ body: { tenantId: 'hostile' } }, params)).status, 404)
    assert.equal(s.writes.length, 0)
  }
})
test('ordinary transactions remain editable and deletable with trusted tenant', async () => {
  const s = setup()
  const response = await s.api.PATCH({ body: { amount: 600, tenantId: 'hostile', groupPaymentId: id } }, params)
  assert.equal(response.status, 200)
  assert.equal(response.body.data.amount, 600)
  assert.equal(response.body.data.groupPaymentId, null)
  assert.equal(Object.hasOwn(s.writes[0].$set, 'groupPaymentId'), false)
  assert.equal((await s.api.DELETE({}, params)).status, 200)
  assert.equal(s.writes.length, 2)
})

const orderSource = (await readFile(new URL('../app/api/party/orders/[id]/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/^export /gm, '')
test('permanent deletion protects group payment parts and concurrent order revision changes', async () => {
  for (const hasPart of [true, false]) {
    let deleteCalls = 0
    const deps = {
      NextResponse: { json: body => ({ status: 200, body }) },
      getPartyRequestContext: async () => ({ context: { tenantId } }),
      isValidObjectId: () => true,
      partyError: (status, code) => ({ status, code }),
      getPartyOrderWriteGuard: order => ({ sharedLocationRevision: order.sharedLocationRevision }),
      getPartyOrderModel: async () => ({
        findOne: filter => { assert.equal(filter.tenantId, tenantId); return { lean: async () => ({ _id: id, status: 'active', sharedLocationRevision: 3 }) } },
        findOneAndDelete: filter => { deleteCalls++; assert.equal(filter.tenantId, tenantId); assert.equal(filter.sharedLocationRevision, 3); return { lean: async () => null } },
      }),
      getPartyTransactionModel: async () => ({ findOne: filter => {
        assert.deepEqual(filter, { tenantId, orderId: id, groupPaymentId: { $ne: null } })
        return { select: () => ({ lean: async () => hasPart ? { _id: 'payment' } : null }) }
      } }),
    }
    const DELETE = compileFunction(`${orderSource}\nreturn DELETE`, Object.keys(deps))(...Object.values(deps))
    const response = await DELETE({ url: 'http://localhost/api?permanent=true' }, params)
    assert.equal(response.status, 409)
    assert.equal(response.code, hasPart ? 'partycrm_order_group_payment_readonly' : 'partycrm_order_changed')
    assert.equal(deleteCalls, hasPart ? 0 : 1)
  }
})
