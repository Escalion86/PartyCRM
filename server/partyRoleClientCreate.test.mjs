import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { normalizePhoneNumber } from '../helpers/phoneInput.js'

const source = (await readFile(new URL('../app/api/party/order-options/clients/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
function setup({ duplicate = false, rows = [], denied = false } = {}) {
  const permissions = { orders: 'read', 'orders.create': 'edit', 'orders.clientId': 'edit', 'clients.create': 'edit', 'orders.client.name': 'edit', 'orders.client.phone': 'edit', 'orders.client.email': 'read' }
  const context = { tenantId: 'tenant', role: 'performer', staff: { _id: 'staff', tenantId: 'tenant', role: 'performer', status: 'active', positionId: 'position' }, position: { _id: 'position', tenantId: 'tenant', active: true, permissions } }
  const writes = []
  const reads = []
  const query = {
    select: (fields) => { reads.at(-1).fields = fields; return query },
    sort: (sort) => { reads.at(-1).sort = sort; return query },
    limit: (limit) => { reads.at(-1).limit = limit; return query },
    lean: async () => rows,
  }
  const deps = {
    canPartyAccess, normalizePhoneNumber,
    getPartyRequestContext: async ({ allowLocationOwner }) => { assert.equal(allowLocationOwner, true); return denied ? { error: { status: 401 } } : { context } },
    partyError: (status, code) => ({ status, code }),
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, headers: options?.headers, body }) },
    getPartyClientModel: async () => ({
      find: (filter) => { reads.push({ filter }); return query },
      exists: async (filter) => { assert.equal(filter.tenantId, 'tenant'); assert.equal(filter.status.$ne, 'archived'); return duplicate },
      create: async (value) => { writes.push(value); return { _id: 'created', ...value } },
    }),
  }
  const { GET, POST } = compileFunction(`${source}\nreturn { GET, POST }`, Object.keys(deps))(...Object.values(deps))
  return { context, writes, reads, request: (body) => POST({ json: async () => body }), search: (q = '') => GET({ url: `https://party.test/api/party/order-options/clients?tenantId=other&q=${encodeURIComponent(q)}` }) }
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

test('client search applies tenant and active filters before its bounded projection', async () => {
  const state = setup({ rows: [{ _id: 'person', firstName: 'Анна', secondName: 'Петрова', phone: 79138370020, email: 'customer@example.com', tenantId: 'tenant' }] })
  const result = await state.search(' Анна  Петрова ')
  const [read] = state.reads
  assert.equal(read.filter.tenantId, 'tenant')
  assert.deepEqual(read.filter.status, { $ne: 'archived' })
  assert.equal(read.limit, 40)
  const name = read.filter.$or[0].$expr.$regexMatch
  assert.ok(new RegExp(name.regex, name.options).test('анна  петрова'))
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  assert.deepEqual(result.body.data, [{ _id: 'person', name: 'Анна Петрова', nameParts: { firstName: 'Анна', secondName: 'Петрова', thirdName: '' }, phone: 79138370020, email: 'customer@example.com' }])
  await state.search('Петрова Анна')
  const surnameFirst = state.reads[1].filter.$or[1].$expr.$regexMatch
  assert.equal(surnameFirst.input.$concat[0].$ifNull[0], '$secondName')
  assert.ok(new RegExp(surnameFirst.regex, surnameFirst.options).test('петрова анна'))
})

test('search guards permissions and avoids search, projection and ordering by hidden fields', async () => {
  const denied = setup({ denied: true })
  assert.equal((await denied.search()).status, 401)
  assert.equal(denied.reads.length, 0)

  const state = setup({ rows: [{ _id: 'person', firstName: 'Скрытое имя', phone: 79138370020, email: 'hidden@example.com' }] })
  Object.assign(state.context.position.permissions, { orders: 'edit', 'orders.create': 'hidden', 'orders.client.name': 'hidden', 'orders.client.email': 'hidden' })
  const result = await state.search('8 (913) 837-00-20')
  assert.deepEqual(result.body.data, [{ _id: 'person', name: 'Контакт', phone: 79138370020 }])
  const [read] = state.reads
  assert.equal(read.fields, '_id phone')
  assert.deepEqual(read.sort, { _id: 1 })
  assert.equal(read.filter.$or.length, 1)
  const phone = read.filter.$or[0].$expr.$regexMatch
  assert.equal(phone.input.$convert.input, '$phone')
  for (const value of ['79138370020', '+7 (913) 837-00-20', '8-913-837-00-20']) assert.ok(new RegExp(phone.regex).test(value))
  assert.deepEqual((await state.search('Скрытое имя')).body.data, [])
  assert.equal(state.reads.length, 1)

  state.context.position.permissions['orders.client.phone'] = 'hidden'
  assert.equal((await state.search()).status, 403)
  state.context.position.permissions['orders.client.phone'] = 'read'
  state.context.position.permissions['orders.clientId'] = 'read'
  assert.equal((await state.search()).status, 403)
  state.context.position.permissions['orders.clientId'] = 'edit'
  state.context.position.permissions.orders = 'read'
  assert.equal((await state.search()).status, 403)
  assert.equal(state.reads.length, 1)
})

test('search treats query punctuation literally and bounds the request before touching the catalog', async () => {
  const state = setup()
  for (const query of ['a'.repeat(121), '\0']) assert.equal((await state.search(query)).status, 400)
  assert.equal(state.reads.length, 0)
  assert.equal((await state.search('.*')).status, 200)
  const [name, surnameFirst, email] = state.reads[0].filter.$or
  assert.equal(name.$expr.$regexMatch.regex, '\\.\\*')
  assert.equal(surnameFirst.$expr.$regexMatch.regex, '\\.\\*')
  assert.equal(email.email.$regex, '\\.\\*')
  assert.equal((await state.search()).status, 200)
  assert.deepEqual(state.reads[1].filter, { tenantId: 'tenant', status: { $ne: 'archived' } })
})
