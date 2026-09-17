import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { createHash } from 'node:crypto'

const source = (await readFile(new URL('./partyLegacyLedger.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const id = (n) => String(n).padStart(24, '0')
const row = (extra = {}) => ({ _id: id(10), amount: 10.11, type: 'income', category: 'deposit', paymentMethod: 'cash', date: new Date('2026-09-18T10:00:00Z'), comment: 'Внесён задаток', ...extra })
const setup = () => {
  let state = { orders: [{ _id: id(1), tenantId: 'tenant', status: 'active', transactions: [row(), row({ _id: id(11), amount: 0.01, type: 'expense', category: 'travel', staffId: id(2) })] }], transactions: [], migrations: [], staff: [{ _id: id(2), tenantId: 'tenant', name: 'Ольга' }], clients: [] }
  let session, next = 20, serial = Promise.resolve(), rejectWrite = false
  const matches = (r, f) => Object.entries(f).every(([key, value]) => value?.$in ? value.$in.includes(String(r[key])) : value === null ? r[key] == null : String(r[key]) === String(value))
  const query = (read) => { let used; return { session(value) { used = value; return this }, async lean() { if (session) assert.equal(used, session); return structuredClone(read()) } } }
  const model = (table) => ({
    init: async () => {},
    findOne: (f) => { assert.equal(f.tenantId, 'tenant'); return query(() => state[table].find((r) => matches(r, f))) },
    find: (f) => { assert.equal(f.tenantId, 'tenant'); return query(() => state[table].filter((r) => matches(r, f))) },
    async insertMany(rows, options) { assert.equal(options.session, session); assert.equal(options.ordered, true); state[table].push(...rows) },
    async create(rows, options) { assert.equal(options.session, session); assert.equal(options.ordered, true); state[table].push(...rows.map((r) => ({ ...r, _id: String(r._id) }))) },
    async updateOne(f, update, options) { assert.equal(options.session, session); assert.equal(f.tenantId, 'tenant'); if (rejectWrite) return { matchedCount: 0 }; const item = state[table].find((r) => matches(r, f)); if (!item) return { matchedCount: 0 }; Object.assign(item, update.$set); if (item.legacyLedgerMigrationId) item.legacyLedgerMigrationId = String(item.legacyLedgerMigrationId); for (const [k, v] of Object.entries(update.$inc)) item[k] = (item[k] || 0) + v; return { matchedCount: 1 } },
  })
  const deps = { createHash, Types: { ObjectId: class { constructor() { this.value = id(next++) } toString() { return this.value } } }, getPartyOrderModel: async () => model('orders'), getPartyTransactionModel: async () => model('transactions'), getPartyStaffModel: async () => model('staff'), getPartyClientModel: async () => model('clients'), getPartyLegacyLedgerMigrationModel: async () => model('migrations'), withPartyFinancialTransaction: (tenant, callback) => { assert.equal(tenant, 'tenant'); const op = serial.then(async () => { const before = structuredClone(state); session = Symbol(); try { return await callback(session) } catch (error) { state = before; throw error } finally { session = null } }); serial = op.catch(() => {}); return op } }
  const api = compileFunction(`${source}\nreturn {previewPartyLegacyEntries,getPartyLegacyLedger,migratePartyLegacyLedger}`, Object.keys(deps))(...Object.values(deps))
  const args = { tenantId: 'tenant', orderId: id(1) }
  return { api, state: () => state, preview: () => api.getPartyLegacyLedger(args), migrate: (expectedFingerprint) => api.migratePartyLegacyLedger({ ...args, expectedFingerprint }), failWrite: () => { rejectWrite = true } }
}

test('exact migration preserves cents, dates, staff and immutable original snapshot', async () => {
  const s = setup(), preview = await s.preview(), before = structuredClone(s.state().orders[0].transactions)
  assert.equal(preview.status, 'ready'); assert.deepEqual(preview.totals, { incomeTotal: 10.11, expenseTotal: 0.01 })
  const saved = await s.migrate(preview.fingerprint)
  assert.equal(saved.status, 'migrated'); assert.equal(saved.replayed, false)
  assert.deepEqual(s.state().migrations[0].sourceEntries, before)
  assert.deepEqual(s.state().orders[0].transactions, [])
  assert.equal(s.state().orders[0].sharedLocationRevision, 1)
  assert.deepEqual(s.state().transactions.map((r) => r.amount), [10.11, 0.01])
  assert.equal(s.state().transactions[1].staffId, id(2)); assert.equal(s.state().transactions[0].date, before[0].date.toISOString())
})
test('parallel repeat migrates once and replay survives changed order status', async () => {
  const s = setup(), p = await s.preview(), results = await Promise.all([s.migrate(p.fingerprint), s.migrate(p.fingerprint)])
  assert.deepEqual(results.map((r) => r.replayed), [false, true]); assert.equal(s.state().transactions.length, 2)
  s.state().orders[0].status = 'closed'; assert.equal((await s.migrate(p.fingerprint)).replayed, true)
})
test('mixed storage, missing staff, malformed dates/amounts and foreign order cannot migrate', async () => {
  const mutators = [
    (s) => s.transactions.push({ tenantId: 'tenant', orderId: id(1) }),
    (s) => { s.staff[0].tenantId = 'other' },
    ...[null, '2026-02-31', new Date('invalid')].map((value) => (s) => { s.orders[0].transactions[0].date = value }),
    ...[0, -1, 1.001, NaN, '10'].map((value) => (s) => { s.orders[0].transactions[0].amount = value }),
  ]
  for (const mutate of mutators) { const s = setup(); mutate(s.state()); const p = await s.preview(); assert.equal(p.status, 'blocked'); await assert.rejects(s.migrate(p.fingerprint), { status: 409 }); assert.equal(s.state().migrations.length, 0) }
  const s = setup(); s.state().orders[0].tenantId = 'other'; await assert.rejects(s.preview(), { status: 404 })
})
test('changed snapshot/revision and rollback after inserts preserve original ledger', async () => {
  for (const key of ['amount', 'revision']) {
    const s = setup(), p = await s.preview()
    if (key === 'amount') s.state().orders[0].transactions[0].amount = 20
    else s.state().orders[0].sharedLocationRevision = 5
    await assert.rejects(s.migrate(p.fingerprint), { status: 409 }); assert.equal(s.state().transactions.length, 0)
  }
  const s = setup(), p = await s.preview(), before = structuredClone(s.state()); s.failWrite()
  await assert.rejects(s.migrate(p.fingerprint), { status: 409 }); assert.deepEqual(s.state(), before)
})
test('closed/canceled storage conversion is allowed without changing their status', async () => {
  for (const status of ['closed', 'canceled']) { const s = setup(); s.state().orders[0].status = status; await s.migrate((await s.preview()).fingerprint); assert.equal(s.state().orders[0].status, status) }
  const s = setup(); s.state().orders[0].transactions = []; assert.equal((await s.preview()).status, 'empty')
})
