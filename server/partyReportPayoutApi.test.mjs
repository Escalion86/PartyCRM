import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizePartyTransactionPayload, serializePartyTransaction } from './partyTransactionsCore.js'
import { canAccessPartyTransaction } from './partyTransactionAccess.js'

const tenantId = 'a'.repeat(24), orderId = 'b'.repeat(24), staffId = 'c'.repeat(24), txId = 'd'.repeat(24)
const code = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ')
const postSource = await code('../app/api/party/transactions/route.js')
const patchSource = await code('../app/api/party/transactions/[id]/route.js')

function setup({ blocked = false, permission = 'edit', outOfScope = false, role = 'performer' } = {}) {
  const session = {}, calls = [], writes = []
  const context = { tenantId, role, staff: { _id: staffId, tenantId, role, status: 'active', locationIds: role === 'location_owner' ? ['own-venue'] : [] }, position: { permissions: { orders: 'read', 'finance.payouts': permission, 'finance.payments': 'edit' }, orderScope: outOfScope ? { locationIds: ['elsewhere'], includeUnlocated: false } : {} } }
  const order = { _id: orderId, tenantId, status: 'active', locationId: role === 'location_owner' ? 'own-venue' : null, assignedStaff: [{ staffId }] }
  const transaction = { _id: txId, tenantId, orderId, type: 'expense', category: 'payout', amount: 100, staffId }
  const query = (value) => ({ session(selected) { assert.equal(selected, session); return this }, lean: async () => value })
  const deps = {
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    getPartyRequestContext: async ({ managementOnly, allowLocationOwner }) => { assert.notEqual(managementOnly, true); assert.equal(allowLocationOwner, true); return { context } },
    parseJsonBody: async (req) => req.body,
    isValidObjectId: (value) => /^[a-f\d]{24}$/.test(value),
    partyError: (status, code, message) => ({ status, body: { code, message } }),
    normalizePartyTransactionPayload, serializePartyTransaction, canAccessPartyTransaction,
    validatePartyPayoutTransactionStaff: () => ({}),
    validatePartyTransactionOrder: async ({ tenantId: tenant }) => { assert.equal(tenant, tenantId); return { order } },
    withPartyFinancialTransaction: async (tenant, callback) => { assert.equal(tenant, tenantId); calls.push('lock'); return callback(session) },
    assertPartyReportGate: async (options) => {
      assert.equal(options.session, session)
      assert.equal(options.tenantId, tenantId)
      assert.equal(options.order, order)
      assert.equal(options.staffId, staffId)
      assert.equal(options.action, 'payout')
      calls.push('gate')
      if (blocked) throw Object.assign(new Error('Отчёт ещё не принят'), { status: 409, code: 'partycrm_report_required' })
    },
    getPartyOrderModel: async () => ({
      findOne: (filter) => { assert.equal(filter.tenantId, tenantId); return query(order) },
      updateOne: async (_filter, _update, options) => { assert.equal(options.session, session); calls.push('touch') },
      updateMany: async (_filter, _update, options) => { assert.equal(options.session, session); calls.push('touch') },
    }),
    getPartyTransactionModel: async () => ({
      findOne: (filter) => { assert.equal(filter.tenantId, tenantId); return query(filter._id ? transaction : null) },
      create: async (rows, options) => { assert.equal(options.session, session); writes.push(...rows); return [{ ...rows[0], _id: txId }] },
      findOneAndUpdate: async (filter, update, options) => { assert.equal(filter.tenantId, tenantId); assert.equal(options.session, session); writes.push(update.$set); return { ...transaction, ...update.$set } },
    }),
    recordPartyOrderAudit: async () => {}, syncPartyOrderCalendarAfterCrud: async () => {},
  }
  const post = new Function(...Object.keys(deps), `${postSource}\nreturn POST`)(...Object.values(deps))
  const patch = new Function(...Object.keys(deps), `${patchSource}\nreturn PATCH`)(...Object.values(deps))
  return { calls, writes, post: (payload = {}) => post({ body: { orderId, amount: 100, staffId, type: 'expense', category: 'payout', ...payload } }), patch: () => patch({ body: { amount: 200 } }, { params: { id: txId } }) }
}

for (const method of ['post', 'patch']) test(`${method}: an unaccepted report blocks payout before ledger mutation; an accepted report allows it`, async () => {
  const blocked = setup({ blocked: true })
  assert.equal((await blocked[method]()).status, 409)
  assert.deepEqual(blocked.calls, ['lock', 'gate'])
  assert.equal(blocked.writes.length, 0)
  const allowed = setup()
  assert.equal((await allowed[method]()).status, method === 'post' ? 201 : 200)
  assert.deepEqual(allowed.calls, ['lock', 'gate', 'touch'])
  assert.equal(allowed.writes.length, 1)
})

test('a custom position needs an explicit edit grant and order scope to pay; income stays independent of report gate', async () => {
  for (const options of [{ permission: 'read' }, { permission: 'hidden' }, { outOfScope: true }]) {
    const run = setup(options)
    assert.equal((await run.post()).status, 403)
    assert.equal(run.writes.length, 0)
    assert.equal(run.calls.includes('gate'), false)
  }
  const income = setup({ blocked: true })
  assert.equal((await income.post({ type: 'income', category: 'deposit' })).status, 201)
  assert.equal(income.calls.includes('gate'), false)
})

test('a configured location position can use the generic payout path only with explicit grants and its own scope', async () => {
  for (const method of ['post', 'patch']) {
    assert.equal((await setup({ role: 'location_owner' })[method]()).status, method === 'post' ? 201 : 200)
    for (const options of [{ permission: 'hidden' }, { outOfScope: true }]) {
      const denied = setup({ role: 'location_owner', ...options })
      assert.equal((await denied[method]()).status, 403)
      assert.equal(denied.writes.length, 0)
    }
  }
})
