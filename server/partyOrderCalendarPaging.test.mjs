import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as calendarQuery from '../helpers/partyOrderCalendarQuery.js'
import { canPartyAccess, buildPartyOrderAccessFilter, filterPartyOrderForAccess } from '../helpers/partyRolePermissions.js'
import { serializePartyTransaction } from './partyTransactionsCore.js'

const tenantId = 'a'.repeat(24), locationId = 'b'.repeat(24), staffId = 'c'.repeat(24)
const id = (number) => number.toString(16).padStart(24, '0')
const fixture = (number, changes = {}) => ({ _id: id(number), tenantId, status: 'active', workflowStageId: 'preparation', locationId, eventDate: '2026-10-15T10:00:00Z', dateEnd: '2026-10-15T12:00:00Z', title: `Заказ ${number}`, assignedStaff: [], contractAmount: 998877, ...changes })
const context = (grants = {}) => ({ tenantId, role: 'performer', staff: { _id: staffId, tenantId, role: 'performer', status: 'active', positionId: id(500) }, position: { _id: id(500), tenantId, active: true, permissions: { orders: 'read', 'orders.title': 'read', 'orders.eventDate': 'read', 'orders.dateEnd': 'read', tasks: 'read', reports: 'read', ...grants }, orderScope: { stageIds: ['preparation'], locationIds: [locationId], includeUnlocated: false, statuses: ['active'] } } })
const code = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export const ', 'const ')
const listCode = await code('../app/api/party/orders/route.js')
const singleCode = await code('../app/api/party/orders/[id]/route.js')
const compare = (value) => value instanceof Date || typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) ? +new Date(value) : String(value)
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$and') return value.every((part) => matches(row, part))
  if (key === '$or') return value.some((part) => matches(row, part))
  const actual = row[key]
  if (value === null) return actual == null
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([operator, expected]) => ({
    $in: () => expected.map(String).includes(String(actual)), $ne: () => expected === null ? actual != null : String(actual) !== String(expected),
    $lt: () => actual != null && compare(actual) < compare(expected), $gt: () => actual != null && compare(actual) > compare(expected),
    $gte: () => actual != null && compare(actual) >= compare(expected),
  })[operator]?.() === true)
  return String(actual) === String(value)
})

function setup({ rows = [], actor = context(), transactions = [] } = {}) {
  const queries = [], ledgerQueries = []
  const q = (records, filter = null) => {
    let values = Array.isArray(records) ? structuredClone(records) : records && structuredClone(records)
    return { select() { return this }, sort(sort) { queries.push({ sort }); if (Array.isArray(values) && sort._id) values.sort((a, b) => String(a._id).localeCompare(String(b._id))); return this }, limit(limit) { queries.push({ limit }); values = values.slice(0, limit); return this }, lean: async () => values }
  }
  const deps = {
    ...calendarQuery, canPartyAccess, buildPartyOrderAccessFilter, filterPartyOrderForAccess, serializePartyTransaction,
    getPartyRequestContext: async () => ({ context: actor }), partyError: (status, code) => ({ status, code }), NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyOrderModel: async () => ({ find: (filter) => { queries.push({ filter }); return q(rows.filter((row) => matches(row, filter))) }, findOne: (filter) => q(rows.find((row) => matches(row, filter)) || null) }),
    getPartyStaffModel: async () => ({ find: () => q([]) }),
    getPartyTransactionModel: async () => ({ find: (filter) => { ledgerQueries.push(filter); return q(transactions.filter((row) => matches(row, filter))) } }),
    applyPartyAssignmentConfirmationDefaults: ({ assignedStaff }) => assignedStaff,
    applyPartyAssignmentAccountDefaults: async ({ payload }) => payload,
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value)),
    withPartyOrderReportSummaries: async ({ orders }) => orders.map((row) => ({ ...row, reportSummary: { waiting: 1, submitted: 0, revision: 0 } })),
    withPartyOrderTaskSummaries: async ({ orders }) => orders.map((row) => ({ ...row, taskSummary: { openCount: 2, overdueCount: 0, nearestTask: null } })),
  }
  const instantiate = (source) => {
    const bindings = { ...deps }
    if (source === listCode) delete bindings.applyPartyAssignmentAccountDefaults
    return new Function(...Object.keys(bindings), `${source}\nreturn GET`)(...Object.values(bindings))
  }
  return { queries, ledgerQueries, list: (query = '') => instantiate(listCode)({ url: `http://test/orders?${query}` }), one: (orderId) => instantiate(singleCode)({}, { params: { id: orderId } }) }
}

const range = 'dateFrom=2026-10-01T00%3A00%3A00.000Z&dateTo=2026-11-01T00%3A00%3A00.000Z'

test('calendar paging reaches orders after 120 without duplicates and scopes the DB query before pagination', async () => {
  const own = Array.from({ length: 151 }, (_, index) => fixture(index + 1))
  const run = setup({ rows: [...own, fixture(900, { tenantId: id(700) }), fixture(901, { locationId: id(701) }), fixture(902, { workflowStageId: 'new' })] })
  const first = await run.list(range)
  assert.equal(first.body.data.length, 120)
  assert.equal(first.body.meta.nextCursor, id(120))
  assert.equal(first.body.data[0].contractAmount, undefined)
  const second = await run.list(`${range}&calendarCursor=${first.body.meta.nextCursor}`)
  assert.equal(second.body.data.length, 31)
  assert.equal(second.body.meta.nextCursor, null)
  assert.equal(new Set([...first.body.data, ...second.body.data].map((row) => row._id)).size, 151)
  assert.deepEqual(run.queries[0].filter.$and[0].tenantId, tenantId)
  assert.equal(JSON.stringify(run.queries[0].filter).includes(locationId), true)
  assert.deepEqual(run.queries[1], { sort: { _id: 1 } })
  assert.deepEqual(run.queries[2], { limit: 121 })
  assert.equal(run.ledgerQueries[0].orderId.$in.length, 120, 'the lookahead row must not be hydrated')
})

test('calendar includes spanning orders only when end-date visibility allows that inference', async () => {
  const rows = [fixture(1, { eventDate: '2026-09-29T10:00:00Z', dateEnd: '2026-10-02T10:00:00Z' }), fixture(2), fixture(3, { eventDate: '2026-09-29T10:00:00Z', dateEnd: null }), fixture(4, { dateEnd: null }), fixture(5, { eventDate: '2026-11-01T00:00:00Z', dateEnd: null })]
  assert.deepEqual((await setup({ rows }).list(range)).body.data.map((row) => row._id), [id(1), id(2), id(4)])
  const hiddenEnd = await setup({ rows, actor: context({ 'orders.dateEnd': 'hidden' }) }).list(range)
  assert.deepEqual(hiddenEnd.body.data.map((row) => row._id), [id(2), id(4)])
  assert.equal(JSON.stringify(hiddenEnd.body).includes('2026-10-02'), false)
})

test('date-hidden positions cannot query calendar ranges or use dates as an inference filter', async () => {
  const run = setup({ rows: [fixture(1)], actor: context({ 'orders.eventDate': 'hidden' }) })
  assert.equal((await run.list(range)).status, 403)
  assert.equal(run.queries.length, 0)
  const legacy = await run.list()
  assert.equal(legacy.status, 200)
  assert.equal(legacy.body.data[0].eventDate, undefined)
  assert.equal(Object.hasOwn(legacy.body, 'meta'), false)
})

test('invalid, reversed, impossible, oversized ranges and malformed cursors never query the DB', async () => {
  for (const query of ['dateFrom=2026-10-01', 'calendarCursor=bad', `${range}&calendarCursor=bad`, 'dateFrom=2026-02-30T00:00:00Z&dateTo=2026-03-02T00:00:00Z', 'dateFrom=2026-11-01T00:00:00Z&dateTo=2026-10-01T00:00:00Z', 'dateFrom=2026-01-01T00:00:00Z&dateTo=2026-06-01T00:00:00Z']) {
    const run = setup()
    assert.equal((await run.list(query)).status, 400, query)
    assert.equal(run.queries.length, 0)
  }
  assert.doesNotThrow(() => calendarQuery.parsePartyOrderCalendarQuery(new URLSearchParams('dateFrom=2026-01-01T00:00:00Z&dateTo=2026-04-04T00:00:00Z')))
})

test('single-order hydration uses persisted ledger and safe summaries after authorization', async () => {
  const order = fixture(1, { transactions: [{ type: 'income', amount: 1 }] })
  const transactions = [ { _id: id(100), tenantId, orderId: order._id, type: 'income', category: 'client_payment', amount: 123.45 }, { _id: id(101), tenantId, orderId: order._id, type: 'expense', category: 'payout', amount: 87654, staffId, comment: 'private-payout' } ]
  const run = setup({ rows: [order], transactions, actor: context({ 'finance.payments': 'read' }) })
  const result = await run.one(order._id)
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.data.transactions.map((row) => row.amount), [123.45])
  assert.equal(JSON.stringify(result.body).includes('private-payout'), false)
  assert.equal(result.body.data.taskSummary.openCount, 2)
  assert.equal(result.body.data.reportSummary.waiting, 1)
  assert.deepEqual(run.ledgerQueries[0], { tenantId, orderId: order._id })
})

test('single-order scope failure precedes financial hydration', async () => {
  const run = setup({ rows: [fixture(1, { locationId: id(999) })] })
  assert.equal((await run.one(id(1))).status, 404)
  assert.equal(run.ledgerQueries.length, 0)
})
