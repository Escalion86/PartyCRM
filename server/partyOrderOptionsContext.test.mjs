import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canPartyAccess, buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'

const tenantId = 'a'.repeat(24), orderId = 'b'.repeat(24), staffId = 'c'.repeat(24), managerId = 'd'.repeat(24), clientId = 'e'.repeat(24)
const code = (await readFile(new URL('../app/api/party/order-options/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
function setup(grants = {}, patch = {}) {
  const context = { tenantId, role: 'performer', staff: { _id: 'f'.repeat(24), tenantId, status: 'active', role: 'performer', positionId: 'position' }, position: { active: true, permissions: { orders: 'read', 'orders.assignedStaff': 'read', 'orders.client.name': 'read', ...grants }, orderScope: { locationIds: ['own'] } }, company: { _id: tenantId, settings: {} } }
  const order = { _id: orderId, tenantId, locationId: 'own', status: 'active', clientId, assignedStaff: [{ staffId }], responsibleStaffId: managerId, ...patch }
  const filters = [], lookups = []
  let modelCalls = 0
  const q = (value) => ({ select() { return this }, sort() { return this }, limit() { return this }, lean: async () => value })
  const people = [{ _id: staffId, firstName: 'Архивный исполнитель', role: 'performer', status: 'archived', phone: '79990000000' }, { _id: managerId, firstName: 'Менеджер', role: 'performer', status: 'active', phone: '79990000001' }]
  const deps = {
    canPartyAccess, buildPartyOrderAccessFilter,
    isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(id), getPartyRequestContext: async () => ({ context }),
    partyError: (status, code) => ({ status, code }), NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyOrderModel: async () => { modelCalls++; return { findOne(filter) { lookups.push(filter); return q(order) }, find() { assert.fail('a contextual request must not use the first 120 orders') } } },
    getPartyStaffModel: async () => { modelCalls++; return { find(filter) { filters.push(filter); return q(people.filter((person) => !filter._id || filter._id.$in.includes(person._id))) } } },
    getPartyClientModel: async () => { modelCalls++; return { find(filter) { assert.equal(filter.tenantId, tenantId); assert.deepEqual(filter._id.$in, [clientId]); return q([{ _id: clientId, firstName: 'Заказчик', phone: 'private-phone', email: 'private-email' }]) } } },
    getPartyServiceModel: async () => { modelCalls++; return {} }, getPartyLocationModel: async () => { modelCalls++; return {} },
  }
  const GET = new Function(...Object.keys(deps), `${code}\nreturn GET`)(...Object.values(deps))
  return { context, filters, lookups, models: () => modelCalls, request: (id = orderId) => GET({ url: `https://party.test/api/party/order-options?orderId=${id}` }) }
}

test('contextual catalogs resolve an order outside the default list and retain assigned archived names without phone access', async () => {
  const state = setup()
  const result = await state.request()
  assert.equal(result.status, 200)
  assert.deepEqual(state.lookups, [{ _id: orderId, tenantId }])
  assert.deepEqual(state.filters[0]._id.$in, [staffId])
  assert.equal(result.body.data.staff[0].status, 'archived')
  assert.equal(result.body.data.staff[0].name, 'Архивный исполнитель')
  assert.equal(Object.hasOwn(result.body.data.staff[0], 'phone'), false)
  assert.equal(JSON.stringify(result.body).includes('private-phone'), false)
  assert.equal(JSON.stringify(result.body).includes('private-email'), false)
})

test('a visible manager outside the assigned team is resolved only with the manager field grant', async () => {
  const state = setup({ 'orders.responsibleStaffId': 'read', 'staff.phone': 'read' })
  const result = await state.request()
  assert.deepEqual(state.filters[0]._id.$in, [staffId, managerId])
  assert.equal(result.body.data.staff.find((person) => person._id === managerId).phone, '79990000001')
})

test('manager-only access does not disclose the hidden team', async () => {
  const state = setup({ 'orders.assignedStaff': 'hidden', 'orders.responsibleStaffId': 'read' })
  const result = await state.request()
  assert.deepEqual(state.filters[0]._id.$in, [managerId])
  assert.deepEqual(result.body.data.staff.map((person) => person._id), [managerId])
})

test('foreign tenant or revoked order scope cannot enumerate contextual catalogs', async () => {
  for (const patch of [{ tenantId: 'other' }, { locationId: 'other' }]) {
    const state = setup({}, patch)
    assert.equal((await state.request()).status, 404)
    assert.equal(state.filters.length, 0)
  }
})

test('malformed context order is rejected before opening models', async () => {
  const state = setup()
  assert.equal((await state.request('not-an-id')).status, 400)
  assert.equal(state.models(), 0)
})
