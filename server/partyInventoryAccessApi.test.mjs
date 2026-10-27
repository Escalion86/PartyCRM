import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import * as access from '../helpers/partyInventoryAccess.js'
import * as permissions from '../helpers/partyRolePermissions.js'
import * as inventory from '../helpers/partyInventory.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { serializePartyOrderPreparation, arePartyPreparationItemsEqual } from '../helpers/partyOrderPreparation.js'
import { buildPerformerPreparationView } from './partyOrderPreparation.js'
import { validateInventoryStockEdit } from '../helpers/partyInventoryMovements.js'
import { createHash } from 'node:crypto'
import { normalizeInventoryMovement } from '../helpers/partyInventoryMovements.js'

const tenantId = '507f1f77bcf86cd799439001'
const orderId = '507f1f77bcf86cd799439002'
const otherId = '507f1f77bcf86cd799439003'
const staffId = '507f1f77bcf86cd799439004'
const locationId = '507f1f77bcf86cd799439005'
const resourceId = '507f1f77bcf86cd799439006'
const actor = (grants = {}) => ({ tenantId, role: 'performer', company: {},
  staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId: 'position' },
  position: { _id: 'position', tenantId, active: true, permissions: { orders: 'read', inventory: 'read', ...grants }, orderScope: { stageIds: ['preparation'], locationIds: [locationId], includeUnlocated: false } },
})
const own = () => ({ _id: orderId, tenantId, title: 'Свой праздник', status: 'active', workflowStageId: 'preparation', locationId,
  assignedStaff: [], preparation: { enabled: false, revision: 0, items: [] }, updatedAt: '2026-10-27T00:00:00.000Z' })
const query = value => ({ lean: async () => structuredClone(value), session() { return this }, select() { return this }, sort() { return this }, limit() { return this } })
const json = (body, options = {}) => new Response(JSON.stringify(body), { status: options.status || 200, headers: { 'content-type': 'application/json' } })
const partyError = (status, code, message) => json({ success: false, error: { code, message } }, { status })
const raw = async file => readFile(new URL(file, import.meta.url), 'utf8')
const strip = source => source.replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace(/^export /gm, '')
const load = async (file, deps, exports) => compileFunction(strip(await raw(file)) + '\nreturn {' + exports + '}', Object.keys(deps))(...Object.values(deps))
const models = (orders = [own()]) => ({
  findOne(filter) { assert.equal(filter.tenantId, tenantId); return query(orders.find(order => String(order._id) === String(filter._id)) || null) },
  find(filter) { assert.equal(filter.tenantId, tenantId); return query(orders.filter(order => !filter._id?.$in || filter._id.$in.map(String).includes(String(order._id)))) },
})
async function setup(context, orders = [own()]) {
  const Orders = models(orders)
  const deps = { ...access, ...permissions, ...inventory, NextResponse: { json }, partyError,
    getPartyRequestContext: async options => { assert.notEqual(options.managementOnly, true); assert.equal(options.allowLocationOwner, true); return { context } },
    parseJsonBody: async req => req.body, getPartyOrderModel: async () => Orders,
  }
  return { deps, Orders, ...(await load('./partyInventoryApi.js', deps, 'inventoryRoute, inventoryResponse')) }
}

test('catalog read cannot POST/edit; wrapper rechecks grants and hides stock for each response', async () => {
  const context = actor({ 'inventory.catalog': 'read' })
  const api = await setup(context)
  let writes = 0
  const read = api.inventoryRoute(async () => api.inventoryResponse({ items: [{ _id: resourceId, title: 'Костюм', unit: 'шт.', quantity: 9, freeQuantity: 7 }] }))
  const response = await read({ method: 'GET' })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.items, [{ _id: resourceId, title: 'Костюм', unit: 'шт.' }])
  const write = api.inventoryRoute(async () => { writes++; return api.inventoryResponse({ saved: true }) }, { resource: 'inventory.catalog', action: 'edit' })
  assert.equal((await write({ method: 'POST' })).status, 403)
  context.position.permissions['inventory.catalog'] = 'hidden'
  assert.equal((await read({ method: 'GET' })).status, 403)
  assert.equal(writes, 0)
})

test('availability POST is a scoped read and redacts conflicting inaccessible order identities and counts', async () => {
  const hidden = { ...own(), _id: otherId, title: 'Секретный клиент', locationId: otherId }
  const api = await setup(actor({ 'inventory.catalog': 'read', 'inventory.reservations': 'read' }), [own(), hidden])
  let calculations = 0
  const route = await load('../app/api/party/inventory/availability/route.js', { ...api.deps, ...api,
    preparePartyInventory: async () => { calculations++; return { hasShortage: true, warnings: [{ resourceId, title: 'Костюм', quantity: 20, shortage: 3, needed: 4, conflicts: [{ orderId: otherId, orderTitle: hidden.title, quantity: 10, serviceId: otherId }] }] } },
  }, 'POST')
  const response = await route.POST({ method: 'POST', body: { orderId } })
  assert.equal(response.status, 200)
  const data = (await response.json()).data
  assert.equal(calculations, 1)
  assert.equal(Object.hasOwn(data.warnings[0], 'quantity'), false)
  assert.equal(Object.hasOwn(data.warnings[0], 'shortage'), false)
  assert.deepEqual(data.warnings[0].conflicts, [{ unavailableOrder: true, orderTitle: 'Занято недоступным заказом' }])
  assert.equal(JSON.stringify(data).includes(otherId), false)
})

test('availability read rejects same-tenant orders outside stage/location scope before calculation', async () => {
  const api = await setup(actor({ 'inventory.reservations': 'read' }), [{ ...own(), workflowStageId: 'private-stage' }])
  let calls = 0
  const route = await load('../app/api/party/inventory/availability/route.js', { ...api.deps, ...api, preparePartyInventory: async () => { calls++; return {} } }, 'POST')
  assert.equal((await route.POST({ method: 'POST', body: { orderId } })).status, 404)
  assert.equal((await route.POST({ method: 'POST', body: {} })).status, 403)
  assert.equal(calls, 0)
})

test('reservation reader cannot PUT or DELETE and cannot GET a same-tenant inaccessible order', async () => {
  const api = await setup(actor({ 'inventory.reservations': 'read' }), [{ ...own(), locationId: otherId }])
  let writes = 0, reads = 0
  const route = await load('../app/api/party/inventory/reservations/[orderId]/route.js', { ...api.deps, ...api,
    getPartyInventoryReservationModel: async () => ({ findOne: () => { reads++; return query(null) } }),
    reservePartyOrderInventory: async () => { writes++; return {} }, releasePartyOrderInventory: async () => { writes++; return {} },
  }, 'GET, PUT, DELETE')
  const params = { params: { orderId } }
  assert.equal((await route.GET({ method: 'GET' }, params)).status, 404)
  assert.equal((await route.PUT({ method: 'PUT', body: {} }, params)).status, 403)
  assert.equal((await route.DELETE({ method: 'DELETE' }, params)).status, 403)
  assert.equal(reads, 0)
  assert.equal(writes, 0)
})

test('reservation mutation passes trusted actor into transaction and never accepts tenant from body', async () => {
  const context = actor({ 'inventory.reservations': 'edit' })
  const api = await setup(context)
  let trusted
  const route = await load('../app/api/party/inventory/reservations/[orderId]/route.js', { ...api.deps, ...api,
    reservePartyOrderInventory: async args => { trusted = args; return { saved: true } },
  }, 'PUT')
  assert.equal((await route.PUT({ method: 'PUT', body: { tenantId: otherId, serviceItems: [], confirmShortage: true } }, { params: { orderId } })).status, 200)
  assert.equal(trusted.tenantId, tenantId)
  assert.equal(trusted.context, context)
  assert.equal(trusted.staffId, staffId)
})

test('reservation transaction rechecks the complete order scope after the outside precheck', async () => {
  const source = await raw('./partyInventory.js')
  const start = source.indexOf('export const reservePartyOrderInventory')
  const end = source.indexOf('export const releasePartyOrderInventory', start)
  const context = actor({ 'inventory.reservations': 'edit' })
  let calculations = 0, writes = 0
  const deps = { ...inventory, ...access,
    getPartyInventoryReservationModel: async () => ({ init: async () => {}, findOne: () => { writes++; return query(null) } }),
    getPartyOrderModel: async () => models([{ ...own(), workflowStageId: 'private-stage' }]),
    withPartyInventoryTransaction: async (tenant, callback) => { assert.equal(tenant, tenantId); return callback('trusted-session') },
    preparePartyInventory: async () => { calculations++; return {} },
  }
  const reserve = compileFunction(strip(source.slice(start, end)) + '\nreturn reservePartyOrderInventory', Object.keys(deps))(...Object.values(deps))
  await assert.rejects(reserve({ tenantId, orderId, context, serviceItems: [] }), { status: 404 })
  assert.equal(calculations, 0)
  assert.equal(writes, 0)
})

test('stock-denied movement error does not reveal the exact remaining quantity', async () => {
  const api = await setup(actor({ 'inventory.movements': 'edit' }))
  const route = api.inventoryRoute(async () => { throw inventory.inventoryValidationError('На складе доступно 17; нельзя выдать 20', 409) }, 'inventory.movements')
  const response = await route({ method: 'POST' })
  assert.equal(response.status, 409)
  assert.equal((await response.text()).includes('17'), false)
})

test('catalog-only editor changes labels without resetting private stock and cannot forge stock updates', async () => {
  const context = actor({ 'inventory.catalog': 'edit' })
  const api = await setup(context)
  let current = { _id: resourceId, tenantId, title: 'Костюм', unit: 'шт.', quantity: 9, unavailableQuantity: 2, storageLocation: 'Склад', unavailableReason: 'Ремонт', status: 'active' }
  let writes = 0
  const route = await load('../app/api/party/inventory/[id]/route.js', { ...api.deps, ...api, validateInventoryStockEdit,
    getPartyInventoryItemModel: async () => ({ findOne: criteria => { assert.equal(criteria.tenantId, tenantId); return query(current) },
      findOneAndUpdate: (criteria, update) => { assert.equal(criteria.tenantId, tenantId); writes++; current = { ...current, ...update.$set }; return query(current) },
    }),
    getPartyInventoryHoldingModel: async () => ({ find: criteria => { assert.equal(criteria.tenantId, tenantId); return query([]) } }),
    withPartyInventoryTransaction: async (tenant, callback) => { assert.equal(tenant, tenantId); return callback('session') },
    refreshPartyInventoryResourceWarnings: async () => {},
  }, 'PATCH')
  const params = { params: { id: resourceId } }
  const renamed = await route.PATCH({ method: 'PATCH', body: { title: 'Новый костюм' } }, params)
  assert.equal(renamed.status, 200)
  assert.equal(current.quantity, 9)
  assert.equal(current.unavailableQuantity, 2)
  assert.equal(Object.hasOwn((await renamed.json()).data, 'quantity'), false)
  assert.equal((await route.PATCH({ method: 'PATCH', body: { quantity: 999 } }, params)).status, 403)
  assert.equal(writes, 1)
  context.position.permissions['inventory.catalog'] = 'read'
  assert.equal((await route.PATCH({ method: 'PATCH', body: { title: 'Подмена' } }, params)).status, 403)
  assert.equal(writes, 1)
})

test('movement replay cannot reveal an old receipt after the order leaves the actor scope', async () => {
  const source = await raw('./partyInventoryMovements.js')
  const functionSource = source.slice(source.indexOf('export const performPartyInventoryMovement'))
  let receiptReads = 0
  const deps = { ...inventory, ...access, normalizeInventoryMovement, crypto: { createHash },
    getPartyInventoryItemModel: async () => ({}), getPartyInventoryHoldingModel: async () => ({ init: async () => {} }),
    getPartyInventoryMovementModel: async () => ({ init: async () => {}, findOne: () => { receiptReads++; return query({ orderTitle: 'Старый закрытый доступ' }) } }),
    getPartyStaffModel: async () => ({}), getPartyOrderModel: async () => models([{ ...own(), workflowStageId: 'private-stage' }]),
    withPartyInventoryTransaction: async (_tenant, callback) => callback('session'),
  }
  const perform = compileFunction(strip(functionSource) + '\nreturn performPartyInventoryMovement', Object.keys(deps))(...Object.values(deps))
  await assert.rejects(perform({ tenantId, actorStaffId: staffId, context: actor({ 'inventory.movements': 'edit' }),
    body: { operation: 'issue', resourceId, orderId, toStaffId: staffId, quantity: 1, idempotencyKey: 'stable-request-key-123' },
  }), { status: 404 })
  assert.equal(receiptReads, 0)
})

async function prepSetup(context, { current = own(), race = false } = {}) {
  let writes = 0, audits = 0, filter
  const Orders = { findOne: criteria => { assert.equal(criteria.tenantId, tenantId); return query(current) },
    findOneAndUpdate: (criteria, update) => {
      filter = criteria
      assert.equal(criteria.tenantId, tenantId)
      if (race) return query(null)
      writes++
      return query({ ...current, ...update.$set })
    },
  }
  const deps = { ...permissions, getPartyOrderWriteGuard, serializePartyOrderPreparation, arePartyPreparationItemsEqual, ensurePartyOrderTasks: async () => {}, NextResponse: { json }, partyError,
    getPartyRequestContext: async options => { assert.notEqual(options.managementOnly, true); assert.equal(options.allowLocationOwner, true); return { context } },
    isValidObjectId: inventory.isInventoryId, parseJsonBody: async req => req.body, getPartyOrderModel: async () => Orders,
    normalizePartyOrderPreparation: async ({ input }) => ({ ...input, revision: 1 }), recordPartyOrderAudit: async () => { audits++ },
  }
  return { ...(await load('../app/api/party/orders/[id]/preparation/route.js', deps, 'GET, PATCH')), writes: () => writes, audits: () => audits, filter: () => filter }
}

test('preparation read grant works for a custom performer position, while PATCH is denied', async () => {
  const api = await prepSetup(actor({ 'orders.preparation': 'read' }))
  assert.equal((await api.GET({ method: 'GET' }, { params: { id: orderId } })).status, 200)
  assert.equal((await api.PATCH({ method: 'PATCH', body: {} }, { params: { id: orderId } })).status, 403)
  assert.equal(api.writes(), 0)
})

test('preparation guards tenant and full stage/location scope before showing data or normalizing input', async () => {
  for (const current of [{ ...own(), tenantId: otherId }, { ...own(), workflowStageId: 'private-stage' }, { ...own(), locationId: otherId }]) {
    const api = await prepSetup(actor({ 'orders.preparation': 'edit' }), { current })
    const params = { params: { id: orderId } }
    assert.equal((await api.GET({ method: 'GET' }, params)).status, 404)
    assert.equal((await api.PATCH({ method: 'PATCH', body: { expectedRevision: 0, preparation: {} } }, params)).status, 404)
    assert.equal(api.writes(), 0)
  }
})

test('preparation write preserves separate revision, order state and scope CAS without overwriting OR predicates', async () => {
  const context = actor({ 'orders.preparation': 'edit' })
  const api = await prepSetup(context)
  const response = await api.PATCH({ method: 'PATCH', body: { expectedRevision: 0, preparation: { enabled: false, items: [] } } }, { params: { id: orderId } })
  assert.equal(response.status, 200)
  assert.equal(api.writes(), 1)
  assert.equal(api.audits(), 1)
  assert.equal(api.filter().$and.length, 3)
  assert.equal(api.filter().$and[0].updatedAt, own().updatedAt)
  assert.deepEqual(api.filter().$and[1].$or, [{ 'preparation.revision': 0 }, { 'preparation.revision': { $exists: false } }])
  assert.deepEqual(api.filter().$and[2], permissions.buildPartyOrderAccessFilter(context))
})

test('concurrent scope/revision change returns 409 without a committed preparation write or audit', async () => {
  const api = await prepSetup(actor({ 'orders.preparation': 'edit' }), { race: true })
  const response = await api.PATCH({ method: 'PATCH', body: { expectedRevision: 0, preparation: { items: [] } } }, { params: { id: orderId } })
  assert.equal(response.status, 409)
  assert.equal(api.writes(), 0)
  assert.equal(api.audits(), 0)
})

test('canonical preparation items cannot be changed through the old checklist editor', async () => {
  const item = { _id: resourceId, title: 'Собрать костюм', status: 'pending', dueAt: null, responsibleStaffId: staffId, note: '' }
  const current = { ...own(), preparation: { enabled: true, revision: 0, items: [item] } }
  for (const items of [[{ ...item, status: 'done' }], [{ ...item, title: 'Другой заголовок' }], [], [item, { ...item, _id: otherId }]]) {
    const api = await prepSetup(actor({ 'orders.preparation': 'edit', tasks: 'read' }), { current })
    const response = await api.PATCH({ method: 'PATCH', body: { expectedRevision: 0, preparation: { items } } }, { params: { id: orderId } })
    assert.equal(response.status, 409)
    assert.equal((await response.json()).error.code, 'partycrm_preparation_tasks_managed')
    assert.equal(api.writes(), 0)
    assert.equal(current.preparation.items[0].status, 'pending')
  }
  const api = await prepSetup(actor({ 'orders.preparation': 'edit', tasks: 'read' }), { current })
  const response = await api.PATCH({ method: 'PATCH', body: { expectedRevision: 0, preparation: { items: [item], assembly: { status: 'ready' } } } }, { params: { id: orderId } })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.tasksManaged, true)
})

test('legacy performer checklist action cannot bypass canonical tasks via a direct URL', async () => {
  const context = actor({ 'orders.preparation': 'read', 'orders.ownAssignment': 'edit', tasks: 'read' })
  let writes = 0
  const deps = { ...permissions, getPartyOrderWriteGuard, buildPerformerPreparationView,
    NextResponse: { json }, partyError, isValidObjectId: inventory.isInventoryId, parseJsonBody: async req => req.body,
    getPartyMembershipContext: async () => ({ sessionUser: { _id: staffId }, memberships: [{ ...context, staffId, status: 'active' }] }),
    getPartyOrderModel: async () => ({ findOne: criteria => { assert.equal(criteria.tenantId, tenantId); return query({ ...own(), assignedStaff: [{ staffId }] }) }, findOneAndUpdate: () => { writes++; return query(null) } }),
    ensurePartyOrderTasks: async () => {}, recordPartyOrderAudit: async () => {},
  }
  const api = await load('../app/api/party/performer/orders/[id]/preparation/route.js', deps, 'GET, PATCH')
  const url = `http://localhost/api/party/performer/orders/${orderId}/preparation?staffId=${staffId}`
  const response = await api.PATCH({ url, method: 'PATCH', body: { action: 'set_item_status', itemId: resourceId, status: 'done' } }, { params: { id: orderId } })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'partycrm_preparation_tasks_managed')
  assert.equal(writes, 0)
  context.position.permissions['orders.preparation'] = 'hidden'
  assert.equal((await api.GET({ url }, { params: { id: orderId } })).status, 403)
})
