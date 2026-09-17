import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'

const id = 'a'.repeat(24)
const load = async (path, deps, name) => {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
  return compileFunction(`${source}\nreturn ${name}`, Object.keys(deps))(...Object.values(deps))
}
const base = {
  getPartyRequestContext: async ({ managementOnly }) => { assert.equal(managementOnly, true); return { context: { tenantId: 'trusted', company: {} } } },
  isValidObjectId: value => /^[a-f\d]{24}$/.test(value),
  parseJsonBody: async req => req.body,
  partyError: (status, code) => ({ status, code }),
  NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
}
const setup = async ({ order = { _id: id, status: 'active', transactions: [] }, persisted = null, staffError = null, fail = false } = {}) => {
  const calls = [], session = {}, q = value => ({ session(valueSession) { assert.equal(valueSession, session); return this }, lean: async () => value })
  const POST = await load('../app/api/party/transactions/route.js', {
    ...base, normalizePartyTransactionPayload: body => body, serializePartyTransaction: value => value,
    validatePartyPayoutTransactionStaff: () => ({ error: staffError }),
    withPartyFinancialTransaction: async (tenantId, callback) => { assert.equal(tenantId, 'trusted'); calls.push('lock'); if (fail) throw Error('secret'); const result = await callback(session); calls.push('commit'); return result },
    getPartyOrderModel: async () => ({
      findOne: filter => { assert.deepEqual(filter, { _id: id, tenantId: 'trusted' }); return q(order) },
      updateOne: async (filter, update, options) => { assert.equal(filter.tenantId, 'trusted'); assert.equal(options.session, session); assert.equal(update.$inc.sharedLocationRevision, 1); calls.push('touch') },
    }),
    getPartyTransactionModel: async () => ({
      findOne: filter => { assert.deepEqual(filter, { orderId: id, tenantId: 'trusted' }); return q(persisted) },
      create: async (rows, options) => { assert.equal(options.session, session); assert.equal(rows.length, 1); assert.equal(rows[0].tenantId, 'trusted'); calls.push('create'); return [{ ...rows[0], _id: 'tx' }] },
    }),
    recordPartyOrderAudit: async () => calls.push('audit'),
    syncPartyOrderCalendarAfterCrud: async () => calls.push('sync'),
  }, 'POST')
  return { calls, post: body => POST({ body: { orderId: id, amount: 10, type: 'income', tenantId: 'hostile', ...body } }) }
}

test('normal payment rejects an embedded-only ledger before any mutation', async () => {
  const s = await setup({ order: { _id: id, status: 'active', transactions: [{ amount: 50 }] } })
  assert.equal((await s.post()).code, 'partycrm_legacy_ledger_migration_required')
  assert.deepEqual(s.calls, ['lock', 'commit'])
})
test('postmigration normal payment writes with session and hooks only after commit', async () => {
  const s = await setup({ order: { _id: id, status: 'active', legacyLedgerMigrationId: 'migration', transactions: [] }, persisted: { amount: 50 } })
  assert.equal((await s.post()).status, 201)
  assert.deepEqual(s.calls, ['lock', 'touch', 'create', 'commit', 'audit', 'sync'])
})
test('foreign and closed orders reject normal payments without write', async () => {
  for (const [order, status] of [[null, 404], [{ status: 'closed' }, 409]]) {
    const s = await setup({ order }); assert.equal((await s.post()).status, status); assert.ok(!s.calls.includes('create'))
  }
})
test('staff validation and hidden transaction failure remain enforced', async () => {
  const s = await setup({ staffError: { status: 400 } }); assert.equal((await s.post()).status, 400); assert.ok(!s.calls.includes('touch'))
  const failed = await setup({ fail: true }); const result = await failed.post(); assert.equal(result.status, 500); assert.doesNotMatch(JSON.stringify(result), /secret/)
})
test('stale order editor cannot restore migrated embedded payments', async () => {
  const current = { _id: id, status: 'active', legacyLedgerMigrationId: 'migration', transactions: [], sharedLocationRevision: 1 }
  const q = value => ({ lean: async () => value })
  let written
  const PATCH = await load('../app/api/party/orders/[id]/route.js', {
    ...base, getPartyOrderWriteGuard, normalizeOrderPayload: body => body,
    getPartyOrderModel: async () => ({ findOne: () => q(current), findOneAndUpdate: (filter, update) => { assert.equal(filter.tenantId, 'trusted'); written = update.$set; return q({ ...current, ...written }) } }),
    validateOrderReferences: async () => null,
    applyPartyAssignmentAccountDefaults: async ({ payload }) => payload,
    getPartyCompanyTariffAccessState: async () => ({ access: {} }), filterPartyOrderPayloadByTariffAccess: value => value,
    findPartyOrderConflicts: async () => ({}), hasPartyOrderConflicts: () => false, getPartySharedLocationOrderIds: async () => [],
    recordPartyOrderAudit: async () => {}, syncPartyOrderCalendarAfterCrud: async () => {}, sendPartyPerformerAssignmentPushes: async () => {}, syncPartyOrderInventory: async () => ({}),
  }, 'PATCH')
  const result = await PATCH({ body: { status: 'active', transactions: [{ amount: 50 }] } }, { params: { id } })
  assert.equal(result.status, 200); assert.deepEqual(written.transactions, [])
})

for (const migrated of [false, true]) test(`transaction relocation ${migrated ? 'allows migrated target' : 'rejects embedded-only target'}`, async () => {
  const targetId = 'b'.repeat(24), txId = 'c'.repeat(24), session = {}, calls = []
  const existing = { _id: txId, orderId: id, amount: 10 }
  const target = { _id: targetId, status: 'active', transactions: migrated ? [] : [{ amount: 50 }] }
  const q = value => ({ session(s) { assert.equal(s, session); return this }, lean: async () => value })
  const PATCH = await load('../app/api/party/transactions/[id]/route.js', {
    ...base, normalizePartyTransactionPayload: value => value, serializePartyTransaction: value => value,
    validatePartyTransactionOrder: async ({ orderId }) => ({ order: orderId === targetId ? target : { _id: id, status: 'active' } }),
    validatePartyPayoutTransactionStaff: () => ({}),
    withPartyFinancialTransaction: async (tenant, callback) => { assert.equal(tenant, 'trusted'); const result = await callback(session); calls.push('commit'); return result },
    getPartyOrderModel: async () => ({
      findOne: filter => { assert.equal(filter.tenantId, 'trusted'); return q(filter._id === targetId ? target : { _id: id, status: 'active' }) },
      updateMany: async (filter, update, opts) => { assert.equal(filter.tenantId, 'trusted'); assert.equal(opts.session, session); assert.deepEqual(filter._id.$in, [id, targetId]); assert.equal(update.$inc.sharedLocationRevision, 1); calls.push('touch') },
    }),
    getPartyTransactionModel: async () => ({
      findOne: filter => { assert.equal(filter.tenantId, 'trusted'); return q(filter._id ? existing : migrated ? { amount: 50 } : null) },
      findOneAndUpdate: async (filter, update, opts) => { assert.equal(opts.session, session); calls.push('write'); return { ...existing, ...update.$set } },
    }),
    recordPartyOrderAudit: async () => calls.push('audit'), syncPartyOrderCalendarAfterCrud: async ({ orderId }) => calls.push(orderId),
  }, 'PATCH')
  const response = await PATCH({ body: { orderId: targetId } }, { params: { id: txId } })
  assert.equal(response.status, migrated ? 200 : 409)
  assert.deepEqual(calls, migrated ? ['touch', 'write', 'commit', 'audit', targetId, id] : ['commit'])
})
