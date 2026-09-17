import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { createHash } from 'node:crypto'

const createSource = (await readFile(new URL('./partyGroupPayments.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const source = (await readFile(new URL('./partyGroupPaymentCorrections.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const id = (n) => String(n).padStart(24, '0')
const base = () => ({ idempotencyKey: '9b861a3a-bba8-41bd-9639-021720497c51', expectedRevision: 3, amount: 20.33, allocations: [{ orderId: id(1), amount: 10.11 }, { orderId: id(2), amount: 10.22 }], date: '2026-09-17', paymentMethod: 'transfer', category: 'deposit', comment: ' Поступление ' })
const setup = () => {
  let state = { orders: [1, 2, 3].map((n) => ({ _id: id(n), tenantId: 'tenant', partyEventGroupId: id(9), title: `Часть ${n}`, status: 'active', transactions: [] })), groups: [{ _id: id(9), tenantId: 'tenant', revision: 3 }], payments: [], transactions: [], corrections: [] }
  let session, serial = Promise.resolve(), next = 20, rejectWrite = false
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((clause) => matches(row, clause))
    if (key === 'allocations.orderId') return row.allocations.some((part) => part.orderId === value)
    if (value?.$exists !== undefined) return (row[key] !== undefined) === value.$exists
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
      if (rejectWrite && table === 'orders') return { matchedCount: 0 }
      const row = state[table].find((item) => matches(item, filter))
      if (!row) return { matchedCount: 0 }
      Object.assign(row, update.$set)
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value
      return { matchedCount: 1 }
    },
  })
  const deps = { createHash, Types: { ObjectId: class { constructor() { this.value = id(next++) } toString() { return this.value } } }, getPartyGroupPaymentModel: async () => model('payments'), getPartyGroupPaymentCorrectionModel: async () => model('corrections'), getPartyEventGroupModel: async () => model('groups'), getPartyOrderModel: async () => model('orders'), getPartyTransactionModel: async () => model('transactions'), withPartyFinancialTransaction: (tenantId, callback) => {
    assert.equal(tenantId, 'tenant')
    const operation = serial.then(async () => { const old = structuredClone(state); session = Symbol('session'); try { return await callback(session) } catch (error) { state = old; throw error } finally { session = null } })
    serial = operation.catch(() => {}); return operation
  } }
  const api = compileFunction(`${createSource}\nreturn {createPartyGroupPayment,partyGroupPaymentCents,partyGroupPaymentReceipt}`, Object.keys(deps))(...Object.values(deps))
  const correctionDeps = {...deps, ...api}
  const correction = compileFunction(`${source}\nreturn {correctPartyGroupPayment,normalizePartyGroupPaymentCorrection}`, Object.keys(correctionDeps))(...Object.values(correctionDeps))
  return { api, correction, state: () => state, failWrite: () => { rejectWrite = true }, save: (body = base()) => api.createPartyGroupPayment({ tenantId: 'tenant', orderId: id(1), body }) }
}

const corrected = () => ({idempotencyKey:'9b861a3a-bba8-41bd-9639-021720497c52', expectedPaymentRevision:1, reason:'Correct allocation', allocations:[{orderId:id(1),amount:12},{orderId:id(2),amount:8.33}]})
const correct = (s, payment, body = corrected()) => s.correction.correctPartyGroupPayment({tenantId:'tenant',orderId:id(1),paymentId:payment._id,body,actor:{actorStaffId:id(70),actorName:'Manager'}})

test('correction retains ledger IDs and total with immutable reason and actor history', async () => {
 const s=setup(), {payment}=await s.save(), ids=s.state().transactions.map(row=>row._id)
 const result=await correct(s,payment)
 assert.equal(result.payment.revision,2); assert.deepEqual(s.state().transactions.map(row=>row._id),ids)
 assert.deepEqual(s.state().transactions.map(row=>row.amount),[12,8.33])
 assert.equal(result.payment.history[0].reason,'Correct allocation'); assert.equal(result.payment.history[0].actorStaffId,id(70))
 assert.deepEqual(result.payment.history[0].before.map(row=>row.amount),[10.11,10.22])
 assert.equal(s.state().corrections.length,1)
})
test('same-key parallel retries write once and return original snapshot after later correction', async () => {
 const s=setup(), {payment}=await s.save()
 const results=await Promise.all([correct(s,payment),correct(s,payment)])
 assert.deepEqual(results.map(row=>row.replayed),[false,true])
 await correct(s,payment,{...corrected(),idempotencyKey:'9b861a3a-bba8-41bd-9639-021720497c53',expectedPaymentRevision:2,allocations:[{orderId:id(1),amount:11},{orderId:id(2),amount:9.33}]})
 const retry=await correct(s,payment); assert.equal(retry.payment.revision,2); assert.equal(s.state().payments[0].revision,3)
 await assert.rejects(correct(s,payment,{...corrected(),reason:'Other'}),{status:409})
})
test('closed missing foreign and diverged journal reject without changes',async()=>{
 for (const change of [s=>{s.state().orders[1].status='closed'},s=>{s.state().orders[1].tenantId='other'},s=>{s.state().orders.pop();s.state().orders.pop()},s=>{s.state().transactions[1].amount=123},s=>{s.state().transactions[1].category='refund'}]) {
 const s=setup(),{payment}=await s.save();change(s);const before=structuredClone(s.state())
 await assert.rejects(correct(s,payment),{status:409});assert.deepEqual(s.state(),before)
 }
})
test('unlinked original parts remain correctable but stale version and changed set reject',async()=>{
 const s=setup(),{payment}=await s.save();s.state().orders[1].partyEventGroupId=null
 await correct(s,payment)
 await assert.rejects(correct(s,payment,{...corrected(),idempotencyKey:'9b861a3a-bba8-41bd-9639-021720497c53'}),{status:409})
 const t=setup(),r=await t.save()
 await assert.rejects(correct(t,r.payment,{...corrected(),allocations:[{orderId:id(1),amount:12},{orderId:id(3),amount:8.33}]}),{status:400})
})
test('rejects malformed precision duplicate IDs total mismatch and unchanged allocation',async()=>{
 const s=setup(),{payment}=await s.save()
 for(const override of [{reason:''},{reason:'x'.repeat(1001)},{expectedPaymentRevision:0},{idempotencyKey:'bad'},{allocations:[{orderId:id(1),amount:1.001},{orderId:id(2),amount:19.33}]},{allocations:[{orderId:id(1),amount:12},{orderId:id(1),amount:8.33}]},{allocations:[{orderId:id(1),amount:12},{orderId:id(2),amount:8.32}]},{allocations:base().allocations}]) await assert.rejects(correct(s,payment,{...corrected(),...override}),{status:400})
 assert.equal(s.state().corrections.length,0)
})

test('failed order write rolls back all already changed incomes and history',async()=>{
 const s=setup(),{payment}=await s.save(),before=structuredClone(s.state());s.failWrite()
 await assert.rejects(correct(s,payment),{status:409});assert.deepEqual(s.state(),before)
})

