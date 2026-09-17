import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import {
  PARTY_OPERATIONAL_PERMISSIONS,
  normalizePartyOperationalPermissions,
  canPartyOperationalPermission,
} from '../helpers/partyOperationalPermissions.js'
const read = async (path) =>
  (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import [\s\S]*? from '[^']+'\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
const source = await read(
  '../app/api/party/staff/[id]/operational-permissions/route.js'
)
const params = { params: { id: 'a'.repeat(24) } }
const setup = ({
  denied = false,
  missing = false,
  role = 'performer',
  race = false,
} = {}) => {
  const calls = []
  const staff = {
    _id: params.params.id,
    role,
    status: 'active',
    operationalPermissions: [],
    permissionRevision: 0,
  }
  const query = (value) => ({ select: () => ({ lean: async () => value }) })
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyRequestContext: async (options) => {
      assert.equal(options.managementOnly, true)
      return denied
        ? { error: { status: 403 } }
        : { context: { tenantId: 'trusted' } }
    },
    getPartyStaffModel: async () => ({
      findOne: (filter) => {
        calls.push(filter)
        return query(missing ? null : staff)
      },
      findOneAndUpdate: (filter, update) => {
        calls.push({ filter, update })
        return query(
          race
            ? null
            : {
                ...staff,
                operationalPermissions: update.$set.operationalPermissions,
                permissionRevision: 1,
              }
        )
      },
    }),
    isValidObjectId: (id) => /^[a-f0-9]{24}$/.test(id || ''),
    parseJsonBody: async (req) => req.body,
    partyError: (status, code) => ({ status, code }),
    PARTY_OPERATIONAL_PERMISSIONS,
    normalizePartyOperationalPermissions,
  }
  return {
    calls,
    api: compileFunction(
      `${source}\nreturn { GET, PATCH }`,
      Object.keys(deps)
    )(...Object.values(deps)),
  }
}
const valid = { permissions: ['inventory.movements'], expectedRevision: 0 }
test('permission endpoint requires company management before reading staff', async () => {
  const s = setup({ denied: true })
  for (const method of ['GET', 'PATCH'])
    assert.equal((await s.api[method]({ body: valid }, params)).status, 403)
  assert.equal(s.calls.length, 0)
})
test('GET safe projection; PATCH tenant scoped role status revision CAS, including legacy revision', async () => {
  const s = setup()
  assert.deepEqual((await s.api.GET({}, params)).body.data, {
    staffId: params.params.id,
    role: 'performer',
    status: 'active',
    permissions: [],
    revision: 0,
  })
  const result = await s.api.PATCH({ body: valid }, params)
  assert.equal(result.body.data.revision, 1)
  const write = s.calls.at(-1)
  assert.deepEqual(write.filter, {
    _id: params.params.id,
    tenantId: 'trusted',
    role: 'performer',
    status: 'active',
    $or: [
      { permissionRevision: 0 },
      { permissionRevision: { $exists: false } },
    ],
  })
  assert.deepEqual(write.update, {
    $set: { operationalPermissions: ['inventory.movements'] },
    $inc: { permissionRevision: 1 },
  })
})
test('reject invalid IDs, foreign staff, roles, revisions and malformed grants', async () => {
  assert.equal(
    (await setup().api.GET({}, { params: { id: 'bad' } })).status,
    400
  )
  assert.equal((await setup({ missing: true }).api.GET({}, params)).status, 404)
  for (const role of ['owner', 'admin', 'location_owner'])
    assert.equal(
      (await setup({ role }).api.PATCH({ body: valid }, params)).status,
      400
    )
  for (const body of [
    null,
    [],
    {},
    { ...valid, tenantId: 'evil' },
    { ...valid, permissions: ['all'] },
    { ...valid, permissions: ['inventory.movements', 'inventory.movements'] },
    { ...valid, expectedRevision: -1 },
    { ...valid, expectedRevision: 0.5 },
  ]) {
    const s = setup()
    assert.equal((await s.api.PATCH({ body }, params)).status, 400)
    assert.equal(s.calls.length, 1)
  }
  assert.equal(
    (
      await setup().api.PATCH(
        { body: { ...valid, expectedRevision: 1 } },
        params
      )
    ).status,
    409
  )
  assert.equal(
    (await setup({ race: true }).api.PATCH({ body: valid }, params)).status,
    409
  )
})
const wrapperSource = await read('./partyInventoryApi.js')
test('inventory wrapper keeps default management guard; explicit permission rechecked every request', async () => {
  const context = {
    tenantId: 'a',
    role: 'performer',
    staff: {
      tenantId: 'a',
      role: 'performer',
      status: 'active',
      operationalPermissions: ['inventory.movements'],
    },
  }
  const guards = []
  const deps = {
    NextResponse: {},
    canPartyOperationalPermission,
    partyError: (status) => ({ status }),
    getPartyRequestContext: async (options) => {
      guards.push(options.managementOnly)
      return options.managementOnly ? { error: { status: 403 } } : { context }
    },
  }
  const wrapper = compileFunction(
    `${wrapperSource}\nreturn inventoryRoute`,
    Object.keys(deps)
  )(...Object.values(deps))
  let calls = 0
  const handler = async () => {
    calls++
    return { status: 200 }
  }
  assert.equal((await wrapper(handler)({})).status, 403)
  const granted = wrapper(handler, 'inventory.movements')
  assert.equal((await granted({})).status, 200)
  context.staff.operationalPermissions = []
  assert.equal((await granted({})).status, 403)
  assert.equal((await wrapper(handler, 'unknown')({})).status, 403)
  assert.equal(calls, 1)
  assert.deepEqual(guards, [true, false, false, false])
})
test('ordinary staff CRUD does not accept operational grant or revision injection', async () => {
  for (const [path, fn] of [
    ['../app/api/party/staff/route.js', 'normalizeStaffPayload'],
    ['../app/api/party/staff/[id]/route.js', 'pickStaffPatch'],
  ]) {
    const raw = await readFile(new URL(path, import.meta.url), 'utf8')
    const start = raw.indexOf(`const ${fn} =`)
    const end = raw.indexOf('\n}', start) + 2
    const code = raw.slice(start, end)
    const pick = compileFunction(`${code}; return ${fn}`, [
      'normalizeText',
      'normalizePhone',
      'normalizeEmail',
    ])(
      (v) => v || '',
      (v) => v || '',
      (v) => v || ''
    )
    const result = pick({
      operationalPermissions: ['inventory.movements'],
      permissionRevision: 99,
    })
    assert.equal(Object.hasOwn(result, 'operationalPermissions'), false)
    assert.equal(Object.hasOwn(result, 'permissionRevision'), false)
  }
})

test('movement route gates both verbs and exposes only operational order/staff projections', async () => {
  const movementSource = await read(
    '../app/api/party/inventory/movements/route.js'
  )
  const queries = []
  const model = (kind) => ({
    exists: async () => true,
    find: (filter) => {
      const call = { kind, filter }
      queries.push(call)
      const chain = {
        sort: () => chain,
        limit: () => chain,
        select: (fields) => {
          call.fields = fields
          return chain
        },
        lean: async () => [],
      }
      return chain
    },
  })
  const gates = []
  let movementArgs
  const deps = {
    parseJsonBody: async (req) => req.body,
    inventoryResponse: (data) => ({ data }),
    inventoryRoute: (handler, permission) => {
      gates.push(permission)
      return handler
    },
    getPartyInventoryHoldingModel: async () => model('holdings'),
    getPartyInventoryMovementModel: async () => model('movements'),
    getPartyInventoryItemModel: async () => model('items'),
    getPartyOrderModel: async () => model('orders'),
    getPartyStaffModel: async () => model('staff'),
    inventoryId: (value) => String(value?._id || value || ''),
    isInventoryId: () => true,
    inventoryValidationError: (message) => new Error(message),
    inventoryPhysicalStock: () => ({}),
    performPartyInventoryMovement: async (args) => {
      movementArgs = args
      return {
        repeated: true,
        movement: {
          _id: 'movement',
          operation: 'issue',
          quantity: 1,
          tenantId: 'trusted',
          payloadHash: 'secret-hash',
          idempotencyKey: 'secret-key',
          futureSensitiveField: 'secret',
        },
      }
    },
    inventoryStaffName: () => 'Сотрудник',
  }
  const api = compileFunction(
    `${movementSource}\nreturn { GET, POST }`,
    Object.keys(deps)
  )(...Object.values(deps))
  assert.deepEqual(gates, ['inventory.movements', 'inventory.movements'])
  const context = { tenantId: 'trusted', staff: { _id: 'actor' } }
  await api.GET({ nextUrl: new URL('http://localhost/') }, context)
  for (const call of queries) assert.equal(call.filter.tenantId, 'trusted')
  assert.equal(
    queries.find((q) => q.kind === 'orders').fields,
    '_id title serviceTitle eventDate status'
  )
  assert.equal(
    queries.find((q) => q.kind === 'staff').fields,
    '_id firstName secondName status'
  )
  assert.doesNotMatch(
    queries.find((q) => q.kind === 'movements').fields,
    /payloadHash|idempotencyKey|client|finance/
  )
  assert.equal(
    queries.find((q) => q.kind === 'items').fields,
    '_id title category unit quantity unavailableQuantity unavailableReason storageLocation status'
  )
  const result = await api.POST(
    { body: { tenantId: 'evil', actorStaffId: 'evil' } },
    context
  )
  assert.deepEqual(result.data, {
    repeated: true,
    movement: { _id: 'movement', operation: 'issue', quantity: 1 },
  })
  assert.equal(movementArgs.tenantId, 'trusted')
  assert.equal(movementArgs.actorStaffId, 'actor')
})
