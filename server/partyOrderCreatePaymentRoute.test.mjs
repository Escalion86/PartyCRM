import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as permissions from '../helpers/partyRolePermissions.js'
import * as payloadHelpers from './partyOrderPayload.js'
import * as brief from './partyOrderBrief.js'
import * as contacts from './partyOrderContactRoles.js'
import * as assignments from '../helpers/partyOrderAssignments.js'
import { parsePartyIsoDate } from '../helpers/partyIsoDate.js'
import { getPartyWorkflow } from '../helpers/partyWorkflow.js'

const strip = (source) => source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replace(/^export /gm, '')
// Resolve only the lazy module in the offline loader; the complete production
// POST body and real normalizers/permission checks execute unchanged.
const route = strip(await readFile(new URL('../app/api/party/orders/route.js', import.meta.url), 'utf8')).replace("await import('@server/partyOrderCreatePayment')", 'await loadInitialPaymentModule()')
const serviceSource = strip(await readFile(new URL('./partyOrderCreatePayment.js', import.meta.url), 'utf8'))
const helperDeps = { createHash, canPartyAccess: permissions.canPartyAccess, parsePartyIsoDate, getPartyOrderModel: () => {}, getPartyTransactionModel: () => {}, withPartyFinancialTransaction: () => {}, withPartyOrderVenueWrite: () => {}, supportsPartyVenueTransactions: async () => true }
const core = new Function(...Object.keys(helperDeps), `${serviceSource};return {createPartyOrderPaymentService,parsePartyInitialPayment,buildPartyOrderCreateIdentity}`)(...Object.values(helperDeps))
const tenantId = 'a'.repeat(24), actorId = 'b'.repeat(24), orderId = 'c'.repeat(24)
const owner = { tenantId, role: 'owner', staff: { _id: actorId, tenantId, role: 'owner', status: 'active' }, company: { settings: {} } }
const body = { title: 'Мероприятие', serviceTitle: 'Шоу', contractAmount: 1000, initialPayment: { amount: '500.01', paymentMethod: 'cash' } }
const actor = (grants) => ({ ...owner, role: 'performer', staff: { ...owner.staff, role: 'performer' }, position: { permissions: { orders: 'read', 'orders.create': 'edit', 'orders.title': 'edit', 'orders.serviceTitle': 'edit', 'finance.clientAmount': 'edit', 'finance.payments': 'edit', ...grants }, orderScope: {} } })
function setup(context = owner) {
  let orders = [], payments = [], serial = Promise.resolve()
  const guards = [], effects = [], active = new Set()
  const q = (value) => ({ select() { return this }, session() { return this }, lean: async () => value })
  const Model = {
    init: async () => {},
    findOne: (filter) => q(orders.find((row) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value))) || null),
    countDocuments: async () => orders.length,
    create: async ([data], { session }) => { assert.ok(active.has(session)); const row = { ...data, _id: orderId }; orders.push(row); return [row] },
  }
  const service = core.createPartyOrderPaymentService({ getOrders: async () => Model, getTransactions: async () => ({ create: async ([row], { session }) => { assert.ok(active.has(session)); payments.push(row) } }), financialTransaction: (tenant, callback) => {
    assert.equal(tenant, tenantId)
    const operation = serial.then(async () => { const snapshot = structuredClone({ orders, payments }), session = {}; active.add(session); try { return await callback(session) } catch (error) { ({ orders, payments } = snapshot); throw error } finally { active.delete(session) } })
    serial = operation.catch(() => {}); return operation
  }, venueWrite: async ({ session, work }) => { assert.ok(active.has(session)); return work({ session }) } })
  const initial = { ...core, findPartyOrderCreateReplay: service.replay, createPartyOrderWithPayment: service.create }
  const deps = {
    ...permissions, ...payloadHelpers, ...brief, ...contacts, ...assignments, getPartyWorkflow,
    loadInitialPaymentModule: async () => initial,
    guardPartyOrderPatch: (...args) => { guards.push(args[1]); return permissions.guardPartyOrderPatch(...args) },
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    getPartyRequestContext: async () => ({ context }), isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value)), parseJsonBody: async (request) => request.body,
    partyError: (status, code, message, type, extra) => ({ status, body: { code, message, type, ...extra } }),
    getPartyOrderModel: async () => Model,
    getPartyStaffModel: async () => ({ find: () => q([]), countDocuments: async () => 1 }),
    getPartyClientModel: async () => ({ countDocuments: async () => 1 }), getPartyServiceModel: async () => ({ countDocuments: async () => 1 }), getPartyLocationModel: async () => ({ exists: async () => true }),
    getPartyCompanyTariffAccessState: async () => ({ access: {} }), filterPartyOrderPayloadByTariffAccess: (payload) => payload, canCreatePartyOrderByTariff: () => ({ ok: true }),
    findPartyOrderConflicts: async () => ({}), hasPartyOrderConflicts: () => false,
    recordPartyOrderAudit: async () => effects.push('audit'), syncPartyOrderCalendarAfterCrud: async () => effects.push('calendar'), sendPartyPerformerAssignmentPushes: async () => effects.push('push'), syncPartyOrderInventory: async () => { effects.push('inventory'); return {} }, filterPartyInventoryResult: async (context, result) => result,
  }
  const POST = new Function(...Object.keys(deps), `${route};return POST`)(...Object.values(deps))
  return { guards, effects, get orders() { return orders }, get payments() { return payments }, post: (input = body, key = 'create_request_123') => POST({ body: structuredClone(input), headers: new Headers({ 'Idempotency-Key': key }) }) }
}

test('actual main POST strips initialPayment before field permission checks and atomically creates one advance', async () => {
  const state = setup(actor({})), response = await state.post()
  assert.equal(response.status, 201); assert.equal(state.orders.length, 1); assert.equal(state.payments.length, 1)
  assert.equal(state.payments[0].amount, 500.01); assert.equal(state.payments[0].orderId, orderId)
  assert.equal(state.guards.length, 1); assert.equal(Object.hasOwn(state.guards[0], 'initialPayment'), false)
  assert.equal(Object.hasOwn(state.orders[0], 'initialPayment'), false)
  assert.equal(response.body.data.clientPayment.prepaidAmount, 500.01)
  assert.doesNotMatch(JSON.stringify(response.body), /createRequest/)
})

test('lost first response and concurrent identical main POST retries return one order and one receipt', async () => {
  const state = setup(), responses = await Promise.all([state.post(), state.post()])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201])
  const replay = await state.post()
  assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true); assert.equal(replay.body.data._id, orderId)
  assert.equal(state.orders.length, 1); assert.equal(state.payments.length, 1)
  assert.deepEqual(state.effects, ['audit', 'calendar', 'push', 'inventory'])
})

test('actual main POST refuses financial and ordinary field bypasses before any writes', async () => {
  const forbiddenPayment = setup(actor({ 'finance.payments': 'read' }))
  assert.equal((await forbiddenPayment.post()).status, 403)
  assert.equal(forbiddenPayment.guards.length, 0); assert.equal(forbiddenPayment.orders.length, 0)
  const forbiddenPrice = setup(actor({ 'finance.clientAmount': 'hidden' }))
  const response = await forbiddenPrice.post()
  assert.equal(response.status, 403); assert.equal(response.body.code, 'partycrm_forbidden_order_fields'); assert.equal(forbiddenPrice.orders.length, 0)
  const forged = setup()
  assert.equal((await forged.post({ ...body, createRequestKey: 'forged' })).status, 400)
  assert.equal(forged.orders.length, 0)
})

test('actual main POST rejects changed payload for a used key and invalid payment/key before writing', async () => {
  const state = setup(); await state.post()
  const changed = await state.post({ ...body, title: 'Другой заказ' })
  assert.equal(changed.status, 409); assert.equal(changed.body.code, 'partycrm_order_create_key_conflict')
  assert.equal(state.orders.length, 1); assert.equal(state.payments.length, 1)
  const invalid = setup()
  assert.equal((await invalid.post(body, '')).status, 400)
  assert.equal((await invalid.post({ ...body, initialPayment: { amount: 1.001, paymentMethod: 'cash' } })).status, 400)
  assert.equal(invalid.orders.length, 0)
})
