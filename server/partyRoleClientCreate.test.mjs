import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { normalizePhoneNumber } from '../helpers/phoneInput.js'

const source = (await readFile(new URL('../app/api/party/order-options/clients/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
function setup({ duplicate = false } = {}) {
  const permissions = { orders: 'read', 'orders.create': 'edit', 'orders.clientId': 'edit', 'clients.create': 'edit', 'orders.client.name': 'edit', 'orders.client.phone': 'edit', 'orders.client.email': 'read' }
  const context = { tenantId: 'tenant', role: 'performer', staff: { _id: 'staff', tenantId: 'tenant', role: 'performer', status: 'active', positionId: 'position' }, position: { _id: 'position', tenantId: 'tenant', active: true, permissions } }
  const writes = []
  const deps = {
    canPartyAccess, normalizePhoneNumber,
    getPartyRequestContext: async ({ allowLocationOwner }) => { assert.equal(allowLocationOwner, true); return { context } },
    partyError: (status, code) => ({ status, code }),
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    getPartyClientModel: async () => ({ exists: async (filter) => { assert.equal(filter.tenantId, 'tenant'); assert.equal(filter.status.$ne, 'archived'); return duplicate }, create: async (value) => { writes.push(value); return { _id: 'created', ...value } } }),
  }
  const POST = compileFunction(`${source}\nreturn POST`, Object.keys(deps))(...Object.values(deps))
  return { context, writes, request: (body) => POST({ json: async () => body }) }
}

test('position creates a normalized contact for its company without management privileges', async () => {
  const state = setup()
  const result = await state.request({ firstName: ' Анна ', phone: '8 (913) 837-00-20' })
  assert.equal(result.status, 201)
  assert.equal(state.writes[0].tenantId, 'tenant')
  assert.equal(state.writes[0].phone, 79138370020)
  assert.equal(result.body.data.name, 'Анна')
  assert.equal(Object.hasOwn(result.body.data, 'tenantId'), false)
})

test('client creation requires both action and individual field permissions', async () => {
  for (const key of ['clients.create', 'orders.create', 'orders.clientId', 'orders.client.phone']) {
    const state = setup()
    state.context.position.permissions[key] = 'read'
    assert.equal((await state.request({ phone: '89138370020' })).status, 403)
    assert.equal(state.writes.length, 0)
  }
  const state = setup()
  assert.equal((await state.request({ email: 'hidden@example.com' })).status, 403)
})

test('tenant spoofing, incomplete number, invalid name and empty contact cannot be created', async () => {
  for (const body of [{ tenantId: 'other', phone: '89138370020' }, { phone: '123' }, { firstName: 'x'.repeat(121) }, {}]) {
    const state = setup()
    assert.equal((await state.request(body)).status, 400)
    assert.equal(state.writes.length, 0)
  }
})

test('duplicate phone returns a generic conflict without exposing the existing contact', async () => {
  const state = setup({ duplicate: true })
  const result = await state.request({ phone: '89138370020' })
  assert.deepEqual(result, { status: 409, code: 'partycrm_client_phone_exists' })
  assert.equal(state.writes.length, 0)
})
