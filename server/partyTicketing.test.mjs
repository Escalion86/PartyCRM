import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import mongoose, { Types } from 'mongoose'
import * as core from '../helpers/partyTicketsCore.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { isPartyTicketingEnabled } from '../helpers/partyTicketing.js'
import * as schemas from '../schemas/partyTicketingSchema.js'
import { createHash } from 'node:crypto'
import * as channelHelpers from '../helpers/partyTicketChannels.js'
import { partyTicketChannelRecordSchema } from '../schemas/partyTicketChannelsSchema.js'

const channelSource = (await readFile(new URL('./partyTicketChannels.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const { createPartyTicketChannels } = new Function('Types', 'canPartyAccess', ...Object.keys(core), ...Object.keys(channelHelpers), `${channelSource}\nreturn {createPartyTicketChannels}`)(Types, canPartyAccess, ...Object.values(core), ...Object.values(channelHelpers))
const source = (await readFile(new URL('./partyTicketing.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const factory = new Function(...Object.keys(core), 'Types', 'createHash', 'canPartyAccess', 'isPartyTicketingEnabled', 'loadPartyTicketModels', 'getPartyLocationModel', 'getPartyClientModel', 'withPartyVenueMutation', 'reservePartyVenue', 'assertPartyVenueEntryAllowed', 'createPartyTicketChannels', `${source}\nreturn {createPartyTicketingService,buildPartyTicketAccessFilter}`)
const exportsFor = (deps = {}) => factory(...Object.values(core), Types, createHash, canPartyAccess, isPartyTicketingEnabled, deps.loadModels, deps.getLocations, deps.getClients, deps.withVenueMutation, deps.reserveVenue, deps.assertEntryAllowed, createPartyTicketChannels)
const tenantId = 'a'.repeat(24), otherTenant = '9'.repeat(24), staffId = 'b'.repeat(24), locationId = 'c'.repeat(24), otherLocation = 'd'.repeat(24), clientId = 'e'.repeat(24), positionId = 'f'.repeat(24)
const actor = (permissions = {}, enabled = true) => ({ tenantId, role: 'performer', staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId }, company: { settings: { modules: { ticketing: { enabled } } } }, position: { _id: positionId, tenantId, active: true, permissions: { tickets: 'read', 'tickets.manage': 'edit', 'tickets.sell': 'edit', 'tickets.payments': 'edit', 'tickets.refund': 'edit', 'tickets.checkin': 'edit', 'tickets.contacts': 'edit', 'tickets.finance': 'read', 'tickets.discounts': 'edit', ...permissions }, orderScope: { locationIds: [locationId], includeUnlocated: false, stageIds: ['irrelevant-order-stage'] } } })
const copy = (value) => value instanceof Types.ObjectId ? String(value) : value instanceof Date ? new Date(value) : Array.isArray(value) ? value.map(copy) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, part]) => [key, copy(part)])) : value
const comparable = (value) => value instanceof Date ? +value : typeof value === 'number' ? value : String(value)
const match = (row, filter) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$and') return expected.every((value) => match(row, value))
  if (key === '$or') return expected.some((value) => match(row, value))
  const actual = row[key]
  if (expected === null) return actual == null
  if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof Types.ObjectId)) return Object.entries(expected).every(([operator, value]) => ({ $in: () => value.map(String).includes(String(actual)), $ne: () => String(actual) !== String(value), $lt: () => actual != null && comparable(actual) < comparable(value), $lte: () => actual != null && comparable(actual) <= comparable(value), $gt: () => actual != null && comparable(actual) > comparable(value), $gte: () => actual != null && comparable(actual) >= comparable(value) })[operator]?.() === true)
  return comparable(actual) === comparable(expected)
})

// Generic evaluator for the Mongo aggregation expressions used by the service.
// Real Mongo checks exercise the same pipelines in the isolated integration script.
const expression = (value, row) => {
  if (typeof value === 'string' && value.startsWith('$')) return row[value.slice(1)]
  if (Array.isArray(value)) return value.map((part) => expression(part, row))
  if (!value || typeof value !== 'object' || value instanceof Types.ObjectId || value instanceof Date) return value
  const [operator, input] = Object.entries(value)[0]
  const args = expression(input, row)
  if (operator === '$ifNull') return args[0] ?? args[1]
  if (operator === '$subtract') return args[0] - args[1]
  if (operator === '$max') return Math.max(...args)
  if (operator === '$gte') return args[0] >= args[1]
  if (operator === '$eq') return args[0] === args[1]
  if (operator === '$or') return args.some(Boolean)
  if (operator === '$cond') return args[0] ? args[1] : args[2]
  throw new Error(`Unsupported aggregation expression ${operator}`)
}
const aggregateRows = (input, pipeline) => {
  let rows = copy(input)
  for (const stage of pipeline) {
    if (stage.$match) rows = rows.filter((row) => match(row, stage.$match))
    else if (stage.$sort) rows.sort((left, right) => stage.$sort._id * String(left._id).localeCompare(String(right._id)))
    else if (stage.$project || stage.$set) rows = rows.map((row) => ({ ...(stage.$set ? row : {}), ...Object.fromEntries(Object.entries(stage.$project || stage.$set).map(([key, value]) => [key, expression(value, row)])) }))
    else if (stage.$group) {
      const groups = new Map()
      for (const row of rows) {
        const id = expression(stage.$group._id, row), key = JSON.stringify(id)
        const fresh = !groups.has(key), grouped = groups.get(key) || { _id: id }
        for (const [field, accumulator] of Object.entries(stage.$group)) {
          if (field === '_id') continue
          if (accumulator.$sum !== undefined) grouped[field] = (grouped[field] || 0) + expression(accumulator.$sum, row)
          else if (fresh && accumulator.$first !== undefined) grouped[field] = expression(accumulator.$first, row)
        }
        groups.set(key, grouped)
      }
      rows = [...groups.values()]
    } else throw new Error('Unsupported aggregation stage')
  }
  return rows
}

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
    return { init: async () => {}, db: { startSession: async () => session() }, aggregate: async (pipeline) => aggregateRows(tables[name], pipeline), find: (filter) => { calls.push({ name, filter }); return query(tables[name].filter((row) => match(row, filter))) }, findOne: (filter) => { calls.push({ name, filter }); return query(tables[name].find((row) => match(row, filter)) || null) }, create: async (records) => {
      if (name === 'Ledger' && models.failLedger) throw new Error('ledger rejected')
      if (name === 'ChannelRecords' && models.failChannelRecord) throw new Error('channel record rejected')
      return records.map((record) => { const row = { _id: String(new Types.ObjectId()), createdAt: new Date('2030-01-01T10:30:00Z'), revision: 0, ...(name === 'Sessions' ? { status: 'scheduled', completedAt: null } : {}), ...copy(record) }; tables[name].push(row); return copy(row) })
    }, updateOne: async (filter, update, options = {}) => { calls.push({ name, filter, update }); let row = tables[name].find((row) => match(row, filter)); if (!row && options.upsert) { row = { ...copy(filter), ...copy(update.$setOnInsert || {}) }; tables[name].push(row) }; if (!row) return { matchedCount: 0 }; apply(row, update); return { matchedCount: 1 } }, findOneAndUpdate: (filter, update) => { const row = tables[name].find((row) => match(row, filter)); if (!row) return query(null); apply(row, update); return query(row) } }
  }
  for (const name of ['Programs', 'Sessions', 'Sales', 'Ledger', 'Operations', 'Locks', 'ChannelRecords', 'Locations', 'Clients']) models[name] = model(name)
  tables.Locations.push({ _id: locationId, tenantId, title: 'Зал', status: 'active', capacity: 100 }, { _id: otherLocation, tenantId, title: 'Чужая площадка', status: 'active', capacity: 100 })
  tables.Clients.push({ _id: clientId, tenantId, status: 'active', firstName: 'Покупатель', phone: '79990000000', email: 'buyer@example.invalid' })
  const deps = { loadModels: async () => Object.fromEntries(['Programs', 'Sessions', 'Sales', 'Ledger', 'Operations', 'Locks', 'ChannelRecords'].map((name) => [name, models[name]])), getLocations: async () => models.Locations, getClients: async () => models.Clients, withVenueMutation: async ({ session, work }) => work({ session }), reserveVenue: async (input) => { venues.push(input); if (models.venueConflict) core.ticketFailure('Площадка занята', 409) }, assertEntryAllowed: async () => { if (models.entryBlocked) core.ticketFailure('Площадка занята для входа', 409, 'partycrm_venue_entry_blocked') }, now: () => new Date(clock) }
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
  const modelFactory = new Function('PRODUCTS', 'getProductModel', ...Object.keys(schemas), 'partyTicketChannelRecordSchema', `${modelSource}\nreturn loadPartyTicketModels`)
  const loadModels = modelFactory({ PARTYCRM: 'partycrm' }, async ({ schemaDefinition, schemaOptions, configureSchema }) => { const schema = new mongoose.Schema(schemaDefinition, schemaOptions); configureSchema(schema); return { schema } }, ...Object.values(schemas), partyTicketChannelRecordSchema)
  const models = await loadModels()
  assert.ok(models.Operations.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId && keys.actorStaffId && keys.requestKey))
  assert.ok(models.Ledger.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId && keys.operationId))
  assert.ok(models.Locks.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId))
  assert.ok(models.ChannelRecords.schema.indexes().some(([keys, options]) => options.unique && keys.tenantId && keys.sessionId && keys.channelKey && keys.kind && keys.externalReferenceKey && options.partialFilterExpression))
})

test('channel records validate real Mongoose references, money and operation entity type', () => {
  const Record = mongoose.model('TicketChannelRecordValidation', new mongoose.Schema(partyTicketChannelRecordSchema))
  const record = new Record({
    tenantId, sessionId: clientId, programId: clientId, locationId, operationId: clientId,
    channelKey: 'manual:channel', channelTitle: 'Канал', kind: 'sale',
    occurredAt: '2030-01-01T09:00:00Z', quantity: 2, amountKopecks: 10001, recordedByStaffId: staffId,
  })
  assert.equal(record.validateSync(), undefined)
  assert.ok(record.tenantId instanceof Types.ObjectId)
  record.amountKopecks = 1.2
  record.quantity = -1
  assert.ok(record.validateSync().errors.amountKopecks)
  assert.ok(record.validateSync().errors.quantity)
  mongoose.deleteModel('TicketChannelRecordValidation')
})

test('channel identities normalize spacing/case and reject invalid dates, quantities and text', () => {
  assert.equal(channelHelpers.ticketChannelIdentity('  Tickets  Partner ').channelKey, channelHelpers.ticketChannelIdentity('tickets partner').channelKey)
  assert.equal(channelHelpers.ticketChannelIdentity('ＡBC').channelKey, channelHelpers.ticketChannelIdentity('abc').channelKey)
  const payload = { kind: 'sale', occurredAt: '2030-01-01T09:00:00+00:00', quantity: 1, amountKopecks: 0 }
  const now = new Date('2030-01-01T10:00:00Z')
  for (const change of [{ kind: 'anything' }, { quantity: 0 }, { quantity: 1.1 }, { amountKopecks: -1 }, { paymentMethod: 42 }, { occurredAt: '2030-01-01' }, { occurredAt: '2030-01-02T09:00:00Z' }]) {
    assert.throws(() => channelHelpers.normalizeTicketChannelRecord({ ...payload, ...change }, now), { status: 400 })
  }
  assert.throws(() => channelHelpers.ticketChannelIdentity('  '), { status: 400 })
  assert.throws(() => channelHelpers.ticketChannelIdentity('Канал\u0000'), { status: 400 })
})

test('daily manual channel totals match 61 tickets and 72080 rubles without unpaid CRM reservations', async () => {
  const state = setup(), program = await state.program({ unitPriceKopecks: 100000 }), event = await state.show(program, 100)
  const direct = (await state.run('sale.create', { programId: program._id, sessionId: event._id, quantity: 12, initialPayment: { amountKopecks: 1200000, method: 'card' } })).data
  await state.run('refund.record', { saleId: direct._id, quantity: 2, amountKopecks: 200000, method: 'card', reason: 'Два билета' })
  await state.run('sale.create', { programId: program._id, sessionId: event._id, quantity: 3 })
  await state.run('sale.create', { programId: program._id, sessionId: event._id, quantity: 4, initialPayment: { amountKopecks: 100000, method: 'cash' } })
  const input = { sessionId: event._id, occurredAt: '2030-01-01T09:00:00Z', kind: 'sale' }
  await state.run('channel.record', { ...input, channelTitle: 'Партнёр А', quantity: 30, amountKopecks: 3600000 })
  const sale = await state.run('channel.record', { ...input, channelTitle: 'Партнёр Б', quantity: 22, amountKopecks: 2708000 })
  await state.run('channel.record', { ...input, kind: 'refund', saleRecordId: sale.data._id, quantity: 1, amountKopecks: 100000 })
  const summary = (await state.read(`section=channelSummary&sessionId=${event._id}`)).data
  assert.equal(summary.totals.netQuantity, 61)
  assert.equal(summary.totals.netAmountKopecks, 7208000)
  assert.equal(summary.totals.soldQuantity, 64)
  assert.equal(summary.totals.refundedQuantity, 3)
  assert.equal(summary.unpaidQuantity, 7)
  assert.equal(summary.unpaidAmountKopecks, 700000)
  assert.equal(summary.channels[0].cashRefundedAmountKopecks, 200000)
  assert.equal(summary.records.length, 3)
  assert.ok(summary.records.every((record) => record.paymentMethod === ''))
  assert.equal(summary.inventorySynced, false)
  assert.equal(summary.bankSettlementsVerified, false)
  assert.equal(state.table('Sessions')[0].soldCount, 17, 'manual observations do not reserve CRM tickets')
  assert.equal(state.table('Sales').length, 3)
  assert.equal(state.table('Ledger').length, 3, 'manual channel records cannot create receipts or cash refunds')
})

test('external journal keeps each operation payment method while reconciling gross channel amounts', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program)
  const input = { sessionId: event._id, occurredAt: '2030-01-01T09:00:00Z', quantity: 1 }
  const first = { ...input, kind: 'sale', channelTitle: 'Площадка', amountKopecks: 25000, paymentMethod: '  Карта ', externalReference: 'sale-1' }
  const { data: sale } = await state.run('channel.record', first)
  await state.run('channel.record', { ...first, paymentMethod: 'СБП', externalReference: 'sale-2' })
  await assert.rejects(state.run('channel.record', { ...first, paymentMethod: 'СБП' }), { code: 'partycrm_ticketing_channel_duplicate' })
  await state.run('channel.record', { ...input, kind: 'refund', saleRecordId: sale._id, amountKopecks: 25000, paymentMethod: 'Перевод' })
  const { data } = await state.read(`section=channelSummary&sessionId=${event._id}`)
  assert.deepEqual(data.records.map((record) => record.paymentMethod), ['Перевод', 'СБП', 'Карта'])
  assert.equal(data.totals.netQuantity, 1)
  assert.equal(data.totals.netAmountKopecks, 25000)
  assert.equal(data.channels.filter((channel) => channel.source === 'manual').length, 1)
})

test('manual records replay once, reject reference duplicates across actors and preserve channel identity', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program)
  const payload = { sessionId: event._id, kind: 'sale', channelTitle: '  Канал  А ', occurredAt: '2030-01-01T09:00:00Z', quantity: 5, amountKopecks: 50000, externalReference: 'order-1' }
  const key = 'channel_retry_key_123'
  const [first, replay] = await Promise.all([state.run('channel.record', payload, actor(), key), state.run('channel.record', payload, actor(), key)])
  assert.equal(first.data._id, replay.data._id)
  assert.equal(replay.operation.replayed, true)
  assert.equal(state.table('ChannelRecords').length, 1)
  assert.equal(first.data.remainingQuantity, 5)
  assert.equal(first.data.refundableAmountKopecks, 50000)
  assert.equal(first.data.externalReferenceKey, undefined)
  await assert.rejects(state.run('channel.record', { ...payload, quantity: 6 }, actor(), key), { code: 'partycrm_ticketing_idempotency_conflict' })
  const colleague = actor(); colleague.staff._id = '8'.repeat(24)
  await assert.rejects(state.run('channel.record', { ...payload, channelTitle: 'канал а' }, colleague), { code: 'partycrm_ticketing_channel_duplicate' })
  await state.run('channel.record', { ...payload, externalReference: 'order-2', channelTitle: 'канал а' })
  const summary = (await state.read(`section=channelSummary&sessionId=${event._id}`)).data
  assert.equal(summary.channels.length, 2)
  assert.equal(summary.channels[1].netQuantity, 10)
})

test('concurrent external refunds cannot exceed either remainder and failed insertion rolls the counters back', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program)
  const input = { sessionId: event._id, occurredAt: '2030-01-01T09:00:00Z' }
  const sale = (await state.run('channel.record', { ...input, kind: 'sale', channelTitle: 'Канал', quantity: 2, amountKopecks: 50000 })).data
  const refund = { ...input, kind: 'refund', saleRecordId: sale._id, quantity: 2, amountKopecks: 20000 }
  state.models.failChannelRecord = true
  await assert.rejects(state.run('channel.record', refund), /channel record rejected/)
  assert.equal(state.table('ChannelRecords')[0].refundedQuantity, 0)
  state.models.failChannelRecord = false
  const attempts = await Promise.allSettled([state.run('channel.record', refund), state.run('channel.record', refund)])
  assert.equal(attempts.filter((row) => row.status === 'fulfilled').length, 1)
  assert.equal(attempts.find((row) => row.status === 'rejected').reason.code, 'partycrm_ticketing_channel_refund_exceeded')
  await state.run('channel.record', { ...refund, quantity: 0, amountKopecks: 30000 })
  await assert.rejects(state.run('channel.record', { ...refund, quantity: 0, amountKopecks: 1 }), { status: 409 })
  const summary = (await state.read(`section=channelSummary&sessionId=${event._id}`)).data
  assert.equal(summary.totals.netQuantity, 0)
  assert.equal(summary.totals.netAmountKopecks, 0)
  const updated = summary.records.find((row) => row._id === sale._id)
  assert.equal(updated.remainingQuantity, 0)
  assert.equal(updated.refundableAmountKopecks, 0)
})

test('channel history and mutations enforce tenant, location, finance/action grants and disabled maintenance', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program), otherEvent = await state.show(program)
  const payload = { sessionId: event._id, kind: 'sale', channelTitle: 'Канал', occurredAt: '2030-01-01T09:00:00Z', quantity: 1, amountKopecks: 10000 }
  const sale = (await state.run('channel.record', payload)).data
  const summaryQuery = `section=channelSummary&sessionId=${event._id}`
  await assert.rejects(state.read(summaryQuery, actor({ 'tickets.finance': 'hidden' })), { status: 403 })
  await assert.rejects(state.run('channel.record', payload, actor({ 'tickets.sell': 'hidden' })), { status: 403 })
  await assert.rejects(state.run('channel.record', payload, actor({ 'tickets.finance': 'hidden' })), { status: 403 })
  const scoped = actor(); scoped.position.orderScope.locationIds = [otherLocation]
  await assert.rejects(state.read(summaryQuery, scoped), { status: 404 })
  await assert.rejects(state.run('channel.record', payload, scoped), { status: 404 })
  const foreign = actor(); foreign.tenantId = otherTenant; foreign.staff.tenantId = otherTenant; foreign.position.tenantId = otherTenant
  await assert.rejects(state.read(summaryQuery, foreign), { status: 404 })
  const refund = { sessionId: event._id, saleRecordId: sale._id, kind: 'refund', occurredAt: '2030-01-01T09:00:00Z', quantity: 1, amountKopecks: 10000 }
  await assert.rejects(state.run('channel.record', { ...refund, sessionId: otherEvent._id }), { status: 409 })
  await assert.rejects(state.run('channel.record', refund, actor({ 'tickets.refund': 'hidden' })), { status: 403 })
  await assert.rejects(state.run('channel.record', payload, actor({}, false)), { code: 'partycrm_ticketing_disabled' })
  await state.run('channel.record', refund, actor({}, false))
  assert.equal((await state.read(summaryQuery, actor({}, false))).data.totals.netQuantity, 0)
  const catalog = (await state.read()).data.capabilities
  assert.equal(catalog.channelRead, true)
  assert.equal(catalog.channelSell, true)
  assert.equal(catalog.channelRefund, true)
})

test('channel paging retains full totals and explicitly reports over-capacity observations', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program, 10)
  for (let index = 0; index < 45; index++) await state.run('channel.record', { sessionId: event._id, kind: 'sale', channelTitle: 'Канал', occurredAt: '2030-01-01T09:00:00Z', quantity: 1, amountKopecks: 10000 })
  const query = `section=channelSummary&sessionId=${event._id}`
  const first = (await state.read(query)).data
  const last = (await state.read(query + '&cursor=' + first.meta.nextCursor)).data
  assert.equal(first.records.length, 40)
  assert.equal(last.records.length, 5)
  assert.equal(first.meta.hasMore, true)
  assert.equal(last.meta.hasMore, false)
  assert.equal(first.totals.netQuantity, 45)
  assert.equal(last.totals.netQuantity, 45)
  assert.equal(first.overCapacityQuantity, 35)
  assert.equal(new Set([...first.records, ...last.records].map((row) => row._id)).size, 45)
})

test('suggested channels reuse names from other sessions only within the visible company and locations', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program), earlier = await state.show(program)
  const input = { sessionId: earlier._id, kind: 'sale', occurredAt: '2030-01-01T09:00:00Z', quantity: 1, amountKopecks: 10000 }
  const sale = (await state.run('channel.record', { ...input, channelTitle: 'Видимый канал' })).data
  await state.run('channel.record', { ...input, channelTitle: 'видимый канал' })
  state.table('ChannelRecords').push(
    { ...sale, _id: 'f'.repeat(24), tenantId: otherTenant, locationId, channelKey: 'other-tenant', channelTitle: 'Другая компания' },
    { ...sale, _id: 'e'.repeat(24), tenantId, locationId: otherLocation, channelKey: 'other-location', channelTitle: 'Другая площадка' },
  )
  const scoped = actor()
  scoped.position.orderScope.locationIds = [locationId]
  const { data } = await state.read(`section=channelSummary&sessionId=${event._id}`, scoped)
  assert.equal(data.records.length, 0)
  assert.deepEqual(data.suggestedChannels, [{ channelKey: sale.channelKey, channelTitle: 'видимый канал' }])
})

test('partly paid CRM purchases keep unclear canceled portions out of sold totals', async () => {
  const state = setup(), program = await state.program(), event = await state.show(program, 10)
  const sale = (await state.run('sale.create', { programId: program._id, sessionId: event._id, quantity: 4, initialPayment: { amountKopecks: 10000, method: 'cash' } })).data
  await state.run('refund.record', { saleId: sale._id, quantity: 2, amountKopecks: 1000, method: 'cash', reason: 'Частичная отмена' })
  const summary = (await state.read(`section=channelSummary&sessionId=${event._id}`)).data
  assert.equal(summary.totals.netQuantity, 0)
  assert.equal(summary.totals.netAmountKopecks, 0)
  assert.equal(summary.unpaidQuantity, 2)
  assert.equal(summary.unclassifiedRefundQuantity, 2)
  assert.equal(summary.channels[0].cashRefundedAmountKopecks, 1000)
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
