import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Schema, model } from 'mongoose'
import ordersSchema from '../schemas/partyOrdersSchema.js'
import reservationsSchema from '../schemas/partyInventoryReservationsSchema.js'
import { createPartyResourceCalendarService } from './partyResourceCalendar.js'
import { parsePartyResourceCalendarQuery } from '../helpers/partyResourceCalendar.js'

const tenantId = 'a'.repeat(24), staffId = 'b'.repeat(24), locationId = 'c'.repeat(24), resourceId = 'd'.repeat(24)
const numberId = (number) => number.toString(16).padStart(24, '0')
const OrderCast = model('ResourceCalendarOrderCast', new Schema(ordersSchema))
const ReservationCast = model('ResourceCalendarReservationCast', new Schema(reservationsSchema))
const owner = () => ({ tenantId, role: 'owner', staff: { _id: staffId, tenantId, role: 'owner', status: 'active' }, company: { settings: { timeZone: 'Asia/Krasnoyarsk', modules: { ticketing: { enabled: true } } } } })
const scoped = (grants = {}, scope = {}) => ({ ...owner(), role: 'performer', staff: { ...owner().staff, role: 'performer', positionId: numberId(2000) }, position: { _id: numberId(2000), tenantId, active: true, permissions: { orders: 'read', 'orders.title': 'read', 'orders.eventDate': 'read', 'orders.dateEnd': 'read', locations: 'read', 'orders.locationId': 'read', ...grants }, orderScope: { statuses: ['active'], stageIds: ['preparation'], locationIds: [locationId], includeUnlocated: false, ...scope } } })
const order = (number, extra = {}) => ({ _id: numberId(number), tenantId, status: 'active', workflowStageId: 'preparation', title: `Заказ ${number}`, eventDate: new Date('2026-10-29T10:00:00Z'), dateEnd: new Date('2026-10-29T11:00:00Z'), placeType: 'company_location', locationId, assignedStaff: [], ...extra })
const query = (type = 'location', extra = '') => parsePartyResourceCalendarQuery(new URLSearchParams(`dateFrom=2026-10-29T00:00:00Z&dateTo=2026-10-30T00:00:00Z&type=${type}${extra}`))
const values = (row, path) => {
  const parts = path.split('.')
  const visit = (value, offset) => Array.isArray(value) ? value.flatMap((child) => visit(child, offset)) : offset === parts.length ? [value] : visit(value?.[parts[offset]], offset + 1)
  return visit(row, 0)
}
const expression = (row, value) => {
  if (typeof value === 'string' && value.startsWith('$')) return values(row, value.slice(1))[0]
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  if (value.$gt) { const [first, second] = value.$gt.map((part) => expression(row, part)); return first > second }
  if (value.$cond) return expression(row, value.$cond[expression(row, value.$cond[0]) ? 1 : 2])
  if (value.$multiply) return value.$multiply.reduce((result, part) => result * Number(expression(row, part)), 1)
  if (value.$add) return value.$add.reduce((result, part) => result + Number(expression(row, part)), 0)
  return value
}
const scalar = (actual, expected) => {
  if (expected == null) return actual == null
  if (expected instanceof Date) return +new Date(actual) === +expected
  return String(actual) === String(expected)
}
const matches = (row, filter) => Object.entries(filter).every(([field, condition]) => {
  if (field === '$and') return condition.every((part) => matches(row, part))
  if (field === '$or') return condition.some((part) => matches(row, part))
  if (field === '$expr') return expression(row, condition)
  const actuals = values(row, field)
  if (condition instanceof RegExp) return actuals.some((actual) => condition.test(String(actual || '')))
  if (condition && typeof condition === 'object' && !(condition instanceof Date) && !condition.toHexString) return Object.entries(condition).every(([operation, expected]) => {
    if (operation === '$in') return actuals.some((actual) => expected.some((value) => scalar(actual, value)))
    if (operation === '$ne') return actuals.every((actual) => !scalar(actual, expected))
    if (operation === '$type') return actuals.some((actual) => expected === 'date' && actual instanceof Date)
    if (operation === '$lt') return actuals.some((actual) => actual != null && actual < expected)
    if (operation === '$gt') return actuals.some((actual) => actual != null && actual > expected)
    if (operation === '$gte') return actuals.some((actual) => actual != null && actual >= expected)
    if (operation === '$elemMatch') return (row[field] || []).some((actual) => matches(actual, expected))
    throw new Error(`Unsupported matcher ${operation}`)
  })
  return actuals.some((actual) => scalar(actual, condition))
})

const setup = ({ actor = owner(), orders = [], resources = [{ _id: locationId, tenantId, title: 'Зал', status: 'active', preparationMinutes: 30, cleanupMinutes: 20, capacity: 10 }], sessions = [], reservations = [] } = {}) => {
  const queries = [], aggregates = [], modelLoads = []
  const makeQuery = (rows, filter, name) => {
    let data = rows.filter((row) => matches(row, filter))
    const castingQuery = name === 'orders' ? OrderCast.find(filter) : null
    return {
      select() { return this },
      sort(sort) { const fields = Object.entries(sort); data.sort((first, second) => { for (const [field, direction] of fields) { const a = values(first, field)[0], b = values(second, field)[0]; if (String(a) === String(b)) continue; return (a < b ? -1 : 1) * direction } return 0 }); return this },
      limit(limit) { queries.push({ name, limit }); data = data.slice(0, limit); return this },
      lean: async () => data,
      cast() { return castingQuery.cast(OrderCast) }, getFilter: () => castingQuery.getFilter(),
    }
  }
  const Models = {
    Orders: { collection: { name: 'orders' }, find: (filter) => { queries.push({ name: 'orders', filter }); return makeQuery(orders, filter, 'orders') } },
    Resources: { find: (filter) => { queries.push({ name: 'resources', filter }); return makeQuery(resources, filter, 'resources') } },
    Sessions: { find: (filter) => { queries.push({ name: 'sessions', filter }); return makeQuery(sessions, filter, 'sessions') } },
    ticketAccessFilter: (context, extra) => ({ tenantId: context.tenantId, ...(context.position?.orderScope?.locationIds?.length ? { locationId: { $in: context.position.orderScope.locationIds } } : {}), ...extra }),
    Reservations: { schema: ReservationCast.schema, aggregate: async (pipeline) => {
      aggregates.push(pipeline)
      const lookup = pipeline.find((stage) => stage.$lookup).$lookup
      const allowed = orders.filter((value) => matches(value, lookup.pipeline[0].$match) && value.status !== 'canceled')
      let flattened = reservations.filter((batch) => matches(batch, pipeline[0].$match)).flatMap((batch) => batch.rows.map((row) => ({ ...batch, rows: row }))).filter((batch) => matches(batch, pipeline[2].$match))
      flattened = flattened.map((batch) => ({ ...batch, order: allowed.find((value) => String(value._id) === String(batch.orderId)) })).filter((batch) => batch.order)
      flattened.sort((a, b) => +new Date(a.rows.startAt) - +new Date(b.rows.startAt) || String(a._id).localeCompare(String(b._id)))
      return flattened.slice(0, pipeline.find((stage) => stage.$limit).$limit).map((batch) => ({ _id: batch._id, orderId: batch.orderId, row: batch.rows, order: batch.order }))
    } },
  }
  const service = createPartyResourceCalendarService({ getModels: async (options) => { modelLoads.push(options); return Models }, now: () => new Date('2026-10-29T06:00:00Z') })
  return { load: (type, extra = '') => service.load({ context: actor, query: query(type, extra) }), queries, aggregates, modelLoads }
}

test('location lane applies current preparation and cleanup, includes boundary buffers and hides canceled orders', async () => {
  const run = setup({ orders: [order(1), order(2, { eventDate: new Date('2026-10-28T23:00Z'), dateEnd: new Date('2026-10-28T23:50Z') }), order(3, { status: 'canceled' })] })
  const data = await run.load('location')
  assert.equal(data.items.length, 2)
  const main = data.items.find((item) => item.orderId === numberId(1))
  assert.equal(main.start, '2026-10-29T10:00:00.000Z')
  assert.equal(main.occupiedFrom, '2026-10-29T09:30:00.000Z')
  assert.equal(main.occupiedUntil, '2026-10-29T11:20:00.000Z')
  assert.equal(data.partial, false)
  assert.equal(data.timeZone, 'Asia/Krasnoyarsk')
  assert.match(data.notice, /Отсутствие записи не подтверждает/)
})

test('resource scope and order stage/location/tenant permissions are applied before the entry limit', async () => {
  const hidden = Array.from({ length: 605 }, (_, index) => order(index + 1, { locationId: numberId(999) }))
  const run = setup({ actor: scoped(), orders: [...hidden, order(700), order(701, { workflowStageId: 'new' }), order(702, { tenantId: numberId(999) })] })
  const data = await run.load('location')
  assert.deepEqual(data.items.map((row) => row.orderId), [numberId(700)])
  assert.equal(data.partial, false)
  const orderQuery = run.queries.find((value) => value.name === 'orders' && value.filter)
  assert.equal(JSON.stringify(orderQuery.filter).includes('preparation'), true)
  assert.equal(JSON.stringify(orderQuery.filter).includes(locationId), true)
  assert.equal(JSON.stringify(orderQuery.filter).includes(tenantId), true)
  assert.equal(run.queries.find((value) => value.name === 'orders' && value.limit).limit, 601)
})

test('hidden order titles/clients/payments and private grouping never appear in calendar DTO', async () => {
  const actor = scoped({ 'orders.title': 'hidden' })
  const run = setup({ actor, orders: [order(1, { title: 'secret-title', client: { phone: 'secret-phone' }, contractAmount: 987654, partyEventGroupId: 'secret-group', sharedLocationBooking: true })] })
  const data = await run.load('location')
  assert.equal(data.items[0].title, 'Заказ')
  for (const secret of ['secret-title', 'secret-phone', 'secret-group', '987654', 'workflowStageId', 'assignedStaff']) assert.equal(JSON.stringify(data).includes(secret), false)
  assert.match(data.items[0].href, new RegExp(`companyId=${tenantId}&orderId=${numberId(1)}`))
})

test('date-hidden or catalog-hidden roles are refused before loading any model', async () => {
  for (const actor of [scoped({ 'orders.dateEnd': 'hidden' }), scoped({ locations: 'hidden' }), scoped({ 'orders.eventDate': 'hidden' })]) {
    const run = setup({ actor })
    await assert.rejects(run.load('location'), (error) => error.status === 403)
    assert.equal(run.modelLoads.length, 0)
  }
})

test('explicit foreign resource selection fails without searching other-company orders', async () => {
  const run = setup({ actor: scoped() })
  await assert.rejects(run.load('location', `&resourceId=${numberId(999)}`), (error) => error.status === 404)
  assert.equal(run.queries.some((value) => value.name === 'orders'), false)
})

test('missing legacy end uses authorized duration and never infers a hidden duration', async () => {
  const rows = [order(1, { dateEnd: null, durationMinutes: 90 }), order(2, { dateEnd: null, durationMinutes: null })]
  const visible = await setup({ actor: scoped({ 'orders.durationMinutes': 'read' }), orders: rows }).load('location')
  assert.equal(visible.items.find((row) => row.orderId === numberId(1)).end, '2026-10-29T11:30:00.000Z')
  const hidden = await setup({ actor: scoped(), orders: rows }).load('location')
  assert.deepEqual(hidden.items.map((row) => row.orderId), [numberId(2)])
  assert.equal(hidden.partial, true)
})

test('long-running orders beginning before the week are included with half-open boundary semantics', async () => {
  const rows = [order(1, { eventDate: new Date('2026-10-20T10:00Z'), dateEnd: new Date('2026-10-29T10:00Z') }), order(2, { eventDate: new Date('2026-10-20T10:00Z'), dateEnd: new Date('2026-10-28T23:40Z') })]
  assert.deepEqual((await setup({ orders: rows }).load('location')).items.map((row) => row.orderId), [numberId(1)])
})

test('staff calendar uses real order interval, deduplicates repeated assignments and preserves refusal for replacement', async () => {
  const actor = scoped({ staff: 'read', 'orders.assignedStaff': 'read' })
  const rows = [order(1, { assignedStaff: [{ staffId, confirmationStatus: 'declined' }, { staffId }] })]
  const run = setup({ actor, orders: rows, resources: [{ _id: staffId, tenantId, firstName: 'Анна', secondName: 'Петрова', phone: 'secret-phone', status: 'active' }] })
  const data = await run.load('staff')
  assert.equal(data.items.length, 1)
  assert.equal(data.items[0].start, data.items[0].occupiedFrom)
  assert.equal(data.items[0].end, data.items[0].occupiedUntil)
  assert.equal(data.items[0].confirmationStatus, 'declined')
  assert.match(data.intervalNotice, /весь интервал заказа/)
  assert.equal(data.resources[0].title, 'Анна Петрова')
  assert.equal(JSON.stringify(data).includes('secret-phone'), false)
})

test('staff appointments without a known end or duration are incomplete instead of invented one-hour bookings', async () => {
  const actor = scoped({ staff: 'read', 'orders.assignedStaff': 'read' })
  const data = await setup({ actor, orders: [order(1, { dateEnd: null, durationMinutes: null, assignedStaff: [{ staffId }] })], resources: [{ _id: staffId, tenantId, firstName: 'Анна', status: 'active' }] }).load('staff')
  assert.equal(data.items.length, 0)
  assert.equal(data.partial, true)
})

test('ticket sessions require enabled ticket module and permission and use canonical location filter', async () => {
  const session = { _id: numberId(50), tenantId, locationId, title: 'Шоу', startsAt: new Date('2026-10-29T11:10Z'), endsAt: new Date('2026-10-29T12:00Z'), capacity: 6, status: 'scheduled', soldCount: 5, privateField: 'secret' }
  const data = await setup({ orders: [order(1)], sessions: [session, { ...session, _id: numberId(51), status: 'canceled' }] }).load('location')
  assert.equal(data.items.length, 2)
  assert.equal(data.items.find((row) => row.kind === 'ticket_session').href, `/performer/ticketing?companyId=${tenantId}&sessionId=${numberId(50)}`)
  assert.deepEqual(data.items.map((row) => row.conflict), [true, true])
  assert.equal(JSON.stringify(data).includes('soldCount'), false)
  const disabled = owner(); disabled.company.settings.modules.ticketing.enabled = false
  assert.equal((await setup({ actor: disabled, sessions: [session] }).load('location')).items.length, 0)
  const denied = setup({ actor: scoped(), sessions: [session] })
  assert.equal((await denied.load('location')).items.length, 0)
  assert.equal(denied.queries.some((row) => row.name === 'sessions'), false)
})

test('entry and catalog caps report partial rather than pretending the visible period is complete', async () => {
  const data = await setup({ orders: Array.from({ length: 602 }, (_, index) => order(index + 1)) }).load('location')
  assert.equal(data.items.length, 600)
  assert.equal(data.partial, true)
  assert.equal(data.hasMore, true)
  const catalog = await setup({ resources: Array.from({ length: 102 }, (_, index) => ({ _id: numberId(index + 1), tenantId, title: `Зал ${index}`, status: 'active' })) }).load('location')
  assert.equal(catalog.resources.length, 100)
  assert.equal(catalog.partial, true)
})

test('resource search filters the catalogue before its limit and reaches the 101st resource', async () => {
  const resources = Array.from({ length: 101 }, (_, index) => ({ _id: numberId(index + 1), tenantId, title: index === 100 ? 'Последний зал' : `Зал ${index}`, status: 'active' }))
  const run = setup({ resources })
  const data = await run.load('location', `&resourceSearch=${encodeURIComponent('последний')}`)
  assert.equal(data.resources.length, 1)
  assert.equal(data.resources[0].id, numberId(101))
  assert.equal(data.partial, false)
  assert.equal(data.resourceSearch, 'последний')
  assert.ok(run.queries[0].filter.title instanceof RegExp)
  assert.equal(run.queries[0].filter.tenantId, tenantId)
})

test('resource search treats regular expression syntax literally and staff search supports surname', async () => {
  const resources = [{ _id: locationId, tenantId, title: 'Зал [VIP]+', status: 'active' }, { _id: numberId(2), tenantId, title: 'Зал VIP', status: 'active' }]
  const data = await setup({ resources }).load('location', `&resourceSearch=${encodeURIComponent('[VIP]+')}`)
  assert.deepEqual(data.resources.map((row) => row.id), [locationId])
  const staff = [{ _id: staffId, tenantId, firstName: 'Анна', secondName: 'Петрова', status: 'active' }, { _id: numberId(2), tenantId, firstName: 'Ирина', secondName: 'Иванова', status: 'active' }]
  const actor = scoped({ staff: 'read', 'orders.assignedStaff': 'read' })
  const found = await setup({ actor, resources: staff }).load('staff', `&resourceSearch=${encodeURIComponent('петрова')}`)
  assert.deepEqual(found.resources.map((row) => row.id), [staffId])
})

test('inventory service intervals are canonical reservation rows even when outside the event interval', async () => {
  const actor = scoped({ inventory: 'read', 'inventory.catalog': 'read', 'inventory.stock': 'read', 'inventory.reservations': 'read' })
  const saved = order(1, { eventDate: new Date('2026-11-10T10:00Z'), dateEnd: new Date('2026-11-10T12:00Z') })
  const row = { _id: numberId(80), resourceId, serviceId: numberId(85), serviceLineId: 'line-a', quantity: 2, startAt: new Date('2026-10-29T07:00Z'), endAt: new Date('2026-10-29T08:00Z') }
  const run = setup({ actor, orders: [saved], resources: [{ _id: resourceId, tenantId, title: 'Костюм', unit: 'компл.', status: 'active', quantity: 4, unavailableQuantity: 1 }], reservations: [{ _id: numberId(60), tenantId, orderId: saved._id, status: 'active', rows: [row] }] })
  const data = await run.load('inventory')
  assert.equal(data.items[0].start, '2026-10-29T07:00:00.000Z')
  assert.equal(data.items[0].quantity, 2)
  assert.equal(data.resources[0].capacity, 3)
  assert.equal(data.items[0].conflict, false)
  assert.equal(JSON.stringify(data).includes('line-a'), false)
  const pipeline = run.aggregates[0]
  assert.equal(pipeline[0].$match.tenantId.toHexString(), tenantId)
  assert.equal(pipeline[0].$match.rows.$elemMatch.resourceId.$in[0].toHexString(), resourceId)
  assert.ok(pipeline.findIndex((stage) => stage.$lookup) < pipeline.findIndex((stage) => stage.$limit))
  assert.equal(pipeline.find((stage) => stage.$lookup).$lookup.pipeline[0].$match.tenantId.toHexString(), tenantId)
})

test('inventory lookup applies order visibility before its limit even with 605 hidden reservations', async () => {
  const actor = scoped({ inventory: 'read', 'inventory.catalog': 'read', 'inventory.stock': 'read', 'inventory.reservations': 'read' })
  const hidden = Array.from({ length: 605 }, (_, index) => order(index + 1, { workflowStageId: 'new' }))
  const orders = [...hidden, order(700)]
  const reservations = orders.map((value) => ({ _id: numberId(Number.parseInt(value._id, 16) + 1000), tenantId, orderId: value._id, status: 'active', rows: [{ _id: numberId(9000), resourceId, quantity: 1, serviceLineId: 'saved', startAt: new Date('2026-10-29T10:00Z'), endAt: new Date('2026-10-29T11:00Z') }] }))
  const data = await setup({ actor, orders, resources: [{ _id: resourceId, tenantId, title: 'Набор', quantity: 5, status: 'active' }], reservations }).load('inventory')
  assert.deepEqual(data.items.map((row) => row.orderId), [numberId(700)])
  assert.equal(data.partial, false)
})

test('legacy inventory keys do not embed a hidden service or line identifier', async () => {
  const actor = scoped({ inventory: 'read', 'inventory.catalog': 'read', 'inventory.stock': 'read', 'inventory.reservations': 'read' })
  const data = await setup({ actor, orders: [order(1)], resources: [{ _id: resourceId, tenantId, title: 'Набор', quantity: 5, status: 'active' }], reservations: [{ _id: numberId(600), tenantId, orderId: numberId(1), status: 'active', rows: [{ resourceId, quantity: 1, serviceLineId: 'secret-service-id', startAt: new Date('2026-10-29T10:00Z'), endAt: new Date('2026-10-29T11:00Z') }] }] }).load('inventory')
  assert.equal(data.items.length, 1)
  assert.equal(JSON.stringify(data).includes('secret-service-id'), false)
  assert.equal(data.items[0].id, `inventory:${numberId(600)}:0`)
})

test('malformed legacy session capacity is an explicit incomplete check, not a false free slot', async () => {
  const sessions = [{ _id: numberId(1), tenantId, locationId, title: 'Шоу', startsAt: new Date('2026-10-29T10:00Z'), endsAt: new Date('2026-10-29T11:00Z'), capacity: null, status: 'scheduled' }]
  const data = await setup({ sessions }).load('location')
  assert.equal(data.partial, true)
  assert.equal(data.items.length, 0)
})

const routeCode = (await readFile(new URL('../app/api/party/resource-calendar/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ').replaceAll('export async function ', 'async function ')
const route = (deps) => new Function(...Object.keys(deps), `${routeCode}\nreturn GET`)(...Object.values(deps))
const response = { json: (body, options) => ({ body, ...options, status: 200 }) }
test('resource API honors auth errors, safely handles context exceptions and does not expose internal messages', async () => {
  const base = { NextResponse: response, parsePartyResourceCalendarQuery, loadPartyResourceCalendar: async () => { throw new Error('must not load') }, partyError: (status, code, message, type) => ({ status, code, message, type }) }
  const req = { url: 'http://test/resource-calendar' }
  assert.equal((await route({ ...base, getPartyRequestContext: async () => ({ error: { status: 401 } }) })(req)).status, 401)
  const failure = await route({ ...base, getPartyRequestContext: async () => { throw new Error('secret-db-address') } })(req)
  assert.equal(failure.status, 500)
  assert.equal(JSON.stringify(failure).includes('secret-db-address'), false)
})

test('resource API validates range before loading data and marks success private/no-store', async () => {
  let loads = 0
  const deps = { NextResponse: response, getPartyRequestContext: async () => ({ context: owner() }), parsePartyResourceCalendarQuery, loadPartyResourceCalendar: async ({ query }) => { loads += 1; return { type: query.type } }, partyError: (status) => ({ status }) }
  assert.equal((await route(deps)({ url: 'http://test/resource-calendar?dateFrom=invalid' })).status, 400)
  assert.equal(loads, 0)
  const valid = await route(deps)({ url: 'http://test/resource-calendar?dateFrom=2026-10-29T00:00:00Z&dateTo=2026-10-30T00:00:00Z&type=staff' })
  assert.equal(valid.headers['Cache-Control'], 'private, no-store')
  assert.equal(valid.body.data.type, 'staff')
})
