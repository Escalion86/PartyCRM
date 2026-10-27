import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as listQuery from '../helpers/partyOrderListQuery.js'
import * as calendarQuery from '../helpers/partyOrderCalendarQuery.js'
import * as taskHelpers from '../helpers/partyTasks.js'
import { canPartyAccess, buildPartyOrderAccessFilter, filterPartyOrderForAccess } from '../helpers/partyRolePermissions.js'

const strip = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export const ', 'const ')
const [routeSource, pageSource, summarySource, taskSource] = await Promise.all(['../app/api/party/orders/route.js', './partyOrderListPage.js', './partyOrderTaskSummaries.js', './partyTasks.js'].map(strip))
const instantiate = (source, name, deps) => new Function(...Object.keys(deps), `${source}\nreturn ${name}`)(...Object.values(deps))
const validId = (value) => /^[a-f\d]{24}$/i.test(String(value))
const canReadTask = instantiate(taskSource, 'canReadTask', { ...taskHelpers, canPartyAccess, isValidObjectId: validId })
const id = (number) => number.toString(16).padStart(24, '0')
const tenantId = 'a'.repeat(24), staffId = 'b'.repeat(24), positionId = 'c'.repeat(24), locationId = 'd'.repeat(24)
const actor = (permissions = {}) => ({ tenantId, role: 'performer', staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId }, company: { settings: { workflow: { initialStageId: 'new', stages: [{ id: 'new', title: 'Новая' }, { id: 'preparation', title: 'Подготовка' }] } } }, position: { _id: positionId, tenantId, active: true, permissions: { orders: 'read', 'orders.title': 'read', 'orders.client.name': 'read', 'orders.serviceTitle': 'read', 'orders.workflowStageId': 'read', 'orders.eventDate': 'read', tasks: 'read', reports: 'read', ...permissions }, orderScope: { locationIds: [locationId], includeUnlocated: false, stageIds: ['new', 'preparation'] } } })
const order = (number, changes = {}) => ({ _id: id(number), tenantId, locationId, title: `Заказ ${number}`, client: { name: 'Клиент' }, serviceTitle: 'Услуга', status: 'active', workflowStageId: 'preparation', eventDate: '2026-10-28T10:00:00Z', assignedStaff: [], contractAmount: 98765, ...changes })
const task = (number, changes = {}) => ({ _id: id(number + 10000), tenantId, orderId: id(number), status: 'new', title: `Задача ${number}`, assigneeStaffIds: [staffId], ...changes })
const comparable = (value) => value instanceof Date || typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? +new Date(value) : String(value)
const matches = (row, filter) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$and') return expected.every((part) => matches(row, part))
  if (key === '$or') return expected.some((part) => matches(row, part))
  const actual = key.split('.').reduce((value, part) => value?.[part], row)
  if (expected === null) return actual == null
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) return Object.entries(expected).every(([operator, value]) => ({
    $in: () => value.map(String).includes(String(actual)), $ne: () => value === null ? actual != null : String(actual) !== String(value),
    $lt: () => actual != null && comparable(actual) < comparable(value), $gt: () => actual != null && comparable(actual) > comparable(value), $gte: () => actual != null && comparable(actual) >= comparable(value),
    $regex: () => new RegExp(value, expected.$options || '').test(String(actual ?? '')), $options: () => true,
  })[operator]?.() === true)
  return String(actual) === String(expected)
})

function setup({ orders = [], tasks = [], context = actor() } = {}) {
  const orderQueries = [], taskQueries = [], ledgerQueries = [], reportCalls = []
  const query = (records) => {
    let result = structuredClone(records)
    return { select() { return this }, sort(sort) { if (sort._id) result.sort((a, b) => sort._id * String(a._id).localeCompare(String(b._id))); return this }, limit(size) { result = result.slice(0, size); return this }, lean: async () => result }
  }
  const summarizeTasks = instantiate(summarySource, 'withPartyOrderTaskSummaries', { canReadTask, canPartyAccess, getPartyTaskModel: async () => ({ find: (filter) => { taskQueries.push(filter); return query(tasks.filter((row) => matches(row, filter))) } }) })
  const loadPartyOrderListPage = instantiate(pageSource, 'loadPartyOrderListPage', { ...listQuery, withPartyOrderTaskSummaries: summarizeTasks })
  const deps = {
    ...listQuery, ...calendarQuery, loadPartyOrderListPage, canPartyAccess, buildPartyOrderAccessFilter, filterPartyOrderForAccess,
    getPartyRequestContext: async () => ({ context }), partyError: (status, code) => ({ status, code }), NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyOrderModel: async () => ({ find: (filter) => { const call = { filter }; orderQueries.push(call); const result = query(orders.filter((row) => matches(row, filter))); const sort = result.sort, limit = result.limit; result.sort = (value) => { call.sort = value; return sort.call(result, value) }; result.limit = (value) => { call.limit = value; return limit.call(result, value) }; return result } }),
    getPartyStaffModel: async () => ({ find: () => query([]) }), getPartyTransactionModel: async () => ({ find: (filter) => { ledgerQueries.push(filter); return query([]) } }),
    applyPartyAssignmentConfirmationDefaults: ({ assignedStaff }) => assignedStaff,
    withPartyOrderTaskSummaries: summarizeTasks, withPartyOrderReportSummaries: async ({ orders }) => { reportCalls.push(orders.map((row) => row._id)); return orders.map((row) => ({ ...row, reportSummary: { waiting: 0, revision: 0, submitted: 0 } })) },
  }
  const GET = instantiate(routeSource, 'GET', deps)
  return { run: (params = '') => GET({ url: `http://test/orders?${params}` }), orderQueries, taskQueries, ledgerQueries, reportCalls }
}

test('list opt-in pages past 120 in descending immutable IDs and scopes before limiting', async () => {
  const own = Array.from({ length: 155 }, (_, index) => order(index + 1))
  const run = setup({ orders: [...own, order(900, { tenantId: id(900) }), order(901, { locationId: id(901) }), order(902, { workflowStageId: 'secret-stage' }), order(903, { status: 'canceled' })] })
  const found = []
  let cursor = ''
  do {
    const result = await run.run(`view=list${cursor ? `&listCursor=${cursor}` : ''}`)
    assert.equal(result.status, 200)
    assert.equal(result.body.meta.total, null)
    assert.equal(result.body.meta.returned, result.body.data.length)
    assert.ok(result.body.data.length <= 40)
    assert.equal(result.body.data[0]?.contractAmount, undefined)
    found.push(...result.body.data.map((row) => row._id))
    cursor = result.body.meta.nextCursor
  } while (cursor)
  assert.deepEqual(found, own.map((row) => row._id).reverse())
  assert.equal(new Set(found).size, 155)
  assert.deepEqual(run.orderQueries[0].sort, { _id: -1 })
  assert.equal(run.orderQueries[0].limit, 41)
  assert.equal(run.orderQueries[0].filter.$and[0].tenantId, tenantId)
  assert.equal(run.ledgerQueries[0].orderId.$in.length, 40)
  assert.equal(run.reportCalls[0].length, 40)
})

test('search is literal, case-insensitive and never matches a hidden field', async () => {
  const rows = [order(1, { title: 'Праздник .* [a]' }), order(2, { title: 'Праздник любой', client: { name: 'Секретный клиент' } })]
  assert.deepEqual((await setup({ orders: rows }).run('view=list&q=.*%20%5Ba%5D')).body.data.map((row) => row._id), [id(1)])
  assert.equal((await setup({ orders: rows }).run('view=list&q=ПРАЗДНИК')).body.data.length, 2)
  const hidden = setup({ orders: rows, context: actor({ 'orders.client.name': 'hidden' }) })
  assert.equal((await hidden.run('view=list&q=Секретный')).body.data.length, 0)
  assert.doesNotMatch(JSON.stringify(hidden.orderQueries), /client\.name/)
  const noSearch = setup({ orders: rows, context: actor({ 'orders.title': 'hidden', 'orders.client.name': 'hidden', 'orders.serviceTitle': 'hidden' }) })
  assert.equal((await noSearch.run('view=list&q=anything')).status, 403)
  assert.equal(noSearch.orderQueries.length, 0)
})

test('stage filtering includes initial missing/null/empty fallback but no other stage', async () => {
  const rows = [order(1, { workflowStageId: 'new' }), order(2, { workflowStageId: null }), order(3, { workflowStageId: '' }), order(4), order(5)]
  delete rows[4].workflowStageId
  assert.deepEqual((await setup({ orders: rows }).run('view=list&stageId=new')).body.data.map((row) => row._id), [id(5), id(3), id(2), id(1)])
  const hidden = setup({ orders: rows, context: actor({ 'orders.workflowStageId': 'hidden' }) })
  assert.equal((await hidden.run('view=list&stageId=new')).status, 403)
  assert.equal(hidden.orderQueries.length, 0)
})

test('today accepts a bounded explicit midnight window and undated never infers a hidden date', async () => {
  const rows = [order(1, { eventDate: '2026-10-27T17:00:00Z' }), order(2, { eventDate: '2026-10-28T16:59:59Z' }), order(3, { eventDate: '2026-10-28T17:00:00Z' }), order(4, { eventDate: null })]
  const today = 'view=list&quick=today&todayFrom=2026-10-27T17:00:00Z&todayTo=2026-10-28T17:00:00Z'
  assert.deepEqual((await setup({ orders: rows }).run(today)).body.data.map((row) => row._id), [id(2), id(1)])
  assert.deepEqual((await setup({ orders: rows }).run('view=list&quick=undated')).body.data.map((row) => row._id), [id(4)])
  for (const params of [today, 'view=list&quick=undated']) {
    const hidden = setup({ orders: rows, context: actor({ 'orders.eventDate': 'hidden' }) })
    assert.equal((await hidden.run(params)).status, 403)
    assert.equal(hidden.orderQueries.length, 0)
  }
})

test('invalid opt-in modes, filters, mixed calendar, dates and cursor fail before storage', async () => {
  const bad = ['view=wrong', 'view=list&quick=unknown', 'view=list&q=' + 'x'.repeat(161), 'view=list&stageId=$bad', 'view=list&listCursor=not-an-id', 'view=list&dateFrom=', 'view=list&calendarCursor=', 'view=list&preparation=open', 'view=list&todayFrom=2026-10-28T00:00:00Z', 'view=list&quick=today', 'view=list&quick=today&todayFrom=2026-02-30T00:00:00Z&todayTo=2026-03-01T00:00:00Z', 'view=list&quick=today&todayFrom=2026-10-28T00:00:00Z&todayTo=2026-10-30T00:00:00Z', 'view=list&quick=today&todayFrom=2026-10-28T00:00:00Z&todayTo=2026-10-27T00:00:00Z', 'view=list&q=a&q=b']
  for (const params of bad) {
    const instance = setup()
    assert.equal((await instance.run(params)).status, 400, params)
    assert.equal(instance.orderQueries.length, 0, params)
  }
  const hidden = setup({ context: actor({ tasks: 'hidden' }) })
  assert.equal((await hidden.run('view=list&quick=tasks')).status, 403)
  assert.equal(hidden.taskQueries.length, 0)
})

test('task filter scans beyond 120, respects assignment/location and replaces legacy mirrors read-only', async () => {
  const rows = Array.from({ length: 160 }, (_, index) => order(index + 1))
  rows[0].additionalEvents = [{ _id: 'legacy', title: 'Старое напоминание', responsibleStaffId: staffId, date: '2026-10-28T10:00:00Z' }]
  rows[1].additionalEvents = [{ _id: 'legacy', title: 'Не перенесено', responsibleStaffId: staffId }]
  const instance = setup({ orders: rows, tasks: [task(5), task(4, { assigneeStaffIds: [], assigneeRoleId: positionId }), task(3, { assigneeStaffIds: [id(999)] }), task(6, { locationId: id(999) }), task(1, { sourceKey: `order:${id(1)}:additional:legacy`, status: 'done' })] })
  const result = await instance.run('view=list&quick=tasks')
  assert.deepEqual(result.body.data.map((row) => row._id), [id(5), id(4), id(2)])
  assert.equal(result.body.meta.hasMore, false)
  assert.equal(result.body.meta.scanned, 160)
  assert.equal(instance.orderQueries.length, 2)
  assert.equal(instance.taskQueries.length, 2, 'reuse scan summaries instead of hydrating tasks again')
  assert.equal(instance.ledgerQueries[0].orderId.$in.length, 3)
  assert.doesNotMatch(pageSource, /ensurePartyOrderTasks|getPartyTaskOrderReadiness|\.save\(|\.update/)
})

test('task scan budget gives an advancing empty continuation instead of a false end', async () => {
  const rows = Array.from({ length: 450 }, (_, index) => order(index + 1))
  const instance = setup({ orders: rows, tasks: [task(1)] })
  const first = await instance.run('view=list&quick=tasks')
  assert.deepEqual(first.body.data, [])
  assert.deepEqual(first.body.meta, { nextCursor: id(51), hasMore: true, returned: 0, scanned: 400, total: null })
  assert.equal(instance.ledgerQueries.length, 0)
  const next = await instance.run(`view=list&quick=tasks&listCursor=${first.body.meta.nextCursor}`)
  assert.deepEqual(next.body.data.map((row) => row._id), [id(1)])
  assert.equal(next.body.meta.nextCursor, null)
  assert.equal(next.body.meta.scanned, 50)
})

test('task lookahead cursor never skips matches and pages do not duplicate orders', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => order(index + 1)), tasks = rows.map((row) => task(parseInt(row._id, 16)))
  const instance = setup({ orders: rows, tasks }), found = []
  let cursor = ''
  do {
    const result = await instance.run(`view=list&quick=tasks${cursor ? `&listCursor=${cursor}` : ''}`)
    found.push(...result.body.data.map((row) => row._id))
    cursor = result.body.meta.nextCursor
  } while (cursor)
  assert.deepEqual(found, rows.map((row) => row._id).reverse())
})

test('legacy and calendar calls retain their response and ordering contracts', async () => {
  const rows = Array.from({ length: 125 }, (_, index) => order(index + 1))
  const legacy = await setup({ orders: rows }).run()
  assert.equal(legacy.body.data.length, 120)
  assert.equal(Object.hasOwn(legacy.body, 'meta'), false)
  const calendar = await setup({ orders: rows }).run('dateFrom=2026-10-01T00:00:00Z&dateTo=2026-11-01T00:00:00Z')
  assert.equal(calendar.body.data.length, 120)
  assert.deepEqual(Object.keys(calendar.body.meta).sort(), ['dateFrom', 'dateTo', 'nextCursor'])
  assert.equal(calendar.body.data[0]._id, id(1))
})
