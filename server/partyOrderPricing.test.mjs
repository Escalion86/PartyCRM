import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { canPartyOperationalPermission } from '../helpers/partyOperationalPermissions.js'

const source = (await readFile(new URL('./partyOrderPricing.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
const id = (n) => String(n).padStart(24, '0')
const match = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some((f) => match(row, f))
  if (key === '$and') return value.every((f) => match(row, f))
  if (value?.$in) return value.$in.includes(row[key])
  if (value?.$lt) return String(row[key]) < value.$lt
  if (value && typeof value === 'object' && '$exists' in value) return (row[key] !== undefined) === value.$exists
  return String(row[key]) === String(value)
})
const context = (role = 'performer', permissions = ['orders.pricing']) => ({ tenantId: 'a', role, staff: { _id: id(8), tenantId: 'a', status: 'active', role, operationalPermissions: permissions } })
const setup = () => {
  const rows = [{ _id: id(1), tenantId: 'a', title: 'Праздник', status: 'active', contractAmount: 100, commercialRevision: 0, updatedAt: 'now', sharedLocationRevision: 0, orderItems: [{ total: 100 }], agreedProposal: { proposalId: id(2) }, client: { phone: 'secret' }, clientPayment: { totalAmount: 100, prepaidAmount: 45, status: 'partial' }, transactions: [{ amount: 45 }], assignedStaff: [{ staffId: id(8), salary: 30 }] }]
  let ctx = context(), race, hookFails = false, writes = 0
  const calls = []
  const query = (value) => ({ select(p) { calls.push(['projection', p]); return this }, sort() { return this }, limit(n) { value = value.slice(0, n); return this }, lean: async () => structuredClone(value) })
  const Orders = {
    find: (f) => { calls.push(['find', f]); return query(rows.filter((r) => match(r, f)).sort((a, b) => b._id.localeCompare(a._id))) },
    findOne: (f) => { calls.push(['findOne', f]); return query(rows.find((r) => match(r, f))) },
    findOneAndUpdate: (f, update) => { if (race) race(rows[0]); const row = rows.find((r) => match(r, f)); if (row) { writes++; for (const [key, value] of Object.entries(update.$set)) { const [field, child] = key.split('.'); if (child) { row[field] ||= {}; row[field][child] = value } else row[field] = value }; row.commercialRevision = (row.commercialRevision || 0) + update.$inc.commercialRevision } return query(row || null) },
  }
  const deps = { NextResponse: { json: (body) => ({ status: 200, ...body }) }, canPartyOperationalPermission, getPartyOrderWriteGuard, getPartyRequestContext: async () => ({ context: ctx }), isValidObjectId: (s) => /^[a-f0-9]{24}$/.test(s), partyError: (status, code, message) => ({ status, code, message }), getPartyOrderModel: async () => Orders, recordPartyOrderAudit: async (v) => { calls.push(['audit', v]); if (hookFails) throw Error('audit') }, syncPartyOrderCalendarAfterCrud: async (v) => { calls.push(['calendar', v]); if (hookFails) throw Error('calendar') }, syncPartyOrderInventory: async (v) => { calls.push(['inventory', v]); if (hookFails) throw Error('secret resource details'); return { hasShortage: false } } }
  const api = compileFunction(`${source}\nreturn {partyOrderPricingRoute,listPartyOrderPricing,getPartyOrderPricing,updatePartyOrderPricing}`, Object.keys(deps))(...Object.values(deps))
  return { api, rows, calls, write: (body = { contractAmount: 200, expectedRevision: 0 }) => api.updatePartyOrderPricing({ context: ctx, orderId: id(1), body }), ctx: (v) => { ctx = v }, race: (v) => { race = v }, failHooks: () => { hookFails = true }, writes: () => writes }
}

test('pricing route checks actual capability, active membership and tenant before handler', async () => {
  const s = setup(); let ran = 0
  const route = s.api.partyOrderPricingRoute(async () => { ran++; return {} })
  for (const c of [context('performer', []), context('location_owner'), { ...context(), staff: { ...context().staff, tenantId: 'b' } }, { ...context(), staff: { ...context().staff, status: 'paused' } }, { ...context('performer', []), user: { role: 'admin' } }]) { s.ctx(c); assert.equal((await route({})).status, 403) }
  assert.equal(ran, 0)
  for (const role of ['owner', 'admin', 'performer']) { s.ctx(context(role)); assert.equal((await route({})).status, 200) }
  assert.equal(ran, 3)
})
test('price change preserves payment and assignments, removes obsolete quotation and increments revision', async () => {
  const s = setup(), before = structuredClone(s.rows[0]), result = await s.write()
  assert.equal(result.contractAmount, 200); assert.equal(result.commercialRevision, 1)
  assert.deepEqual(s.rows[0].orderItems, []); assert.deepEqual(s.rows[0].agreedProposal, {})
  for (const key of ['transactions', 'assignedStaff', 'status', 'client']) assert.deepEqual(s.rows[0][key], before[key])
  assert.deepEqual(s.rows[0].clientPayment, { ...before.clientPayment, totalAmount: 200 })
  for (const key of ['clientPayment', 'transactions', 'assignedStaff', 'client', 'tenantId', 'orderItems', 'agreedProposal']) assert.equal(key in result, false)
  assert.equal(s.calls.filter(([type]) => type === 'audit').length, 1); assert.equal(s.calls.filter(([type]) => type === 'calendar').length, 1)
  assert.equal(s.calls.filter(([type]) => type === 'inventory').length, 1)
})
test('pricing strictly rejects money coercion, missing revision and unrelated fields', async () => {
  const s = setup()
  for (const body of [null, [], {}, { contractAmount: 100 }, { expectedRevision: 0 }, ...[-1, 1.25, '100', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((contractAmount) => ({ contractAmount, expectedRevision: 0 })), ...['status', 'transactions', 'assignedStaff', 'clientPayment', 'tenantId'].map((key) => ({ contractAmount: 100, expectedRevision: 0, [key]: 'malicious' }))]) await assert.rejects(s.write(body), { status: 400 })
  assert.equal(s.writes(), 0)
})
test('legacy null and missing clientPayment accept total without resetting valid payment details', async () => {
  for (const value of [null, undefined]) { const s = setup(); s.rows[0].clientPayment = value; await s.write(); assert.deepEqual(s.rows[0].clientPayment, { totalAmount: 200 }) }
})
test('stale, foreign and closed orders cannot be changed; zero revision mandatory even on no-op', async () => {
  for (const status of ['closed', 'canceled']) { const s = setup(); s.rows[0].status = status; await assert.rejects(s.write(), { status: 409 }); await assert.rejects(s.api.getPartyOrderPricing({ tenantId: 'a', orderId: id(1) }), { status: 409 }) }
  const s = setup(); await assert.rejects(s.api.getPartyOrderPricing({ tenantId: 'b', orderId: id(1) }), { status: 404 })
  s.rows[0].commercialRevision = 1; await assert.rejects(s.write({ contractAmount: 100, expectedRevision: 0 }), { status: 409 })
  s.rows[0].tenantId = 'b'; await assert.rejects(s.write(), { status: 404 })
})
test('no-op keeps quotation, does not write or invoke hooks; successful write tolerates hook failures', async () => {
  const s = setup(); const before = structuredClone(s.rows[0]); await s.write({ contractAmount: 100, expectedRevision: 0 }); assert.deepEqual(s.rows[0], before); assert.equal(s.writes(), 0)
  s.failHooks(); const saved = await s.write(); assert.equal(saved.contractAmount, 200); assert.equal(saved.warnings.length, 3); assert.equal(saved.warnings.join(' ').includes('secret'), false)
})
test('competing full editor, status and shared booking changes fail compare-and-swap', async () => {
  for (const mutation of [(r) => { r.commercialRevision++ }, (r) => { r.updatedAt = 'later' }, (r) => { r.sharedLocationRevision++ }, (r) => { r.status = 'closed' }]) { const s = setup(); s.race(mutation); await assert.rejects(s.write(), { status: 409 }); assert.equal(s.rows[0].contractAmount, 100) }
})
test('list has tenant/open filters, stable cursor pagination and safe response', async () => {
  const s = setup(); for (let i = 2; i < 60; i++) s.rows.push({ ...s.rows[0], _id: id(i) }); s.rows.push({ ...s.rows[0], _id: id(60), tenantId: 'b' }, { ...s.rows[0], _id: id(61), status: 'closed' })
  const first = await s.api.listPartyOrderPricing({ tenantId: 'a' }); assert.equal(first.orders.length, 50); assert.equal(first.orders[0]._id, id(59)); assert.equal(first.nextCursor, id(10)); assert.equal('client' in first.orders[0], false)
  const next = await s.api.listPartyOrderPricing({ tenantId: 'a', cursor: first.nextCursor }); assert.equal(next.orders.length, 9); assert.equal(next.nextCursor, null)
  await assert.rejects(s.api.listPartyOrderPricing({ tenantId: 'a', cursor: 'invalid' }), { status: 400 })
  assert.ok(s.calls.filter(([type]) => type === 'find').every(([, f]) => f.tenantId === 'a'))
})

test('actual pricing endpoints bind authenticated tenant, awaited params and strict PATCH body', async () => {
  const s = setup()
  const detailSource = (await readFile(new URL('../app/api/party/orders/[id]/pricing/route.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
  const detail = compileFunction(`${detailSource}\nreturn {GET,PATCH}`, ['parseJsonBody', 'getPartyOrderPricing', 'partyOrderPricingRoute', 'updatePartyOrderPricing'])(async (req) => req.json(), s.api.getPartyOrderPricing, s.api.partyOrderPricingRoute, s.api.updatePartyOrderPricing)
  const params = { params: Promise.resolve({ id: id(1) }) }
  assert.equal((await detail.GET({}, params)).data._id, id(1))
  assert.equal((await detail.PATCH({ json: async () => ({ contractAmount: 300, expectedRevision: 0 }) }, params)).data.contractAmount, 300)
  assert.equal((await detail.PATCH({ json: async () => ({ contractAmount: 400, expectedRevision: 0 }) }, params)).status, 409)
  s.ctx({ ...context(), tenantId: 'b', staff: { ...context().staff, tenantId: 'b' } })
  assert.equal((await detail.GET({}, params)).status, 404)
  s.ctx(context('performer', [])); assert.equal((await detail.GET({}, params)).status, 403)
  s.ctx(context())
  const listSource = (await readFile(new URL('../app/api/party/order-pricing/route.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '').replaceAll('export const ', 'const ')
  const GET = compileFunction(`${listSource}\nreturn GET`, ['listPartyOrderPricing', 'partyOrderPricingRoute'])(s.api.listPartyOrderPricing, s.api.partyOrderPricingRoute)
  assert.equal((await GET({ nextUrl: new URL('https://example.test/api/party/order-pricing') })).data.orders.length, 1)
  assert.equal((await GET({ nextUrl: new URL('https://example.test/api/party/order-pricing?cursor=broken') })).status, 400)
})
