import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as taskHelpers from '../helpers/partyTasks.js'
import * as queryHelpers from '../helpers/partyTaskQuery.js'
import { canPartyAccess, buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'

const id = (number) => number.toString(16).padStart(24, '0')
const tenantId = id(10000), staffId = id(10001), userId = id(10002), roleId = id(10003), otherId = id(10004), orderId = id(10005)
const owner = { tenantId, role: 'owner', staff: { _id: staffId, tenantId, status: 'active', role: 'owner' }, sessionUser: { _id: userId }, company: { settings: { timeZone: 'Asia/Krasnoyarsk' } } }
const member = (permissions = {}, scope = {}) => ({ ...owner, role: 'performer', staff: { ...owner.staff, role: 'performer', positionId: roleId }, position: { _id: roleId, tenantId, active: true, permissions: { tasks: 'read', 'tasks.complete': 'edit', ...permissions }, orderScope: scope } })
const row = (number, extra = {}) => ({ _id: id(number), tenantId, title: `Задача ${number}`, status: 'new', revision: 0, dueAt: null, assigneeStaffIds: [staffId], assigneeRoleId: null, locationId: null, orderId: null, history: [], ...extra })
const equal = (actual, expected) => expected == null ? actual == null : String(actual) === String(expected)
const matches = (row, filter) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$and') return expected.every((value) => matches(row, value))
  if (key === '$or') return expected.some((value) => matches(row, value))
  const actual = key.split('.').reduce((value, part) => value?.[part], row)
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) return Object.entries(expected).every(([operator, value]) => {
    if (operator === '$in') return (Array.isArray(actual) ? actual : [actual]).some((entry) => value.some((other) => equal(entry, other)))
    if (operator === '$ne') return !equal(actual, value)
    if (operator === '$lt') return actual != null && String(actual) < String(value)
    if (operator === '$exists') return (actual !== undefined) === value
    throw new Error(`Unexpected ${operator}`)
  })
  return Array.isArray(actual) ? actual.some((value) => equal(value, expected)) : equal(actual, expected)
})
const stripped = (source) => source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const serviceSource = stripped(await readFile(new URL('./partyTasks.js', import.meta.url), 'utf8'))
const routeSource = stripped(await readFile(new URL('../app/api/party/tasks/route.js', import.meta.url), 'utf8'))

function setup({ tasks = [], orders = [], context = owner } = {}) {
  const calls = []
  const tables = { Tasks: tasks, Orders: orders, Staff: [context.staff, { _id: otherId, tenantId, status: 'active', firstName: 'Другой' }], Roles: [{ _id: roleId, tenantId, active: true, title: 'Должность' }], Locations: [] }
  const model = (name) => ({
    find: (filter) => {
      calls.push({ name, filter: structuredClone(filter) })
      let count = Infinity, sort = null
      return {
        select() { return this },
        sort(value) { sort = value; return this },
        limit(value) { count = value; return this },
        async lean() {
          let selected = tables[name].filter((entry) => matches(entry, filter))
          if (sort?._id) selected = [...selected].sort((a, b) => sort._id * String(a._id).localeCompare(String(b._id)))
          return structuredClone(selected.slice(0, count))
        },
      }
    },
    findOne: (filter) => ({ lean: async () => structuredClone(tables[name].find((entry) => matches(entry, filter)) || null) }),
  })
  const models = Object.fromEntries(Object.keys(tables).map((name) => [name, model(name)]))
  const deps = {
    ...taskHelpers, ...queryHelpers, canPartyAccess, buildPartyOrderAccessFilter,
    getPartyTaskModel: async () => models.Tasks,
    getPartyOrderModel: async () => models.Orders,
    getPartyStaffModel: async () => models.Staff,
    getPartyRoleModel: async () => models.Roles,
    getPartyLocationModel: async () => models.Locations,
    getPartyRequestContext: async () => ({ context }),
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value || '')),
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    partyError: (status, code, message) => ({ status, body: { success: false, error: { code, message } } }),
  }
  const service = new Function(...Object.keys(deps), `${serviceSource}\nreturn { withTaskContext,taskJson,canManageTask,serializeTask,taskStaff,canAccessTaskLocation,canReadTask,buildPartyTaskListAccessFilter }`)(...Object.values(deps))
  const bindings = { ...deps, ...service, ensurePartyOrderTasks: async () => {}, loadTaskOrder: async () => null, createPartyTaskForContext: async () => { throw new Error('Unexpected write') } }
  const GET = new Function(...Object.keys(bindings), `${routeSource}\nreturn GET`)(...Object.values(bindings))
  return { get: (params = '') => GET({ url: `http://localhost/api/party/tasks?${params}` }), calls, service }
}

test('GET defaults preserve all statuses, enforce tenant, and page 125 tasks without omissions', async () => {
  const tasks = Array.from({ length: 125 }, (_, index) => row(index + 1, { status: ['new', 'in_progress', 'done', 'canceled'][index % 4] }))
  const h = setup({ tasks: [...tasks, row(900, { tenantId: id(20000) })] })
  const seen = []
  let cursor = ''
  do {
    const response = await h.get(cursor ? `cursor=${cursor}` : '')
    assert.equal(response.status, 200)
    const page = response.body.data
    assert.equal(Object.hasOwn(page, 'total'), false)
    seen.push(...page.tasks.map((entry) => entry._id))
    cursor = page.nextCursor
  } while (cursor)
  assert.deepEqual(seen, tasks.map((entry) => entry._id).reverse())
  assert.equal(new Set(seen).size, 125)
  assert.equal(h.calls.filter((call) => call.name === 'Tasks').every((call) => String(call.filter.tenantId) === tenantId), true)
})

test('independent board columns intersect status and filter without replacing task ACL', async () => {
  const tasks = Array.from({ length: 180 }, (_, index) => row(index + 1, { status: ['new', 'in_progress', 'done'][index % 3], assigneeStaffIds: index % 2 ? [staffId] : [otherId] }))
  const h = setup({ tasks, context: member() })
  for (const status of ['new', 'in_progress', 'done']) {
    const response = await h.get(`status=${status}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.tasks.length, 30)
    assert.equal(response.body.data.tasks.every((entry) => entry.status === status && entry.assigneeStaffIds.includes(staffId)), true)
  }
  const impossible = await h.get('filter=open&status=done')
  assert.deepEqual(impossible.body.data.tasks, [])
  assert.equal(impossible.body.data.nextCursor, null)
})

test('server search finds older tasks past the first page and treats regex syntax literally', async () => {
  const h = setup({ tasks: Array.from({ length: 180 }, (_, index) => row(index + 1, { title: index === 0 ? 'Позвонить [VIP]' : 'Обычная задача' })) })
  const response = await h.get('search=%5Bvip%5D')
  assert.deepEqual(response.body.data.tasks.map((entry) => entry._id), [id(1)])
  assert.equal(response.body.data.nextCursor, null)
  assert.deepEqual((await h.get('search=.*')).body.data.tasks, [])
})

test('bounded sparse search returns a continuation even on an empty page and eventually finds the task', async () => {
  const h = setup({ tasks: Array.from({ length: 1050 }, (_, index) => row(index + 1, { title: index === 0 ? 'Игла' : 'Сено' })) })
  const first = (await h.get('search=Игла')).body.data
  assert.deepEqual(first.tasks, [])
  assert.equal(first.nextCursor, id(51))
  const next = (await h.get(`search=Игла&cursor=${first.nextCursor}`)).body.data
  assert.deepEqual(next.tasks.map((entry) => entry._id), [id(1)])
  assert.equal(next.nextCursor, null)
})

test('dangling inaccessible order tasks cannot shorten a visible page or skip older accessible tasks', async () => {
  const valid = Array.from({ length: 75 }, (_, index) => row(index + 1))
  const missingOrders = Array.from({ length: 110 }, (_, index) => row(index + 76, { orderId }))
  const h = setup({ tasks: [...valid, ...missingOrders] })
  const first = (await h.get()).body.data
  assert.equal(first.tasks.length, 50)
  assert.deepEqual(first.tasks.map((task) => task._id), valid.slice(25).reverse().map((task) => task._id))
  const last = (await h.get(`cursor=${first.nextCursor}`)).body.data
  assert.deepEqual(last.tasks.map((task) => task._id), valid.slice(0, 25).reverse().map((task) => task._id))
  assert.equal(last.nextCursor, null)
})

test('synthetic developer membership can filter author by real user without invalid staff ObjectId casts', async () => {
  const developer = { ...owner, staff: { ...owner.staff, _id: 'dev:owner:synthetic' } }
  const h = setup({ context: developer, tasks: [row(1, { createdByUserId: userId }), row(2)] })
  assert.deepEqual((await h.get('scope=mine')).body.data.tasks, [])
  assert.deepEqual((await h.get('scope=created')).body.data.tasks.map((task) => task._id), [id(1)])
  const authorQueries = h.calls.filter((call) => call.name === 'Tasks')
  assert.equal(authorQueries.some((call) => JSON.stringify(call.filter).includes('dev:owner:synthetic')), false)
})

test('mine, position, created-by-user and all available retain their separate meanings', async () => {
  const tasks = [row(1), row(2, { assigneeStaffIds: [], assigneeRoleId: roleId }), row(3, { assigneeStaffIds: [otherId], createdByUserId: userId }), row(4, { assigneeStaffIds: [otherId] })]
  const h = setup({ tasks, context: member() })
  for (const [scope, ids] of [['mine', [1]], ['role', [2]], ['created', [3]], ['all', [3, 2, 1]]]) {
    const result = (await h.get(`scope=${scope}`)).body.data
    assert.deepEqual(result.tasks.map((entry) => entry._id), ids.map(id))
  }
})

test('projected search cannot discover a hidden order title or task title/deadline', async () => {
  const context = member()
  const h = setup({
    context,
    tasks: [row(1, { title: 'Секретный реквизит', dueAt: '2026-01-01T00:00:00Z', orderId }), row(2, { assigneeStaffIds: [], assigneeRoleId: roleId, title: 'Секретный артист', orderId })],
    orders: [{ _id: orderId, tenantId, title: 'Закрытый клиент', serviceTitle: 'Скрытая услуга', status: 'active', locationId: null }],
  })
  for (const scope of ['mine', 'role']) {
    const result = (await h.get(`scope=${scope}`)).body.data
    assert.equal(result.tasks.length, 1)
    assert.equal(result.tasks[0].title, 'Задача по недоступному заказу')
    assert.equal(result.tasks[0].dueAt, null)
    assert.equal(result.tasks[0].canComplete, false)
    assert.equal(result.tasks[0].canReopen, false)
    assert.ok(result.tasks[0].blockedReason)
  }
  for (const query of ['search=Секретный', 'search=Закрытый', 'search=Скрытая', 'filter=overdue']) {
    assert.deepEqual((await h.get(query)).body.data.tasks, [], query)
  }
  assert.equal((await h.get('filter=undated')).body.data.tasks.length, 2)
})

test('visible order title participates in search only when its field is permitted', async () => {
  const orders = [{ _id: orderId, tenantId, title: 'Праздник клиента', serviceTitle: 'Шоу', status: 'active' }]
  const tasks = [row(1, { orderId })]
  const visible = setup({ tasks, orders, context: member({ orders: 'read', 'orders.title': 'read' }) })
  const hidden = setup({ tasks, orders, context: member({ orders: 'read' }) })
  assert.equal((await visible.get('search=Праздник')).body.data.tasks.length, 1)
  assert.deepEqual((await hidden.get('search=Праздник')).body.data.tasks, [])
})

test('today and overdue apply across pages using one exact local-day window', async () => {
  const tasks = [
    row(1, { dueAt: '2026-10-27T17:00:00Z' }),
    row(2, { dueAt: '2026-10-28T16:59:59Z' }),
    row(3, { dueAt: '2026-10-28T17:00:00Z' }),
    row(4, { dueAt: '2026-10-28T03:00:00Z', status: 'done' }),
    ...Array.from({ length: 70 }, (_, index) => row(index + 5)),
  ]
  const h = setup({ tasks })
  assert.deepEqual((await h.get('filter=today&dayFrom=2026-10-27T17:00:00Z&dayTo=2026-10-28T17:00:00Z')).body.data.tasks.map((entry) => entry._id), [id(2), id(1)])
  assert.deepEqual((await h.get('filter=overdue&now=2026-10-28T03:00:00Z')).body.data.tasks.map((entry) => entry._id), [id(1)])
})

test('invalid input and forbidden task reads are rejected before model access', async () => {
  for (const params of ['cursor=invalid', 'filter=bad', 'status=bad', 'scope=bad', 'dayFrom=2026-10-28T00:00:00Z', 'now=invalid']) {
    const h = setup()
    assert.equal((await h.get(params)).status, 400, params)
    assert.equal(h.calls.length, 0)
  }
  const denied = setup({ context: member({ tasks: 'hidden' }) })
  assert.equal((await denied.get()).status, 403)
  assert.equal(denied.calls.length, 0)
})

test('order task filter cannot open a foreign or inaccessible order', async () => {
  const tasks = [row(1, { orderId })]
  const foreign = setup({ tasks, orders: [{ _id: orderId, tenantId: id(20000) }] })
  assert.equal((await foreign.get(`orderId=${orderId}`)).status, 404)
  const hidden = setup({ tasks, orders: [{ _id: orderId, tenantId, status: 'active' }], context: member() })
  assert.equal((await hidden.get(`orderId=${orderId}`)).status, 404)
})

test('canReopen exactly reflects edit plus complete grants and a writable order', () => {
  const h = setup()
  const terminal = row(1, { status: 'done' })
  assert.equal(h.service.serializeTask(owner, terminal).canReopen, true)
  assert.equal(h.service.serializeTask(member({ 'tasks.edit': 'edit' }), terminal).canReopen, true)
  assert.equal(h.service.serializeTask(member({ 'tasks.edit': 'edit', 'tasks.complete': 'hidden' }), terminal).canReopen, false)
  assert.equal(h.service.serializeTask(member(), terminal).canReopen, false)
  assert.equal(h.service.serializeTask(owner, row(1)).canReopen, false)
  assert.equal(h.service.serializeTask(owner, { ...terminal, orderId }, { order: { _id: orderId, tenantId, status: 'closed' } }).canReopen, false)
})
