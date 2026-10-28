import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import partyTransactionsSchema from '../schemas/partyTransactionsSchema.js'
import partyOrdersSchema from '../schemas/partyOrdersSchema.js'
import partyTasksSchema from '../schemas/partyTasksSchema.js'
import partyStaffSchema from '../schemas/partyStaffSchema.js'
import * as todayHelpers from '../helpers/partyToday.js'
import * as taskHelpers from '../helpers/partyTasks.js'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
} from '../helpers/partyRolePermissions.js'
import { getPartyOrderPreparationReadiness } from '../helpers/partyOrderPreparation.js'
import { getOrderPaymentState } from '../helpers/partyOrderTransactions.js'
import { applyPartyAssignmentConfirmationDefaults } from '../helpers/partyOrderAssignments.js'
import { getPartyWorkflow } from '../helpers/partyWorkflow.js'

const id = (value) => value.toString(16).padStart(24, '0')
const tenantId = id(10000),
  staffId = id(10001),
  userId = id(10002),
  positionId = id(10003),
  otherId = id(10004),
  locationId = id(10005)
const now = new Date('2026-10-29T04:00:00Z')
const owner = {
  tenantId,
  role: 'owner',
  staff: { _id: staffId, tenantId, role: 'owner', status: 'active' },
  sessionUser: { _id: userId },
  company: { settings: { timeZone: 'Asia/Krasnoyarsk' } },
}
const member = (permissions = {}, orderScope = {}) => ({
  ...owner,
  role: 'performer',
  staff: { ...owner.staff, role: 'performer', positionId },
  position: {
    _id: positionId,
    tenantId,
    active: true,
    title: 'Должность',
    permissions,
    orderScope,
  },
})
const order = (n, extra = {}) => ({
  _id: id(n),
  tenantId,
  title: `Заказ ${n}`,
  status: 'active',
  eventDate: new Date('2026-10-29T05:00:00Z'),
  assignedStaff: [],
  ...extra,
})
const task = (n, extra = {}) => ({
  _id: id(n),
  tenantId,
  title: `Задача ${n}`,
  status: 'new',
  dueAt: new Date('2026-10-29T03:00:00Z'),
  assigneeStaffIds: [staffId],
  assigneeRoleId: null,
  orderId: null,
  history: [],
  ...extra,
})
const clone = (value) => structuredClone(value)
const valuesAt = (value, path) => {
  if (!path.length) return Array.isArray(value) ? value : [value]
  if (Array.isArray(value))
    return value.flatMap((entry) => valuesAt(entry, path))
  return valuesAt(value?.[path[0]], path.slice(1))
}
const equal = (left, right) =>
  right == null ? left == null : String(left) === String(right)
const scalarMatch = (actual, expected) => {
  if (!expected || typeof expected !== 'object' || expected instanceof Date)
    return equal(actual, expected)
  return Object.entries(expected).every(([op, target]) => {
    if (op === '$in') return target.some((value) => equal(actual, value))
    if (op === '$ne') return !equal(actual, target)
    if (op === '$type') return target === 'date' && actual instanceof Date
    if (op === '$lt') return actual != null && actual < target
    if (op === '$gt') return actual != null && actual > target
    if (op === '$gte') return actual != null && actual >= target
    throw new Error(`Unknown query operator ${op}`)
  })
}
const matches = (row, filter) =>
  Object.entries(filter).every(([key, expected]) => {
    if (key === '$and') return expected.every((entry) => matches(row, entry))
    if (key === '$or') return expected.some((entry) => matches(row, entry))
    return valuesAt(row, key.split('.')).some((actual) =>
      scalarMatch(actual, expected)
    )
  })
const stripped = (source) =>
  source
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
const taskSource = stripped(
  await readFile(new URL('./partyTasks.js', import.meta.url), 'utf8')
)
const serviceSource = stripped(
  await readFile(new URL('./partyToday.js', import.meta.url), 'utf8')
)
const routeSource = (
  await readFile(
    new URL('../app/api/party/today/route.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
  .replace('export async function GET', 'async function GET')

const setup = ({
  context = owner,
  orders = [],
  tasks = [],
  staff = [],
  ledger = [],
  inbox = { items: [], hasMore: false },
  fail = '',
  contextError = null,
  contextFailure = null,
  castSchema = null,
} = {}) => {
  const calls = []
  const tables = { Orders: orders, Tasks: tasks, Staff: staff }
  const model = (name) => ({
    find(filter) {
      calls.push({ name, filter: clone(filter) })
      let sorting = {},
        limit = Infinity
      return {
        select() {
          return this
        },
        sort(value) {
          sorting = value
          return this
        },
        limit(value) {
          limit = value
          return this
        },
        async lean() {
          if (fail === name) throw new Error('private database failure')
          const data = tables[name].filter((entry) => matches(entry, filter))
          data.sort((a, b) => {
            for (const [key, direction] of Object.entries(sorting)) {
              if (a[key] < b[key]) return -direction
              if (a[key] > b[key]) return direction
            }
            return 0
          })
          return clone(data.slice(0, limit))
        },
      }
    },
  })
  const models = Object.fromEntries(
    Object.keys(tables).map((name) => [name, model(name)])
  )
  const deps = {
    ...todayHelpers,
    ...taskHelpers,
    canPartyAccess,
    buildPartyOrderAccessFilter,
    getPartyOrderPreparationReadiness,
    getOrderPaymentState,
    applyPartyAssignmentConfirmationDefaults,
    getPartyWorkflow,
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value || '')),
    getPartyOrderModel: async () => models.Orders,
    getPartyTaskModel: async () => models.Tasks,
    getPartyStaffModel: async () => models.Staff,
    getPartyTransactionModel: async () => ({
      schema: castSchema || { path: () => ({ cast: (value) => value }) },
      aggregate: async (pipeline) => {
        calls.push({ name: 'Ledger', pipeline })
        if (fail === 'Ledger') throw new Error('private ledger failure')
        const requested = pipeline[0].$match.orderId.$in.map(String)
        return clone(
          ledger.filter(
            (entry) =>
              entry.tenantId === pipeline[0].$match.tenantId &&
              requested.includes(String(entry._id))
          )
        )
      },
    }),
    getPartyCompanyTariffAccessState: async () => ({
      access: { allowTelegramIntegration: true },
    }),
    loadPartyInboxOverdue: async (args) => {
      calls.push({ name: 'Inbox', args })
      if (fail === 'Inbox') throw new Error('private inbox failure')
      return clone(inbox)
    },
  }
  const taskFunctions = new Function(
    ...Object.keys(deps),
    `${taskSource}\nreturn {buildPartyTaskListAccessFilter,canReadTask,serializeTask}`
  )(...Object.values(deps))
  const service = new Function(
    ...Object.keys({ ...deps, ...taskFunctions }),
    `${serviceSource}\nreturn {loadPartyToday}`
  )(...Object.values({ ...deps, ...taskFunctions }))
  const routeDeps = {
    getPartyRequestContext: async () => {
      if (contextFailure) throw contextFailure
      return { context, error: contextError }
    },
    loadPartyToday: (args) => service.loadPartyToday({ ...args, now }),
    NextResponse: {
      json: (body, options) => ({
        status: options?.status || 200,
        body,
        headers: options?.headers,
      }),
    },
    partyError: (status, code, message) => ({
      status,
      body: { success: false, error: { code, message } },
    }),
  }
  const GET = new Function(
    ...Object.keys(routeDeps),
    `${routeSource}\nreturn GET`
  )(...Object.values(routeDeps))
  return {
    calls,
    load: () => service.loadPartyToday({ context, now }),
    get: () => GET({}),
  }
}
const section = (data, key) => data.sections.find((entry) => entry.id === key)

test('route returns auth errors unchanged and forbidden memberships never query models', async () => {
  const auth = { status: 401, body: { success: false } }
  const unauthorized = setup({ contextError: auth })
  assert.equal(await unauthorized.get(), auth)
  assert.deepEqual(unauthorized.calls, [])
  const h = setup({ context: member() })
  assert.equal((await h.get()).status, 403)
  assert.deepEqual(h.calls, [])
})

test('unexpected auth context failures produce safe JSON instead of exposing internal errors', async () => {
  const h = setup({
    contextFailure: new Error('private database auth failure'),
  })
  const response = await h.get()
  assert.equal(response.status, 500)
  assert.equal(response.body.success, false)
  assert.doesNotMatch(JSON.stringify(response), /private|database auth/)
  assert.deepEqual(h.calls, [])
})

test('task location scope is applied before the scan budget rather than hidden candidates consuming it', async () => {
  const context = member(
    { tasks: 'read' },
    { locationIds: [locationId], includeUnlocated: false }
  )
  const tasks = [
    ...Array.from({ length: 405 }, (_, n) =>
      task(n + 1, { locationId: otherId })
    ),
    task(999, { locationId }),
  ]
  const result = section(await setup({ context, tasks }).load(), 'tasks')
  assert.deepEqual(
    result.items.map((card) => card.id),
    [id(999)]
  )
  assert.equal(result.partial, false)
})

test('paused and invited staff are not represented as a confirmed available team', async () => {
  const context = member({
    orders: 'read',
    'orders.eventDate': 'read',
    'orders.assignedStaff': 'read',
  })
  const orders = [
    order(1, { assignedStaff: [{ staffId, confirmationStatus: 'confirmed' }] }),
    order(2, {
      assignedStaff: [{ staffId: otherId, confirmationStatus: 'confirmed' }],
    }),
  ]
  const staff = [
    { _id: staffId, tenantId, status: 'paused', authUserId: userId },
    { _id: otherId, tenantId, status: 'invited' },
  ]
  const result = section(
    await setup({ context, orders, staff }).load(),
    'orders_team'
  )
  assert.equal(result.items.length, 2)
  assert.equal(
    result.items.every((card) => card.reason.includes('недоступен')),
    true
  )
})

test('real Mongoose casts today queries and the financial aggregation tenant without connecting to MongoDB', async () => {
  const castSchema = new mongoose.Schema(partyTransactionsSchema)
  const h = setup({
    orders: [order(1, { contractAmount: 1000 })],
    tasks: [task(2)],
    castSchema,
  })
  await h.load()
  const schemas = {
    Orders: partyOrdersSchema,
    Tasks: partyTasksSchema,
    Staff: partyStaffSchema,
  }
  const models = Object.fromEntries(
    Object.entries(schemas).map(([key, schema]) => [
      key,
      mongoose.model(`PartyTodayCast${key}`, new mongoose.Schema(schema)),
    ])
  )
  try {
    for (const call of h.calls.filter((entry) => entry.filter)) {
      const query = models[call.name].find(call.filter)
      assert.doesNotThrow(() => query.cast(), call.name)
      query._fields = {
        'client.name': 1,
        'client.phone': 1,
        'assignedStaff.staffId': 1,
        'assignedStaff.confirmationStatus': 1,
      }
      assert.doesNotThrow(() => query._fieldsForExec())
    }
    const match = h.calls.find((call) => call.name === 'Ledger').pipeline[0]
      .$match
    assert.equal(match.tenantId instanceof mongoose.Types.ObjectId, true)
    assert.equal(match.orderId.$in[0] instanceof mongoose.Types.ObjectId, true)
    assert.equal(String(match.tenantId), tenantId)
    assert.equal(String(match.orderId.$in[0]), id(1))
  } finally {
    Object.values(models).forEach((model) =>
      mongoose.deleteModel(model.modelName)
    )
  }
})

test('intake manager gets only upcoming events, scoped before limit and masked without team or finance', async () => {
  const context = member(
    {
      orders: 'read',
      'orders.eventDate': 'read',
      'orders.client.phone': 'read',
    },
    { locationIds: [locationId], includeUnlocated: false }
  )
  const h = setup({
    context,
    orders: [
      order(1, {
        locationId,
        title: 'Secret',
        client: { name: 'Hidden', phone: '89130000000' },
        contractAmount: 999999,
      }),
      order(2, { locationId: otherId }),
      order(3, { locationId, tenantId: otherId }),
      order(4, { locationId, status: 'closed' }),
      order(5, { locationId, status: 'canceled' }),
    ],
  })
  const response = await h.get()
  assert.equal(response.status, 200)
  assert.equal(response.headers['Cache-Control'], 'private, no-store')
  const data = response.body.data
  assert.deepEqual(
    data.sections.map((entry) => entry.id),
    ['orders_upcoming']
  )
  const card = data.sections[0].items[0]
  assert.equal(card.title, 'Заказ')
  assert.equal(card.phone, '79130000000')
  assert.equal(data.sections[0].items.length, 1)
  assert.doesNotMatch(JSON.stringify(data), /Secret|Hidden|999999/)
  assert.equal(h.calls.length, 1)
})

test('undated external leads are visible to an intake manager with stage access and no date or task grants', async () => {
  const context = member(
    { orders: 'read', 'orders.workflowStageId': 'read' },
    { locationIds: [locationId], includeUnlocated: true }
  )
  const orders = [
    order(1, { eventDate: null, status: 'draft', workflowStageId: 'new' }),
    order(2, { eventDate: null, status: 'draft', workflowStageId: '' }),
    order(3, { eventDate: null, status: 'draft', workflowStageId: null }),
    order(4, { eventDate: null, workflowStageId: 'discussion' }),
    order(5, { eventDate: null, status: 'closed' }),
    order(6, { eventDate: null, tenantId: otherId }),
    order(7, { eventDate: null, locationId: otherId }),
  ]
  const h = setup({ context, orders })
  const data = await h.load()
  assert.deepEqual(
    data.sections.map((entry) => entry.id),
    ['orders_new']
  )
  assert.deepEqual(
    section(data, 'orders_new').items.map((card) => card.id),
    [id(3), id(2), id(1)]
  )
  assert.equal(
    section(data, 'orders_new').items.every(
      (card) =>
        card.reason === 'Нужно обработать новую заявку' &&
        !Object.hasOwn(card, 'eventDate') &&
        !Object.hasOwn(card, 'dueAt')
    ),
    true
  )
  assert.equal(h.calls.length, 1)
})

test('new lead section follows the configured initial stage and current role scope before pagination', async () => {
  const context = member(
    { orders: 'read', 'orders.workflowStageId': 'read' },
    { stageIds: ['intake'], locationIds: [locationId], includeUnlocated: false }
  )
  context.company = {
    settings: {
      workflow: {
        initialStageId: 'intake',
        stages: [
          { id: 'intake', title: 'Входящие' },
          { id: 'new', title: 'Прежний этап' },
        ],
        transitions: [],
      },
    },
  }
  const orders = [
    order(1, { eventDate: null, locationId, workflowStageId: 'intake' }),
    order(2, { eventDate: null, locationId }),
    order(3, { eventDate: null, locationId, workflowStageId: '' }),
    order(4, { eventDate: null, locationId, workflowStageId: 'new' }),
    order(5, {
      eventDate: null,
      locationId: otherId,
      workflowStageId: 'intake',
    }),
  ]
  const data = await setup({ context, orders }).load()
  assert.deepEqual(
    section(data, 'orders_new').items.map((card) => card.id),
    [id(3), id(2), id(1)]
  )
})

test('hidden workflow stage never enables a lead section or a query that reveals its initial stage', async () => {
  const context = member({ orders: 'read', 'orders.eventDate': 'read' })
  const h = setup({ context, orders: [order(1, { eventDate: null })] })
  const data = await h.load()
  assert.equal(section(data, 'orders_new'), undefined)
  assert.equal(h.calls.length, 1)
  assert.deepEqual(
    data.sections.map((entry) => entry.id),
    ['orders_upcoming']
  )
  const noAccess = setup({ context: member({ orders: 'read' }) })
  assert.equal((await noAccess.get()).status, 403)
  assert.deepEqual(noAccess.calls, [])
})

test('upcoming range includes company today, excludes midnight after day seven and respects hidden end', async () => {
  const context = member({ orders: 'read', 'orders.eventDate': 'read' })
  const orders = [
    order(1, { eventDate: new Date('2026-10-28T17:00:00Z') }),
    order(2, { eventDate: new Date('2026-11-04T16:59:59Z') }),
    order(3, { eventDate: new Date('2026-11-04T17:00:00Z') }),
    order(4, {
      eventDate: new Date('2026-10-28T16:00:00Z'),
      dateEnd: new Date('2026-10-29T05:00:00Z'),
    }),
  ]
  assert.deepEqual(
    section(
      await setup({ context, orders }).load(),
      'orders_upcoming'
    ).items.map((card) => card.id),
    [id(1), id(2)]
  )
  context.position.permissions['orders.dateEnd'] = 'read'
  assert.deepEqual(
    section(
      await setup({ context, orders }).load(),
      'orders_upcoming'
    ).items.map((card) => card.id),
    [id(4), id(1), id(2)]
  )
})

test('task deadlines follow tenant and assignments and hidden linked orders cannot leak via urgent cards', async () => {
  const context = member({ tasks: 'read' })
  const orders = [order(10, { title: 'Hidden order' })]
  const tasks = [
    task(1),
    task(2, { assigneeStaffIds: [otherId] }),
    task(3, { assigneeStaffIds: [], assigneeRoleId: positionId }),
    task(4, { tenantId: otherId }),
    task(5, { status: 'done' }),
    task(6, { dueAt: new Date('2026-10-29T17:00:00Z') }),
    task(7, { orderId: id(10), title: 'Hidden task' }),
    task(8, { dueAt: null }),
  ]
  const data = await setup({ context, orders, tasks }).load()
  assert.deepEqual(
    section(data, 'tasks').items.map((card) => card.id),
    [id(1), id(3)]
  )
  assert.equal(
    section(data, 'tasks').items.every((card) => card.overdue),
    true
  )
  assert.doesNotMatch(JSON.stringify(data), /Hidden/)
})

test('task deadline at now is today, and the exclusive end never appears', async () => {
  const h = setup({
    context: member({ tasks: 'read' }),
    tasks: [
      task(1, { dueAt: now }),
      task(2, { dueAt: new Date('2026-10-29T16:59:59Z') }),
      task(3, { dueAt: new Date('2026-10-29T17:00:00Z') }),
    ],
  })
  const cards = section(await h.load(), 'tasks').items
  assert.equal(cards.length, 2)
  assert.equal(
    cards.every(
      (card) => !card.overdue && card.reason === 'Срок задачи сегодня'
    ),
    true
  )
})

test('team reflects contractor confirmation defaults, explicit refusal and unavailable assignments', async () => {
  const context = member({
    orders: 'read',
    'orders.eventDate': 'read',
    'orders.assignedStaff': 'read',
  })
  const orders = [
    order(1),
    order(2, { assignedStaff: [{ staffId, confirmationStatus: 'pending' }] }),
    order(3, { assignedStaff: [{ staffId, confirmationStatus: 'declined' }] }),
    order(4, {
      assignedStaff: [{ staffId: otherId, confirmationStatus: 'pending' }],
    }),
    order(5, {
      assignedStaff: [{ staffId: id(999), confirmationStatus: 'confirmed' }],
    }),
  ]
  const staff = [
    { _id: staffId, tenantId, status: 'active', authUserId: userId },
    { _id: otherId, tenantId, status: 'active' },
  ]
  const result = section(
    await setup({ context, orders, staff }).load(),
    'orders_team'
  )
  assert.deepEqual(
    result.items.map((card) => card.id),
    [id(1), id(2), id(3), id(5)]
  )
  assert.match(
    result.items.find((card) => card.id === id(5)).reason,
    /недоступен/
  )
  assert.equal(Object.hasOwn(result.items[0], 'assignedStaff'), false)
})

test('preparation uses canonical enabled blockers without hidden team acknowledgement counts', async () => {
  const context = member({
    orders: 'read',
    'orders.eventDate': 'read',
    'orders.preparation': 'read',
  })
  const ready = {
    enabled: true,
    items: [],
    clientCheck: { status: 'not_required' },
    assembly: { status: 'ready' },
  }
  const orders = [
    order(1, {
      preparation: {
        enabled: true,
        items: [],
        clientCheck: { status: 'waiting' },
        assembly: { status: 'ready' },
      },
    }),
    order(2, { preparation: ready }),
    order(3, { preparation: { enabled: false } }),
    order(4, {
      assignedStaff: [{ staffId }],
      preparation: {
        ...ready,
        addressChange: {
          before: 'Secret address',
          after: 'Secret address2',
          acknowledgements: [],
        },
      },
    }),
  ]
  const data = await setup({ context, orders }).load()
  assert.deepEqual(
    section(data, 'orders_preparation').items.map((card) => card.id),
    [id(1)]
  )
  assert.doesNotMatch(JSON.stringify(data), /Secret/)
})

test('payment cards use persisted income instead of stale embedded money and never call an unpaid order overdue', async () => {
  const context = member({
    orders: 'read',
    'finance.clientAmount': 'read',
    'finance.payments': 'read',
  })
  const orders = [
    order(1, {
      contractAmount: 1000,
      transactions: [{ type: 'income', category: 'deposit', amount: 1000 }],
    }),
    order(2, { contractAmount: 1000 }),
    order(3, { contractAmount: 1000 }),
    order(4, { contractAmount: 0 }),
    order(5, { contractAmount: 1000, status: 'closed' }),
  ]
  const ledger = [
    { _id: id(1), tenantId, incomeTotal: 500, hasDeposit: 1 },
    { _id: id(2), tenantId, incomeTotal: 1000, hasDeposit: 1 },
    { _id: id(3), tenantId: otherId, incomeTotal: 1000, hasDeposit: 1 },
  ]
  const h = setup({ context, orders, ledger })
  const cards = section(await h.load(), 'payments').items
  assert.deepEqual(
    cards.map((card) => card.id),
    [id(3), id(1)]
  )
  assert.equal(
    cards.find((card) => card.id === id(1)).reason,
    'Ожидается остаток оплаты'
  )
  assert.equal(
    cards.find((card) => card.id === id(3)).reason,
    'Ожидается аванс'
  )
  assert.equal(
    cards.every(
      (card) =>
        card.overdue === false &&
        !Object.hasOwn(card, 'eventDate') &&
        !Object.hasOwn(card, 'dueAt')
    ),
    true
  )
  assert.doesNotMatch(JSON.stringify(cards), /1000|500/)
  assert.equal(h.calls.filter((call) => call.name === 'Ledger').length, 1)
})

test('bounded sparse scan reports partial, not a total or an authoritative empty result', async () => {
  const context = member({
    orders: 'read',
    'finance.clientAmount': 'read',
    'finance.payments': 'read',
  })
  const orders = Array.from({ length: 402 }, (_, n) =>
    order(n + 1, { contractAmount: n === 0 ? 1000 : 0 })
  )
  const h = setup({ context, orders })
  const result = section(await h.load(), 'payments')
  assert.equal(result.items.length, 0)
  assert.equal(result.partial, true)
  assert.equal(result.hasMore, false)
  assert.equal(Object.hasOwn(result, 'total'), false)
  assert.match(result.href, /^\/performer\/work\?companyId=/)
})

test('all sections expose at most six cards with truthful continuation for actual extra matches', async () => {
  const context = member({
    orders: 'read',
    'orders.eventDate': 'read',
    tasks: 'read',
  })
  const h = setup({
    context,
    orders: Array.from({ length: 20 }, (_, n) => order(n + 1)),
    tasks: Array.from({ length: 20 }, (_, n) => task(n + 1)),
  })
  const data = await h.load()
  assert.equal(
    data.sections.every(
      (entry) => entry.items.length === 6 && entry.hasMore && !entry.partial
    ),
    true
  )
})

test('section failures remain explicit and do not prevent independent successful sections', async () => {
  const context = member({
    orders: 'read',
    'orders.eventDate': 'read',
    tasks: 'read',
  })
  const h = setup({
    context,
    orders: [order(1)],
    tasks: [task(1)],
    fail: 'Tasks',
  })
  const data = await h.load()
  assert.match(section(data, 'tasks').error, /Не удалось/)
  assert.equal(section(data, 'orders_upcoming').items.length, 1)
  assert.doesNotMatch(JSON.stringify(data), /private database/)
})

test('inbox remains restricted to legacy full managers and chooses only the actual overdue deadline', async () => {
  const inbox = {
    items: [
      {
        id: `vk:${id(1)}`,
        title: 'Обращение',
        nextContactAt: new Date('2026-10-30T03:00:00Z'),
        responseDueAt: new Date('2026-10-29T02:00:00Z'),
      },
    ],
    hasMore: false,
  }
  const h = setup({ inbox })
  const data = await h.load()
  const card = section(data, 'inbox').items[0]
  assert.equal(card.reason, 'Истёк срок ответа')
  assert.equal(card.dueAt, '2026-10-29T02:00:00.000Z')
  assert.equal(
    new URL(card.href, 'https://example.test').searchParams.get(
      'conversationId'
    ),
    null
  )
  assert.equal(
    h.calls.find((call) => call.name === 'Inbox').args.tenantId,
    tenantId
  )
  const custom = member({ tasks: 'read', inbox: 'read' })
  const customHarness = setup({ context: custom, inbox })
  assert.equal(section(await customHarness.load(), 'inbox'), undefined)
  assert.equal(
    customHarness.calls.some((call) => call.name === 'Inbox'),
    false
  )
})
