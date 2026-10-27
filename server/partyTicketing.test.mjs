import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import mongoose, { Types } from 'mongoose'
import * as core from '../helpers/partyTicketsCore.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { isPartyTicketingEnabled } from '../helpers/partyTicketing.js'
import * as schemas from '../schemas/partyTicketingSchema.js'
import { createHash } from 'node:crypto'

const source = (await readFile(new URL('./partyTicketing.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const factory = new Function(...Object.keys(core), 'Types', 'createHash', 'canPartyAccess', 'isPartyTicketingEnabled', 'loadPartyTicketModels', 'getPartyLocationModel', 'getPartyClientModel', 'withPartyVenueMutation', 'reservePartyVenue', 'assertPartyVenueEntryAllowed', `${source}\nreturn {createPartyTicketingService,buildPartyTicketAccessFilter}`)
const exportsFor = (deps = {}) => factory(...Object.values(core), Types, createHash, canPartyAccess, isPartyTicketingEnabled, deps.loadModels, deps.getLocations, deps.getClients, deps.withVenueMutation, deps.reserveVenue, deps.assertEntryAllowed)
const tenantId = 'a'.repeat(24), otherTenant = '9'.repeat(24), staffId = 'b'.repeat(24), locationId = 'c'.repeat(24), otherLocation = 'd'.repeat(24), clientId = 'e'.repeat(24), positionId = 'f'.repeat(24)
const actor = (permissions = {}, enabled = true) => ({ tenantId, role: 'performer', staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId }, company: { settings: { modules: { ticketing: { enabled } } } }, position: { _id: positionId, tenantId, active: true, permissions: { tickets: 'read', 'tickets.manage': 'edit', 'tickets.sell': 'edit', 'tickets.payments': 'edit', 'tickets.refund': 'edit', 'tickets.checkin': 'edit', 'tickets.contacts': 'edit', 'tickets.finance': 'read', 'tickets.discounts': 'edit', ...permissions }, orderScope: { locationIds: [locationId], includeUnlocated: false, stageIds: ['irrelevant-order-stage'] } } })
const copy = (value) => value instanceof Types.ObjectId ? String(value) : value instanceof Date ? new Date(value) : Array.isArray(value) ? value.map(copy) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, copy(part)])) : value
const comparable = (value) => value instanceof Date ? +value : String(value)
const match = (row, filter) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$and') return expected.every((value) => match(row, value))
  if (key === '$or') return expected.some((value) => match(row, value))
  const actual = row[key]
  if (expected === null) return actual == null
  if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof Types.ObjectId)) return Object.entries(expected).every(([operator, value]) => ({ $in: () => value.map(String).includes(String(actual)), $ne: () => String(actual) !== String(value), $lt: () => actual != null && comparable(actual) < comparable(value), $lte: () => actual != null && comparable(actual) <= comparable(value), $gt: () => actual != null && comparable(actual) > comparable(value), $gte: () => actual != null && comparable(actual) >= comparable(value) })[operator]?.() === true)
  return comparable(actual) === comparable(expected)
})

function setup() {
  let tables = {}, mutex = Promise.resolve(), clock = new Date('2030-01-01T10:30:00Z')
  const calls = [], venues = [], models = {}
  const query = (values) => {
    let rows = copy(values)
    return { session() { return this }, select() { return this }, sort(sort) { if (Array.isArray(rows) && sort._id) rows.sort((a, b) => sort._id * String(a._id).localeCompare(String(b._id))); return this }, limit(size) { rows = rows.slice(0, size); return this }, lean: async () => copy(rows) }
  }
  const session = () => ({ inTransaction: () => true, endSession: async () => {}, withTransaction: async (work) => {
    const previous = mutex; let release; mutex = new Promise((resolve) => { release = resolve }); await previous
    const before = copy(tables)
    try { return await work() } catch (error) { tables = before; throw error } finally { release() }
  } })
  const model = (name) => {
    tables[name] = []
    const apply = (row, update) => { Object.assign(row, copy(update.$set || {})); for (const [key, value] of Object.entries(update.$inc || {})) row[key] = Number(row[key] || 0) + value }
    return { init: async () => {}, db: { startSession: async () => session() }, find: (filter) => { calls.push({ name, filter }); return query(tables[name].filter((row) => match(row, filter))) }, findOne: (filter) => { calls.push({ name, filter }); return query(tables[name].find((row) => match(row, filter)) || null) }, create: async (records) => {
      if (name === 'Ledger' && models.failLedger) throw new Error('ledger rejected')
      return records.map((record) => { const row = { _id: String(new Types.ObjectId()), createdAt: new Date('2030-01-01T10:30:00Z'), revision: 0, ...(name === 'Sessions' ? { status: 'scheduled', completedAt: null } : {}), ...copy(record) }; tables[name].push(row); return copy(row) })
    }, updateOne: async (filter, update, options = {}) => { calls.push({ name, filter, update }); let row = tables[name].find((row) => match(row, filter)); if (!row && options.upsert) { row = { ...copy(filter), ...copy(update.$setOnInsert || {}) }; tables[name].push(row) }; if (!row) return { matchedCount: 0 }; apply(row, update); return { matchedCount: 1 } }, findOneAndUpdate: (filter, update) => { const row = tables[name].find((row) => match(row, filter)); if (!row) return query(null); apply(row, update); return query(row) } }
  }
  for (const name of ['Programs', 'Sessions', 'Sales', 'Ledger', 'Operations', 'Locks', 'Locations', 'Clients']) models[name] = model(name)
  tables.Locations.push({ _id: locationId, tenantId, title: 'Зал', status: 'active', capacity: 100 }, { _id: otherLocation, tenantId, title: 'Чужая площадка', status: 'active', capacity: 100 })
  tables.Clients.push({ _id: clientId, tenantId, status: 'active', firstName: 'Покупатель', phone: '79990000000', email: 'buyer@example.invalid' })
  const deps = { loadModels: async () => Object.fromEntries(['Programs', 'Sessions', 'Sales', 'Ledger', 'Operations', 'Locks'].map((name) => [name, models[name]])), getLocations: async () => models.Locations, getClients: async () => models.Clients, withVenueMutation: async ({ session, work }) => work({ session }), reserveVenue: async (input) => { venues.push(input); if (models.venueConflict) core.ticketFailure('Площадка занята', 409) }, assertEntryAllowed: async () => { if (models.entryBlocked) core.ticketFailure('Площадка занята для входа', 409, 'partycrm_venue_entry_blocked') }, now: () => new Date(clock) }
  const service = exportsFor(deps).createPartyTicketingService(deps)
  let sequence = 0
  const run = (action, payload, context = actor(), requestKey = `operation_key_${String(++sequence).padStart(5, '0')}`) => service.mutate(context, { action, payload, requestKey })
  const program = async (extra = {}) => (await run('program.create', { title: 'Программа', admission: 'session', source: 'internal', unitPriceKopecks: 10000, locationId, ...extra })).data
  const show = async (program, capacity = 10) => (await run('session.create', { programId: program._id, locationId, capacity, startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z' })).data
  return { models, calls, venues, service, run, program, show, setNow: (value) => { clock = new Date(value) }, table: (name) => tables[name], read: (params = '', context = actor()) => service.read(context, new URLSearchParams(params)) }
}

test('real Mongoose schemas cast scoped IDs/dates and reject fractional amounts/capacity', () => {
  for (const [name, definition] of Object.entries(schemas)) {
    const Model = mongoose.model('TicketCast' + name, new mongoose.Schema(definition))
    const query = Model.find({ $and: [{ tenantId }, { locationId: { $in: [locationId] } }], _id: { $lt: clientId } }); query.cast(Model)
    assert.ok(query.getFilter()._id.$lt instanceof Types.ObjectId)
    if (definition.startsAt) {
      const dates = Model.find({ startsAt: { $lt: '2030-01-02T00:00:00Z' }, endsAt: { $gte: '2030-01-01T00:00:00Z' } }); dates.cast(Model)
      assert.ok(dates.getFilter().startsAt.$lt instanceof Date)
      assert.ok(dates.getFilter().endsAt.$gte instanceof Date)
    }
    if (definition.amountKopecks) assert.ok(new Model({ amountKopecks: 1.2 }).validateSync().errors.amountKopecks)
    if (definition.capacity) assert.ok(new Model({ capacity: 1.5 }).validateSync().errors.capacity)
    mongoose.deleteModel('TicketCast' + name)
  }
})

test('operation and ledger model definitions declare actor-scoped idempotency and one posting per operation', async () => {
  const modelSource = (await readFile(new URL('./partyTicketModels.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
  const modelFactory = new Function('PRODUCTS', 'getProductModel', ...Object.keys(schemas), `${modelSource}\nreturn loadPartyTicketModels`)
  const loadModels = modelFactory({ PARTYCRM: 'partycrm' }, async ({ schemaDefinition, schemaOptions, configureSchema }) => { const schema = new mongoose.Schema(schemaDefinition, schemaOptions); configureSchema(schema); return { schema } }, ...Object.values(schemas))
  const models = await loadModels()
  assert.ok(models.Operations.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId && keys.actorStaffId && keys.requestKey))
  assert.ok(models.Ledger.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId && keys.operationId))
  assert.ok(models.Locks.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId))
})

test('price snapshots apply configured group discounts; manual overrides require their own grant', () => {
  const program = core.normalizeTicketProgram({ title: 'Шоу', admission: 'session', unitPriceKopecks: 100000, groupDiscount: { minQuantity: 5, amountPerTicketKopecks: 10000 } })
  assert.equal(core.calculateTicketSalePrice({ program, quantity: 5 }).totalAmountKopecks, 450000)
  assert.throws(() => core.calculateTicketSalePrice({ program, quantity: 5, discountKopecks: 1 }), { status: 403 })
  assert.equal(core.calculateTicketSalePrice({ program, quantity: 5, discountKopecks: 5000, mayDiscount: true }).totalAmountKopecks, 445000)
  for (const date of ['2030-02-30', '2030-01-01T25:00:00Z', 'nonsense']) assert.throws(() => core.ticketDate(date))
  assert.equal(core.normalizeTicketContact({ phone: '8 (999) 123-45-67' }).phone, '79991234567')
})

test('concurrent sales cannot oversell one session and an initial payment is one atomic manual fact', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program, 3)
  const results = await Promise.allSettled([state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 2, initialPayment: { amountKopecks: 20000, method: 'card' } }), state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 2 })])
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
  assert.equal(results.find((row) => row.status === 'rejected').reason.status, 409)
  assert.equal(state.table('Sessions')[0].soldCount, 2)
  assert.equal(state.table('Sales').length, 1)
  assert.equal(state.table('Ledger').length, 1)
  assert.equal(state.table('Ledger')[0].source, 'manual')
  assert.equal(state.table('Ledger')[0].amountKopecks, 20000)
})

test('same key retries are exactly once, changed request conflicts, and a ledger failure rolls back capacity and sale', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program)
  const payload = { programId: program._id, sessionId: session._id, quantity: 2, initialPayment: { amountKopecks: 20000, method: 'cash' } }, key = 'retry_same_request_key'
  const [first, replay] = await Promise.all([state.run('sale.create', payload, actor(), key), state.run('sale.create', payload, actor(), key)])
  assert.equal(first.data._id, replay.data._id)
  assert.equal(replay.operation.replayed, true)
  assert.equal(state.table('Sessions')[0].soldCount, 2)
  assert.equal(state.table('Ledger').length, 1)
  await assert.rejects(state.run('sale.create', { ...payload, quantity: 1 }, actor(), key), { status: 409 })
  state.models.failLedger = true
  await assert.rejects(state.run('sale.create', payload), /ledger rejected/)
  assert.equal(state.table('Sales').length, 1)
  assert.equal(state.table('Sessions')[0].soldCount, 2)
})

test('payments/refunds/admission enforce remaining money and quantities, release only refunded capacity', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program)
  const sale = (await state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 3 })).data
  await assert.rejects(state.run('admission.record', { saleId: sale._id, quantity: 1 }), { status: 409 })
  await state.run('payment.record', { saleId: sale._id, amountKopecks: 30000, method: 'cash' })
  await assert.rejects(state.run('payment.record', { saleId: sale._id, amountKopecks: 1, method: 'cash' }), { status: 409 })
  await assert.rejects(state.run('refund.record', { saleId: sale._id, quantity: 1, amountKopecks: 10000, reason: 'Без способа возврата' }), { status: 400 })
  const refund = await state.run('refund.record', { saleId: sale._id, quantity: 1, amountKopecks: 10000, method: 'cash', reason: 'Возврат одного билета' })
  assert.equal(refund.data.activeAmountKopecks, 20000)
  assert.equal(refund.data.netPaidAmountKopecks, 20000)
  assert.equal(state.table('Sessions')[0].soldCount, 2)
  await state.run('admission.record', { saleId: sale._id, quantity: 2 })
  await assert.rejects(state.run('admission.record', { saleId: sale._id, quantity: 1 }))
  await assert.rejects(state.run('refund.record', { saleId: sale._id, quantity: 1, amountKopecks: 10000, method: 'cash', reason: 'Уже использовано' }))
})

test('session mutation enforces venue capacity, reservation conflict rollback and explicit move policy', async () => {
  const state = setup(), program = await state.program()
  await assert.rejects(state.show(program, 101))
  state.models.venueConflict = true
  await assert.rejects(state.show(program), { status: 409 })
  assert.equal(state.table('Sessions').length, 0)
  state.models.venueConflict = false
  const session = await state.show(program), sale = await state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 2 })
  await assert.rejects(state.run('session.update', { sessionId: session._id, expectedRevision: 1, capacity: 1 }), { status: 409 })
  await assert.rejects(state.run('session.update', { sessionId: session._id, expectedRevision: 1, startsAt: '2030-01-02T10:00:00Z', endsAt: '2030-01-02T11:00:00Z' }), { status: 409 })
  await assert.rejects(state.run('session.update', { sessionId: session._id, expectedRevision: 1, status: 'canceled' }), { status: 409 })
  await state.run('sale.cancel', { saleId: sale.data._id, reason: 'Отмена неоплаченной брони' })
  await state.run('session.update', { sessionId: session._id, expectedRevision: 2, status: 'canceled' })
  assert.equal(state.table('Sessions')[0].status, 'canceled')
})

test('untimed visits never reserve the hall and disabled module preserves history/maintenance without new sales', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  const sale = await state.run('sale.create', { programId: program._id, quantity: 2 })
  assert.equal(sale.data.sessionId, null)
  assert.equal(state.venues.length, 0)
  await state.run('admission.record', { saleId: sale.data._id, quantity: 1 }, actor({}, false))
  await assert.rejects(state.run('sale.create', { programId: program._id, quantity: 1 }, actor({}, false)), { code: 'partycrm_ticketing_disabled' })
  await assert.rejects(state.run('payment.record', { saleId: sale.data._id, amountKopecks: 1, method: 'cash' }, actor({}, false)), { code: 'partycrm_ticketing_disabled' })
  assert.equal((await state.read('section=sales', actor({}, false))).data.length, 1)
  await assert.rejects(state.read('', actor({ tickets: 'hidden' }, false)), { status: 403 })
})

test('external programs expose unknown availability and cannot fabricate a sale', async () => {
  const state = setup(), program = await state.program({ source: 'external', externalProvider: 'krasbilet' }), session = await state.show(program)
  assert.equal(session.availabilityKnown, false)
  assert.equal(session.availableCount, null)
  await assert.rejects(state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 1 }), { status: 503 })
  assert.equal(state.table('Sales').length, 0)
})

test('location/tenant scope and current grants mask contact/finance even on an idempotent replay', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program)
  const payload = { programId: program._id, sessionId: session._id, quantity: 1, clientId, contact: { name: 'Введённое имя' }, initialPayment: { amountKopecks: 10000, method: 'cash' } }, key = 'contact_scoped_retry'
  const original = await state.run('sale.create', payload, actor(), key)
  assert.equal(original.data.contact.name, 'Введённое имя')
  assert.equal(original.data.contact.phone, '', 'explicit linking must not inject old buyer contacts')
  const restricted = actor({ 'tickets.contacts': 'hidden', 'tickets.finance': 'hidden' })
  const replay = await state.run('sale.create', payload, restricted, key)
  assert.equal(replay.operation.replayed, true)
  assert.equal(replay.data.contact, undefined)
  assert.equal(replay.data.ledger, undefined)
  const checker = actor({ 'tickets.contacts': 'hidden', 'tickets.finance': 'hidden', 'tickets.sell': 'hidden', 'tickets.payments': 'hidden', 'tickets.refund': 'hidden' })
  const detail = (await state.read(`section=sale&id=${original.data._id}`, checker)).data
  assert.equal(detail.totalAmountKopecks, undefined)
  assert.equal(detail.paymentComplete, true)
  const foreign = actor(); foreign.position.orderScope.locationIds = [otherLocation]
  await assert.rejects(state.read(`section=sale&id=${original.data._id}`, foreign), { status: 404 })
  const foreignTenant = actor(); foreignTenant.tenantId = otherTenant; foreignTenant.staff.tenantId = otherTenant; foreignTenant.position.tenantId = otherTenant
  await assert.rejects(state.read(`section=sale&id=${original.data._id}`, foreignTenant), { status: 404 })
  assert.equal((await state.read('section=sales', checker)).data.length, 1, 'order stage scope must not hide unrelated ticket sales')
})

test('catalog/history remain scoped and history paging reaches sales beyond the first 40', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  for (let index = 0; index < 45; index++) await state.run('sale.create', { programId: program._id, quantity: 1 })
  const first = await state.read('section=sales&programId=' + program._id)
  assert.equal(first.data.length, 40)
  assert.equal(first.meta.hasMore, true)
  const second = await state.read('section=sales&programId=' + program._id + '&cursor=' + first.meta.nextCursor)
  assert.equal(second.data.length, 5)
  assert.equal(second.meta.hasMore, false)
  assert.equal(new Set([...first.data, ...second.data].map((row) => row._id)).size, 45)
  const catalog = (await state.read()).data
  assert.deepEqual(catalog.locations.map((row) => row._id), [locationId])
  assert.equal(catalog.limitations.openVisitOccupancyTracked, false)
  assert.equal(catalog.limitations.receiptIssued, false)
  await assert.rejects(state.read('section=sales&cursor=bad'), { status: 400 })
  await assert.rejects(state.run('sale.create', { programId: program._id, quantity: 1, contact: { name: 'Не разрешено' } }, actor({ 'tickets.contacts': 'read' })), { status: 403 })
})

test('linking an existing client writes its version in the same transaction as the sale', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  await state.run('sale.create', { programId: program._id, quantity: 1, clientId })
  const touch = state.calls.find((call) => call.name === 'Clients' && call.update)
  assert.equal(touch.filter.tenantId, tenantId)
  assert.deepEqual(touch.update, { $inc: { __v: 1 } })
})

test('a buyer archived between lookup and the transactional version write cannot acquire a new ticket link', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program)
  state.models.Clients.updateOne = async () => ({ matchedCount: 0 })
  await assert.rejects(state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 1, clientId, initialPayment: { amountKopecks: 10000, method: 'cash' } }), { status: 404 })
  assert.equal(state.table('Sales').length, 0)
  assert.equal(state.table('Ledger').length, 0)
  assert.equal(state.table('Sessions')[0].soldCount, 0)
})

test('a completed session snapshots earned service independently of cash and later refunds', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program)
  const sale = await state.run('sale.create', { programId: program._id, sessionId: session._id, quantity: 3, initialPayment: { amountKopecks: 10000, method: 'cash' } })
  await assert.rejects(state.run('session.update', { sessionId: session._id, expectedRevision: 1, status: 'completed' }), { status: 409 })
  state.setNow('2030-02-03T11:05:00Z')
  await state.run('session.update', { sessionId: session._id, expectedRevision: 1, status: 'completed' })
  const beforeRefund = state.table('Sales')[0]
  assert.equal(beforeRefund.earnedAmountKopecks, 30000)
  assert.equal(beforeRefund.paidAmountKopecks, 10000)
  assert.equal(+beforeRefund.fulfilledAt, +new Date(session.endsAt))
  assert.equal(+state.table('Sessions')[0].completedAt, +new Date('2030-02-03T11:05:00Z'))
  await state.run('refund.record', { saleId: sale.data._id, quantity: 1, amountKopecks: 10000, method: 'cash', reason: 'Возврат после проведения' })
  assert.equal(state.table('Sales')[0].earnedAmountKopecks, 30000)
  assert.equal(+state.table('Sales')[0].fulfilledAt, +beforeRefund.fulfilledAt)
  assert.equal(state.table('Ledger').find((row) => row.kind === 'refund').amountKopecks, 10000)
})

test('untimed admission ledger keeps earned kopecks exactly once without classifying them as cash', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 100 })
  const sale = await state.run('sale.create', { programId: program._id, quantity: 3, discountKopecks: 200, initialPayment: { amountKopecks: 100, method: 'cash' } })
  for (let index = 0; index < 3; index++) await state.run('admission.record', { saleId: sale.data._id, quantity: 1 })
  assert.deepEqual(state.table('Ledger').filter((row) => row.kind === 'admission').map((row) => row.amountKopecks), [33, 33, 34])
  assert.equal(state.table('Ledger').filter((row) => row.kind === 'payment').reduce((sum, row) => sum + row.amountKopecks, 0), 100)
})

test('refund/admission interleavings allocate the final kopeck without loss or double counting', async () => {
  for (const pattern of ['RAA', 'ARA', 'AAR', 'RRA', 'ARR']) {
    const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 100 })
    const sale = await state.run('sale.create', { programId: program._id, quantity: 3, discountKopecks: 200, initialPayment: { amountKopecks: 100, method: 'cash' } })
    for (const step of pattern) {
      if (step === 'A') await state.run('admission.record', { saleId: sale.data._id, quantity: 1 })
      else {
        const amountKopecks = core.allocateTicketValue(state.table('Sales')[0], 1)
        await state.run('refund.record', { saleId: sale.data._id, quantity: 1, amountKopecks, method: 'cash', reason: 'Возврат билета' })
      }
    }
    const final = state.table('Sales')[0]
    assert.equal(final.canceledValueKopecks + final.admittedValueKopecks, 100, pattern)
    assert.equal(state.table('Ledger').filter((row) => ['admission', 'refund'].includes(row.kind)).reduce((sum, row) => sum + row.amountKopecks, 0), 100, pattern)
  }
})

test('contact entry links a normalized existing client without injecting stored private details', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  const sale = await state.run('sale.create', { programId: program._id, quantity: 1, contact: { phone: '8 (999) 000-00-00', name: 'Имя из покупки' } })
  assert.equal(sale.data.clientId, clientId)
  assert.equal(sale.data.contact.name, 'Имя из покупки')
  assert.equal(sale.data.contact.email, '')
  assert.equal(state.table('Clients').length, 1)
  const history = await state.read('section=clientSales&clientId=' + clientId)
  assert.equal(history.data.length, 1)
  await assert.rejects(state.read('section=clientSales&clientId=' + clientId, actor({ 'tickets.contacts': 'hidden' })), { status: 403 })
  await assert.rejects(state.read('section=clientSales'), { status: 403 })
})

test('new buyer contact is created in the sale transaction and retries do not duplicate clients', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 100 })
  const payload = { programId: program._id, quantity: 1, contact: { name: 'Новый покупатель', phone: '79991111111' }, initialPayment: { amountKopecks: 100, method: 'cash' } }
  const key = 'new_buyer_contact_retry'
  const first = await state.run('sale.create', payload, actor(), key)
  const repeat = await state.run('sale.create', payload, actor(), key)
  assert.equal(first.data.clientId, repeat.data.clientId)
  assert.equal(state.table('Clients').length, 2)
  state.models.failLedger = true
  await assert.rejects(state.run('sale.create', { ...payload, contact: { phone: '79992222222' } }), /ledger rejected/)
  assert.equal(state.table('Clients').length, 2, 'a failed sale must not leave a newly created client')
})

test('ambiguous matches do not choose or disclose a buyer and phone takes priority over email', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  state.table('Clients').push({ _id: '8'.repeat(24), tenantId, status: 'active', firstName: 'Скрытое имя', phone: '79990000000', email: 'different@example.invalid' })
  await assert.rejects(state.run('sale.create', { programId: program._id, quantity: 1, contact: { phone: '79990000000' } }), (error) => { assert.equal(error.code, 'partycrm_ticketing_client_ambiguous'); assert.doesNotMatch(error.message, /Скрытое|different|888888/); return true })
  const sale = await state.run('sale.create', { programId: program._id, quantity: 1, contact: { phone: '79993333333', email: 'buyer@example.invalid' } })
  assert.notEqual(sale.data.clientId, clientId, 'email does not override a supplied unmatched phone')
  assert.equal(state.table('Sales').length, 1)
})

test('untimed admission checks the venue at entry without reserving a fictitious visit duration', async () => {
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  const sale = await state.run('sale.create', { programId: program._id, quantity: 1 })
  state.models.entryBlocked = true
  await assert.rejects(state.run('admission.record', { saleId: sale.data._id, quantity: 1 }), { code: 'partycrm_venue_entry_blocked' })
  assert.equal(state.table('Sales')[0].admittedQuantity, 0)
  assert.equal(state.table('Ledger').length, 0)
  assert.equal(state.venues.length, 0)
  state.models.entryBlocked = false
  await state.run('admission.record', { saleId: sale.data._id, quantity: 1 })
  assert.equal(state.table('Sales')[0].admittedQuantity, 1)
})

test('untimed visit date uses company midnight and an exclusive next midnight', async () => {
  const period = core.ticketVisitPeriod('2030-01-02', 'Asia/Krasnoyarsk')
  assert.equal(period.validFrom.toISOString(), '2030-01-01T17:00:00.000Z')
  assert.equal(period.validTo.toISOString(), '2030-01-02T17:00:00.000Z')
  assert.throws(() => core.ticketVisitPeriod('2030-02-30'))
  const state = setup(), program = await state.program({ admission: 'open', unitPriceKopecks: 0 })
  const sale = (await state.run('sale.create', { programId: program._id, quantity: 2, visitDate: '2030-01-02' })).data
  assert.equal(new Date(sale.validFrom).toISOString(), period.validFrom.toISOString())
  await assert.rejects(state.run('admission.record', { saleId: sale._id, quantity: 1 }), { status: 409 })
  state.setNow(period.validFrom)
  await state.run('admission.record', { saleId: sale._id, quantity: 1 })
  state.setNow(period.validTo)
  await assert.rejects(state.run('admission.record', { saleId: sale._id, quantity: 1 }), { status: 409 })
})

test('completed sessions keep their identity and can be opened directly beyond the first calendar page', async () => {
  const state = setup(), program = await state.program(), session = await state.show(program)
  assert.equal((await state.read(`section=session&id=${session._id}`)).data._id, session._id)
  state.setNow('2030-01-01T12:00:00Z')
  const completed = (await state.run('session.update', { sessionId: session._id, expectedRevision: session.revision, status: 'completed' })).data
  await assert.rejects(state.run('session.update', { sessionId: session._id, expectedRevision: completed.revision, status: 'scheduled' }), { status: 409 })
  await assert.rejects(state.read(`section=session&id=${session._id}`, { ...actor(), tenantId: otherTenant, staff: { ...actor().staff, tenantId: otherTenant }, position: { ...actor().position, tenantId: otherTenant } }), { status: 404 })
})
