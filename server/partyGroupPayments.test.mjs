import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { createHash } from 'node:crypto'

const source = (await readFile(new URL('./partyGroupPayments.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const id = (n) => String(n).padStart(24, '0')
const base = () => ({ idempotencyKey: '9b861a3a-bba8-41bd-9639-021720497c51', expectedRevision: 3, amount: 20.33, allocations: [{ orderId: id(1), amount: 10.11 }, { orderId: id(2), amount: 10.22 }], date: '2026-09-17', paymentMethod: 'transfer', category: 'deposit', comment: ' Поступление ' })
const setup = () => {
  let state = { orders: [1, 2, 3].map((n) => ({ _id: id(n), tenantId: 'tenant', partyEventGroupId: id(9), title: `Часть ${n}`, status: 'active', transactions: [] })), groups: [{ _id: id(9), tenantId: 'tenant', revision: 3 }], payments: [], transactions: [] }
  let session, serial = Promise.resolve(), next = 20, rejectWrite = false
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((clause) => matches(row, clause))
    if (key === 'allocations.orderId') return row.allocations.some((part) => part.orderId === value)
    if (value?.$in) return value.$in.includes(String(row[key]))
    return String(row[key]) === String(value)
  })
  const query = (read) => {
    let usedSession
    return { session(value) { usedSession = value; return this }, select() { return this }, sort() { return this }, limit() { return this }, async lean() { if (session) assert.equal(usedSession, session); return structuredClone(read()) } }
  }
  const model = (table) => ({
    init: async () => {},
    findOne: (filter) => { assert.equal(filter.tenantId, 'tenant'); return query(() => state[table].find((row) => matches(row, filter))) },
    find: (filter) => { assert.equal(filter.tenantId, 'tenant'); return query(() => state[table].filter((row) => matches(row, filter))) },
    async create(rows, options) { assert.equal(options.session, session); rows = rows.map((row) => ({ ...row, _id: String(row._id), ...(row.allocations ? { allocations: row.allocations.map((part) => ({ ...part, transactionId: String(part.transactionId) })) } : {}) })); state[table].push(...rows); return rows },
    async updateOne(filter, update, options) {
      assert.equal(options.session, session); assert.equal(filter.tenantId, 'tenant')
      if (rejectWrite) return { matchedCount: 0 }
      const row = state[table].find((item) => matches(item, filter))
      if (!row) return { matchedCount: 0 }
      Object.assign(row, update.$set)
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value
      return { matchedCount: 1 }
    },
  })
  const deps = { createHash, Types: { ObjectId: class { constructor() { this.value = id(next++) } toString() { return this.value } } }, getPartyGroupPaymentModel: async () => model('payments'), getPartyEventGroupModel: async () => model('groups'), getPartyOrderModel: async () => model('orders'), getPartyTransactionModel: async () => model('transactions'), withPartyFinancialTransaction: (tenantId, callback) => {
    assert.equal(tenantId, 'tenant')
    const operation = serial.then(async () => { const old = structuredClone(state); session = Symbol('session'); try { return await callback(session) } catch (error) { state = old; throw error } finally { session = null } })
    serial = operation.catch(() => {}); return operation
  } }
  const api = compileFunction(`${source}\nreturn {normalizePartyGroupPayment,createPartyGroupPayment,listPartyGroupPayments}`, Object.keys(deps))(...Object.values(deps))
  return { api, state: () => state, failWrite: () => { rejectWrite = true }, save: (body = base()) => api.createPartyGroupPayment({ tenantId: 'tenant', orderId: id(1), body }) }
}

test('writes only allocated incomes with exact total and receipt under one session', async () => {
  const s = setup(), result = await s.save()
  assert.equal(result.replayed, false)
  assert.equal(s.state().transactions.length, 2)
  assert.deepEqual(s.state().transactions.map((row) => row.amount), [10.11, 10.22])
  assert.ok(s.state().transactions.every((row) => String(row.groupPaymentId) === result.payment._id && row.type === 'income'))
  assert.equal(s.state().payments.length, 1)
  assert.equal(s.state().orders[0].sharedLocationRevision, 1)
  assert.equal(s.state().orders[1].sharedLocationRevision, 1)
  assert.equal(s.state().orders[2].sharedLocationRevision, undefined)
  assert.equal(result.payment.comment, 'Поступление')
  assert.equal('requestHash' in result.payment, false)
})
test('same receipt retries even after group/status changes; different payload rejects', async () => {
  const s = setup(), first = await s.save()
  s.state().orders[0].status = 'closed'; s.state().orders[0].partyEventGroupId = null
  const second = await s.save({ ...base(), allocations: base().allocations.reverse() })
  assert.equal(second.replayed, true); assert.equal(second.payment._id, first.payment._id)
  await assert.rejects(s.save({ ...base(), comment: 'Different' }), { status: 409 })
  assert.equal(s.state().transactions.length, 2)
})
test('parallel same-key requests serialize into a single payment', async () => {
  const s = setup(), results = await Promise.all([s.save(), s.save()])
  assert.deepEqual(results.map((row) => row.replayed), [false, true])
  assert.equal(s.state().transactions.length, 2)
})
test('failed member write rolls back newly inserted transactions and receipt', async () => {
  const s = setup(), before = structuredClone(s.state()); s.failWrite()
  await assert.rejects(s.save(), { status: 409 }); assert.deepEqual(s.state(), before)
})
test('foreign tenant/group, canceled, closed or stale revision cannot receive payment', async () => {
  for (const [key, value] of [['tenantId', 'other'], ['partyEventGroupId', id(8)], ['status', 'canceled'], ['status', 'closed']]) {
    const s = setup(); s.state().orders[1][key] = value
    await assert.rejects(s.save(), { status: 409 }); assert.equal(s.state().transactions.length, 0)
  }
  await assert.rejects(setup().save({ ...base(), expectedRevision: 2 }), { status: 409 })
})
test('embedded-only legacy ledger blocks new persisted income', async () => {
  const s = setup(); s.state().orders[0].transactions = [{ type: 'income', amount: 99 }]
  await assert.rejects(s.save(), /старые встроенные платежи/); assert.equal(s.state().transactions.length, 0)
  s.state().transactions.push({ _id: id(50), orderId: id(1), tenantId: 'tenant', amount: 99 })
  await s.save(); assert.equal(s.state().transactions.length, 3)
})
test('history retains receipts after unlink and hides foreign receipts', async () => {
  const s = setup(); await s.save(); s.state().orders[0].partyEventGroupId = null
  s.state().payments.push({ ...s.state().payments[0], tenantId: 'other' })
  const result = await s.api.listPartyGroupPayments({ tenantId: 'tenant', orderId: id(1) })
  assert.equal(result.payments.length, 1); assert.equal(result.payments[0].allocations.length, 2)
})
test('rejects malformed values, sub-ruble slices, duplicate IDs and mismatched cents', () => {
  const { normalizePartyGroupPayment: parse } = setup().api
  for (const amount of [0, -1, 0.99, 20.331, NaN, Infinity, '20.33', 1e30]) assert.throws(() => parse({ ...base(), amount }), { status: 400 })
  for (const override of [{ allocations: [base().allocations[0]] }, { allocations: [base().allocations[0], base().allocations[0]] }, { amount: 20.34 }, { date: '2026-02-30' }, { date: 'yesterday' }, { expectedRevision: 0 }, { idempotencyKey: 'bad' }, { paymentMethod: 'other' }, { category: 'refund' }, { comment: 'x'.repeat(1001) }]) assert.throws(() => parse({ ...base(), ...override }), { status: 400 })
})
