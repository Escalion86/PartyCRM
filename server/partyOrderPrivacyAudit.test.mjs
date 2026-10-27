import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as permissions from '../helpers/partyRolePermissions.js'
import * as calendarQueries from '../helpers/partyOrderCalendarQuery.js'
import * as orderAccess from '../helpers/partyOrderAccess.js'
import * as payloadHelpers from './partyOrderPayload.js'
import * as brief from './partyOrderBrief.js'
import * as contacts from './partyOrderContactRoles.js'
import * as assignments from '../helpers/partyOrderAssignments.js'
import { getPartyWorkflow } from '../helpers/partyWorkflow.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'
import { getPartyOrderCloseReadiness } from '../helpers/partyOrderCloseReadiness.js'

const tenantId = 'a'.repeat(24), orderId = 'b'.repeat(24), staffId = 'c'.repeat(24), locationId = 'd'.repeat(24), personId = 'e'.repeat(24)
const source = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export const ', 'const ')
const collectionCode = await source('../app/api/party/orders/route.js')
const individualCode = await source('../app/api/party/orders/[id]/route.js')
const optionsCode = await source('../app/api/party/order-options/route.js')
const actor = (grants = {}, scope = {}) => ({ tenantId, role: 'performer', staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId: personId }, company: { _id: tenantId, title: 'Компания', settings: {} }, position: { _id: personId, tenantId, active: true, permissions: { orders: 'read', 'orders.title': 'edit', 'orders.serviceTitle': 'read', ...grants }, orderScope: scope } })

function setup({ context = actor(), orderPatch = {}, transactions = [] } = {}) {
  const writes = [], filters = [], events = []
  const order = { _id: orderId, tenantId, status: 'active', workflowStageId: 'new', title: 'Праздник', eventDate: '2026-10-27T10:00:00Z', dateEnd: '2026-10-27T11:00:00Z', durationMinutes: 60, locationId, placeType: 'company_location', serviceTitle: 'Анимация', servicesIds: [], assignedStaff: [], contractAmount: 976543, transactions: [], client: { name: 'Скрытое имя', phone: '79999999999', email: 'private@example.com' }, clientId: null, eventBrief: { wishes: 'Не терять ответ', customAnswers: { note: 'Памятка' } }, ...orderPatch }
  const q = (rows) => ({ select() { return this }, sort() { events.push('sort'); return this }, limit(value) { assert.equal(value, 120); events.push('limit'); return this }, session() { return this }, lean: async () => structuredClone(rows) })
  const Orders = {
    find: (filter) => { filters.push(filter); events.push('find'); return q([order]) },
    findOne: (filter) => { assert.equal(filter.tenantId, tenantId); return q(order) },
    countDocuments: async (filter) => { assert.equal(filter.tenantId, tenantId); return 0 },
    create: async (data) => { writes.push(data); return { ...data, _id: orderId, toObject: () => ({ ...data, _id: orderId }) } },
    findOneAndUpdate: (filter, update) => { assert.equal(filter.tenantId, tenantId); writes.push(update.$set); Object.assign(order, update.$set); return q(order) },
  }
  const deps = {
    ...permissions, ...calendarQueries, ...orderAccess, ...payloadHelpers, ...brief, ...contacts, ...assignments, getPartyWorkflow, getPartyOrderWriteGuard,
    withPartyOrderReportSummaries: async ({ orders }) => orders,
    withPartyOrderTaskSummaries: async ({ orders }) => orders,
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    getPartyRequestContext: async () => ({ context }), isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(String(id)), parseJsonBody: async (req) => req.body,
    partyError: (status, code, message, _kind, extra) => ({ status, body: { code, message, ...extra } }),
    withPartyOrderVenueWrite: async ({ work }) => work({ session: null, legacy: true }),
    getPartyOrderModel: async () => Orders,
    getPartyStaffModel: async () => ({ find: () => q([]), countDocuments: async () => 1 }),
    getPartyClientModel: async () => ({ countDocuments: async () => 1 }),
    getPartyLocationModel: async () => ({ exists: async () => true }),
    getPartyServiceModel: async () => ({ countDocuments: async () => 1 }),
    getPartyTransactionModel: async () => ({ find: (filter) => { assert.equal(filter.tenantId, tenantId); return { ...q(transactions), limit() { return this } } } }),
    getPartyCompanyTariffAccessState: async () => ({ access: {} }), filterPartyOrderPayloadByTariffAccess: (payload) => payload, canCreatePartyOrderByTariff: () => ({ ok: true }),
    findPartyOrderConflicts: async () => ({}), hasPartyOrderConflicts: () => false, getPartySharedLocationOrderIds: async () => [],
    syncPartyOrderInventory: async () => ({}), filterPartyInventoryResult: async (_context, result) => result,
    getPartyOrderCloseReadiness,
    getPartyTaskOrderReadiness: async ({ order }) => ({ order, blockers: [] }),
    getPartyReportGateBlockers: async () => [],
    recordPartyOrderAudit: async () => {}, syncPartyOrderCalendarAfterCrud: async () => {}, sendPartyPerformerAssignmentPushes: async () => {}, cancelPartyOrderTasks: async () => {},
  }
  const main = new Function(...Object.keys(deps), `${collectionCode}\nreturn {GET,POST,normalizeOrderPayload,validateOrderReferences,applyPartyAssignmentAccountDefaults}`)(...Object.values(deps))
  const individualDeps = { ...deps, normalizeOrderPayload: main.normalizeOrderPayload, validateOrderReferences: main.validateOrderReferences, applyPartyAssignmentAccountDefaults: main.applyPartyAssignmentAccountDefaults }
  const one = new Function(...Object.keys(individualDeps), `${individualCode}\nreturn {PATCH}`)(...Object.values(individualDeps))
  return { order, writes, filters, events, get: () => main.GET({ url: 'http://test/orders' }), post: (body) => main.POST({ body }), patch: (body) => one.PATCH({ body }, { params: { id: orderId } }) }
}

test('order list does not disclose payout amounts to an expense-only viewer after DTO mapping', async () => {
  const transactions = [{ _id: '1'.repeat(24), orderId, tenantId, type: 'expense', category: 'payout', staffId: personId, amount: 865432, comment: 'Скрытая зарплата' }, { _id: '2'.repeat(24), orderId, tenantId, type: 'expense', category: 'transport', amount: 45 }]
  const run = setup({ context: actor({ 'finance.expenses': 'read', 'finance.payouts': 'hidden' }), transactions })
  const result = await run.get()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.data[0].transactions.map((row) => row.amount), [45])
  assert.equal(JSON.stringify(result.body).includes('865432'), false)
  assert.equal(JSON.stringify(result.body).includes('Скрытая зарплата'), false)
})

test('order scope is present in the DB query before limit and hidden finances stay out of the response', async () => {
  const run = setup({ context: actor({}, { locationIds: [locationId], includeUnlocated: false, statuses: ['active'] }) })
  const result = await run.get()
  assert.equal(result.body.data.length, 1)
  assert.equal(result.body.data[0].contractAmount, undefined)
  assert.equal(JSON.stringify(result.body).includes('private@example.com'), false)
  assert.equal(run.filters[0].tenantId, tenantId)
  assert.equal(JSON.stringify(run.filters[0]).includes(locationId), true)
  assert.deepEqual(run.events.slice(0, 3), ['find', 'sort', 'limit'])
})

test('a title-only custom role preserves hidden fields in a PATCH and cannot spoof an amount or direct stage handoff', async () => {
  const run = setup()
  const result = await run.patch({ title: 'Уточнённый праздник' })
  assert.equal(result.status, 200)
  assert.equal(run.order.title, 'Уточнённый праздник')
  assert.equal(run.order.contractAmount, 976543)
  assert.equal(run.order.client.email, 'private@example.com')
  assert.equal(run.order.eventBrief.customAnswers.note, 'Памятка')
  assert.equal(JSON.stringify(result.body).includes('976543'), false)
  const attempts = run.writes.length
  assert.equal((await run.patch({ contractAmount: 1 })).status, 403)
  assert.equal((await run.patch({ workflowStageId: 'review' })).body.code, 'partycrm_use_stage_transition')
  assert.equal(run.writes.length, attempts)
})

test('create rejects closed state and injected payout ledger before writes even for an authorized creator', async () => {
  const run = setup({ context: actor({ 'orders.create': 'edit', 'orders.serviceTitle': 'edit' }) })
  assert.equal((await run.post({ title: 'Новая', serviceTitle: 'Анимация', status: 'closed' })).status, 400)
  assert.equal((await run.post({ title: 'Новая', serviceTitle: 'Анимация', transactions: [{ category: 'payout', type: 'expense', staffId: personId, amount: 100 }] })).status, 400)
  assert.equal(run.writes.length, 0)
})

test('an own-orders creator receives its own manager assignment before scope validation', async () => {
  const run = setup({ context: actor({ 'orders.create': 'edit', 'orders.serviceTitle': 'edit' }, { assignedOnly: true }) })
  const result = await run.post({ serviceTitle: 'Новая программа' })
  assert.equal(result.status, 201)
  assert.equal(run.writes[0].responsibleStaffId, staffId)
  assert.equal(result.body.data.serviceTitle, 'Новая программа')
  assert.equal(Object.hasOwn(result.body.data, 'contractAmount'), false)
})

test('a custom closer receives a generic blocker without a hidden client debt amount', async () => {
  const run = setup({ context: actor({ 'orders.status': 'edit' }) })
  const result = await run.patch({ status: 'closed' })
  assert.equal(result.status, 409)
  assert.equal(result.body.blockers.some((item) => item.code === 'client_debt'), true)
  assert.equal(JSON.stringify(result.body).includes('976543'), false)
  assert.equal(run.writes.length, 0)
})

test('read-only order team options are scoped and staff phones require an explicit contact permission', async () => {
  for (const phone of ['hidden', 'read']) {
    const context = actor({ 'orders.assignedStaff': 'read', 'staff.phone': phone }, { locationIds: [locationId], includeUnlocated: false })
    const seen = []
    const q = (rows) => ({ select() { return this }, sort() { return this }, limit() { return this }, lean: async () => rows })
    const deps = {
      ...permissions, NextResponse: { json: (body) => ({ status: 200, body }) }, getPartyRequestContext: async () => ({ context }), partyError: (status) => ({ status }),
      withPartyOrderVenueWrite: async ({ work }) => work({ session: null, legacy: true }),
    getPartyOrderModel: async () => ({ find: (filter) => { assert.equal(filter.tenantId, tenantId); assert.equal(JSON.stringify(filter).includes(locationId), true); return q([{ assignedStaff: [{ staffId: personId }] }]) } }),
      getPartyStaffModel: async () => ({ find: (filter) => { seen.push(filter); return q([{ _id: personId, firstName: 'Коллега', role: 'performer', phone: '79130000001' }]) } }),
      getPartyClientModel: async () => ({}), getPartyServiceModel: async () => ({ find: () => q([]) }), getPartyLocationModel: async () => ({}),
    }
    const get = new Function(...Object.keys(deps), `${optionsCode}\nreturn GET`)(...Object.values(deps))
    const result = await get({})
    assert.deepEqual(seen[0]._id, { $in: [personId] })
    assert.equal(seen[0].tenantId, tenantId)
    assert.equal(result.body.data.staff[0].phone, phone === 'read' ? '79130000001' : undefined)
    assert.deepEqual(result.body.data.clients, [])
  }
})
