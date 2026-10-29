import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import mongoose from 'mongoose'
import partyTasksSchema from '../schemas/partyTasksSchema.js'
import * as helpers from '../helpers/partyPreparationTemplates.js'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
  isPartyRestrictedManagementContext,
} from '../helpers/partyRolePermissions.js'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard.js'

const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  orderId = 'c'.repeat(24),
  templateId = 'd'.repeat(24),
  roleId = 'e'.repeat(24)
const owner = {
  tenantId,
  role: 'owner',
  staff: { _id: staffId, tenantId, role: 'owner', status: 'active' },
  sessionUser: { _id: staffId },
  company: { settings: { timeZone: 'Asia/Krasnoyarsk' } },
}
const custom = (permissions = {}, scope = {}) => ({
  ...owner,
  role: 'performer',
  staff: { ...owner.staff, role: 'performer', positionId: roleId },
  position: {
    _id: roleId,
    tenantId,
    active: true,
    orderScope: scope,
    permissions: {
      tasks: 'read',
      'tasks.create': 'edit',
      'tasks.assign': 'edit',
      orders: 'read',
      'orders.eventDate': 'read',
      ...permissions,
    },
  },
})
const makeItem = (patch = {}) => ({
  id: 'check',
  title: 'Позвонить команде',
  descriptionHtml: '<p>Напомнить адрес</p>',
  assigneeStaffIds: [staffId],
  assigneeRoleId: null,
  offsetMinutes: -60,
  ...patch,
})
const makeTemplate = (patch = {}) => ({
  _id: templateId,
  tenantId,
  title: 'Обычная подготовка',
  active: true,
  revision: 0,
  applicationRevision: 0,
  items: [makeItem()],
  ...patch,
})
const makeOrder = (patch = {}) => ({
  _id: orderId,
  tenantId,
  status: 'active',
  eventDate: '2026-11-03T05:00:00Z',
  dateEnd: '2026-11-03T07:00:00Z',
  updatedAt: '2026-10-29T01:00:00Z',
  taskScheduleRevision: 0,
  ...patch,
})
const getAt = (row, path) =>
  path.split('.').reduce((value, part) => value?.[part], row)
const equal = (a, b) =>
  a == null || b == null ? a == null && b == null : String(a) === String(b)
const matches = (row, filter) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return value.every((item) => matches(row, item))
    if (key === '$or') return value.some((item) => matches(row, item))
    const actual = getAt(row, key)
    if (value && typeof value === 'object' && !(value instanceof Date))
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === '$in')
          return (Array.isArray(actual) ? actual : [actual]).some((entry) =>
            expected.some((other) => equal(entry, other))
          )
        if (operator === '$exists') return (actual !== undefined) === expected
        throw new Error(`Unexpected operator ${operator}`)
      })
    return equal(actual, value)
  })
const query = (read) => {
  let limit = Infinity
  return {
    session() {
      return this
    },
    select() {
      return this
    },
    sort() {
      return this
    },
    limit(next) {
      limit = next
      return this
    },
    async lean() {
      const value = read()
      return structuredClone(
        Array.isArray(value) ? value.slice(0, limit) : value
      )
    },
    then(resolve, reject) {
      return Promise.resolve(read()).then(resolve, reject)
    },
  }
}
const source = (
  await readFile(
    new URL('./partyPreparationTemplates.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
  .replace(
    "(await import('./partyTaskEffects')).syncPartyTaskEffects",
    'syncEffectsStub'
  )
function setup(patch = {}, flags = {}) {
  const env = {
    tables: {
      Orders: [makeOrder()],
      Templates: [makeTemplate()],
      Tasks: [],
      Staff: [owner.staff],
      Roles: [{ _id: roleId, tenantId, active: true }],
      ...structuredClone(patch),
    },
    writes: [],
    validation: [],
    effects: [],
    serial: 10,
    tail: Promise.resolve(),
  }
  const RealTask = flags.realMongoose
    ? new mongoose.Mongoose().model(
        'TemplateTask',
        new mongoose.Schema(partyTasksSchema)
      )
    : null
  if (RealTask)
    RealTask.prototype.$save = async function (options) {
      await this.validate()
      env.tables.Tasks.push(JSON.parse(JSON.stringify(this.toObject())))
      env.writes.push({
        name: 'TaskSave',
        filter: { tenantId: String(this.tenantId) },
        session: options.session,
      })
      return this
    }
  const transaction = async (work) => {
    if (flags.noTransactions)
      throw Object.assign(new Error('not supported'), { code: 20 })
    const prior = env.tail
    let release
    env.tail = new Promise((resolve) => {
      release = resolve
    })
    await prior
    const snapshot = structuredClone(env.tables)
    try {
      return await work({ transaction: true })
    } catch (error) {
      env.tables = snapshot
      throw error
    } finally {
      release()
    }
  }
  const mutate = (row, change) => {
    Object.assign(row, structuredClone(change.$set || {}))
    for (const [key, count] of Object.entries(change.$inc || {}))
      row[key] = Number(row[key] || 0) + count
    row.updatedAt = new Date(
      Date.UTC(2026, 9, 29, 2, 0, env.serial++)
    ).toISOString()
  }
  const model = (name) => ({
    init: async () => {},
    db: {
      startSession: async () => ({
        endSession: async () => {},
        withTransaction: transaction,
      }),
    },
    findOne: (filter) =>
      query(() => env.tables[name].find((row) => matches(row, filter)) || null),
    find: (filter) =>
      query(() => env.tables[name].filter((row) => matches(row, filter))),
    countDocuments: (filter) =>
      query(
        () => env.tables[name].filter((row) => matches(row, filter)).length
      ),
    updateOne: async (filter, change) => {
      env.writes.push({ name, filter: structuredClone(filter) })
      const row = env.tables[name].find((row) => matches(row, filter))
      if (!row) return { matchedCount: 0 }
      mutate(row, change)
      return { matchedCount: 1 }
    },
    findOneAndUpdate: (filter, change) =>
      query(() => {
        const row = env.tables[name].find((row) => matches(row, filter))
        if (!row) return null
        mutate(row, change)
        return row
      }),
    create: async (input, options = {}) => {
      if (name === 'Tasks' && RealTask) return RealTask.create(input, options)
      if (
        options.session &&
        Array.isArray(input) &&
        input.length > 1 &&
        !options.ordered
      )
        throw new Error(
          'Mongoose requires ordered:true for multiple creates within a transaction'
        )
      if (name === 'Tasks' && flags.failInsert)
        throw new Error('insert private-details')
      const values = Array.isArray(input) ? input : [input]
      const result = values.map((value) => {
        const row = {
          _id: (++env.serial).toString(16).padStart(24, '0'),
          revision: 0,
          ...structuredClone(value),
        }
        env.tables[name].push(row)
        return { ...row, toObject: () => structuredClone(row) }
      })
      return Array.isArray(input) ? result : result[0]
    },
  })
  const models = Object.fromEntries(
    Object.keys(env.tables).map((name) => [name, model(name)])
  )
  const deps = {
    ...helpers,
    createHash,
    sanitizeHtml,
    canPartyAccess,
    buildPartyOrderAccessFilter,
    isPartyRestrictedManagementContext,
    getPartyOrderWriteGuard,
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
    getPartyPreparationTemplateModel: async () => models.Templates,
    getPartyTaskModel: async () => models.Tasks,
    getPartyOrderModel: async () => models.Orders,
    getPartyStaffModel: async () => models.Staff,
    getPartyRoleModel: async () => models.Roles,
    getPartyRequestContext: async ({ req }) => {
      if (req.contextFailure) throw new Error('secret-session')
      return { context: req.context || owner, error: req.contextError }
    },
    canAccessTaskLocation: (context, task) =>
      !context.position?.orderScope?.locationIds?.length ||
      context.position.orderScope.locationIds.includes(task.locationId),
    taskActorId: (context) => context.staff._id,
    validateTaskData: async (context, body, previous, options) => {
      env.validation.push({
        body: structuredClone(body),
        session: options.session,
      })
      return body
    },
    syncEffectsStub: async (args) => {
      env.effects.push(args)
      if (flags.effectsThrow) throw new Error('push private-details')
      return { failed: flags.effectsFail ? 1 : 0 }
    },
  }
  const names = [
    'listPartyPreparationTemplates',
    'savePartyPreparationTemplate',
    'applyPartyPreparationTemplate',
    'withPreparationTemplateContext',
    'readPreparationTemplateBody',
  ]
  const service = new Function(
    ...Object.keys(deps),
    `${source}\nreturn {${names}}`
  )(...Object.values(deps))
  const preview = async (context = owner) =>
    (
      await service.applyPartyPreparationTemplate(context, orderId, {
        action: 'preview',
        templateId,
      })
    ).body.data
  const apply = async (plan, context = owner) =>
    service.applyPartyPreparationTemplate(context, orderId, {
      action: 'apply',
      templateId,
      previewToken: plan.previewToken,
    })
  return { env, service, preview, apply }
}

test('preview is read-only and application creates canonical tasks with fixed dates in one transaction', async () => {
  const h = setup()
  const plan = await h.preview()
  assert.equal(plan.createCount, 1)
  assert.equal(plan.items[0].dueAt, '2026-11-03T04:00:00.000Z')
  assert.equal(h.env.writes.length, 0)
  assert.equal(h.env.tables.Tasks.length, 0)
  assert.equal(JSON.stringify(plan).includes('sourceKey'), false)
  const result = await h.apply(plan)
  assert.equal(result.body.data.createdCount, 1)
  assert.equal(
    h.env.tables.Tasks[0].sourceKey,
    `order:${orderId}:template:${templateId}:check`
  )
  assert.equal(h.env.tables.Tasks[0].createdByUserId, staffId)
  assert.equal(h.env.tables.Tasks[0].seriesActive, false)
  assert.equal(h.env.tables.Orders[0].taskScheduleRevision, 1)
  assert.equal(h.env.tables.Templates[0].applicationRevision, 1)
  assert.equal(h.env.effects.length, 1)
  assert.ok(
    h.env.validation.some(
      (item) => typeof item.session?.withTransaction === 'function'
    )
  )
  assert.ok(h.env.writes.every((item) => item.filter.tenantId === tenantId))
})

test('reapplying after task edits or a changed event date never overwrites or duplicates created tasks', async () => {
  const h = setup()
  await h.apply(await h.preview())
  const originalDue = h.env.tables.Tasks[0].dueAt
  Object.assign(h.env.tables.Tasks[0], {
    title: 'Переименованная задача',
    status: 'done',
    completedByStaffId: staffId,
  })
  h.env.tables.Orders[0].eventDate = '2026-12-01T05:00:00Z'
  h.env.tables.Templates[0].items.push(
    makeItem({ id: 'new-check', offsetMinutes: null })
  )
  h.env.tables.Templates[0].revision += 1
  const plan = await h.preview()
  assert.equal(plan.skipCount, 1)
  assert.equal(plan.createCount, 1)
  assert.equal(plan.items[0].dueAt, null)
  assert.equal(Object.hasOwn(plan.items[0], 'assigneeStaffIds'), false)
  await h.apply(plan)
  assert.equal(h.env.tables.Tasks.length, 2)
  assert.equal(h.env.tables.Tasks[0].title, 'Переименованная задача')
  assert.equal(h.env.tables.Tasks[0].status, 'done')
  assert.equal(h.env.tables.Tasks[0].dueAt, originalDue)
  const replay = await h.apply(await h.preview())
  assert.equal(replay.body.data.createdCount, 0)
})

test('concurrent application preserves one batch and rejects the stale preview', async () => {
  const h = setup()
  const plan = await h.preview()
  const results = await Promise.allSettled([h.apply(plan), h.apply(plan)])
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1
  )
  assert.equal(
    results.find((result) => result.status === 'rejected').reason.status,
    409
  )
  assert.equal(h.env.tables.Tasks.length, 1)
})

test('real Mongoose validates multiple tasks and requires ordered create inside the same transaction', async () => {
  const h = setup(
    {
      Templates: [
        makeTemplate({ items: [makeItem(), makeItem({ id: 'second' })] }),
      ],
    },
    { realMongoose: true }
  )
  const result = await h.apply(await h.preview())
  assert.equal(result.body.data.createdCount, 2)
  assert.equal(h.env.tables.Tasks.length, 2)
  assert.equal(h.env.tables.Orders[0].taskScheduleRevision, 1)
  assert.equal(h.env.tables.Tasks[0].tenantId, tenantId)
  assert.deepEqual(h.env.tables.Tasks[0].pendingNotifications, [
    { key: '0:assigned', revision: 0, event: 'assigned' },
  ])
  assert.ok(
    h.env.writes
      .filter((item) => item.name === 'TaskSave')
      .every((item) => item.session)
  )
})

test('date, template revision and order closure changes invalidate the preview', async () => {
  for (const change of [
    (h) => {
      h.env.tables.Orders[0].eventDate = '2027-01-01T05:00:00Z'
    },
    (h) => {
      h.env.tables.Templates[0].revision += 1
    },
    (h) => {
      h.env.tables.Orders[0].status = 'closed'
    },
    (h) => {
      h.env.tables.Orders[0].status = 'canceled'
    },
  ]) {
    const h = setup()
    const plan = await h.preview()
    change(h)
    await assert.rejects(h.apply(plan), (error) => error.status === 409)
    assert.equal(h.env.tables.Tasks.length, 0)
  }
})

test('inaccessible tenant, location and workflow scope cannot preview an order', async () => {
  for (const patch of [
    { tenantId: 'f'.repeat(24) },
    { workflowStageId: 'secret' },
    { locationId: 'f'.repeat(24) },
  ]) {
    const context = custom(
      {},
      { stageIds: ['new'], locationIds: ['1'.repeat(24)] }
    )
    const h = setup({
      Orders: [
        makeOrder({
          workflowStageId: 'new',
          locationId: '1'.repeat(24),
          ...patch,
        }),
      ],
    })
    await assert.rejects(h.preview(context), (error) => error.status === 404)
    assert.equal(h.env.writes.length, 0)
  }
})

test('relative deadlines require date visibility, while undated tasks work without disclosing hidden dates', async () => {
  await assert.rejects(
    setup().preview(custom({ 'orders.eventDate': 'hidden' })),
    (error) => error.status === 403
  )
  const h = setup({
    Templates: [makeTemplate({ items: [makeItem({ offsetMinutes: null })] })],
    Orders: [makeOrder({ eventDate: null, dateEnd: null })],
  })
  const plan = await h.preview(custom({ 'orders.eventDate': 'hidden' }))
  assert.equal(plan.items[0].dueAt, null)
  assert.equal(Object.hasOwn(plan.items[0], 'afterEvent'), false)
  await h.apply(plan, custom({ 'orders.eventDate': 'hidden' }))
  assert.equal(h.env.tables.Tasks[0].dueAt, null)
})

test('missing assignment permissions and inactive staff/roles prevent the complete batch', async () => {
  await assert.rejects(
    setup().preview(custom({ 'tasks.assign': 'hidden' })),
    (error) => error.status === 403
  )
  for (const tables of [
    { Staff: [{ ...owner.staff, status: 'archived' }] },
    { Staff: [{ ...owner.staff, tenantId: 'f'.repeat(24) }] },
    {
      Templates: [
        makeTemplate({
          items: [makeItem({ assigneeStaffIds: [], assigneeRoleId: roleId })],
        }),
      ],
      Roles: [],
    },
  ]) {
    const h = setup(tables)
    await assert.rejects(h.preview(), (error) => error.status === 400)
    assert.equal(h.env.tables.Tasks.length, 0)
  }
})

test('transaction failure rolls back locks and task creation, unsupported topology returns a safe error', async () => {
  const h = setup({}, { failInsert: true })
  const plan = await h.preview()
  await assert.rejects(h.apply(plan), /insert private-details/)
  assert.equal(h.env.tables.Orders[0].taskScheduleRevision, 0)
  assert.equal(h.env.tables.Templates[0].applicationRevision, 0)
  assert.equal(h.env.tables.Tasks.length, 0)
  assert.equal(h.env.effects.length, 0)
  const unavailable = setup({}, { noTransactions: true })
  await assert.rejects(
    unavailable.apply(await unavailable.preview()),
    (error) =>
      error.status === 503 &&
      error.code === 'partycrm_preparation_transaction_required'
  )
})

test('notification failure after commit preserves saved tasks and returns a warning', async () => {
  for (const flags of [{ effectsThrow: true }, { effectsFail: true }]) {
    const h = setup({}, flags)
    const result = await h.apply(await h.preview())
    assert.equal(result.status, 200)
    assert.equal(result.body.data.effectsWarning, true)
    assert.equal(h.env.tables.Tasks.length, 1)
    assert.equal(h.env.tables.Tasks[0].effectsPending, true)
    assert.deepEqual(h.env.tables.Tasks[0].pendingNotifications, [
      { key: '0:assigned', revision: 0, event: 'assigned' },
    ])
  }
})

test('management is based on company membership and does not bypass a restricted admin position', async () => {
  const h = setup()
  const handler = h.service.withPreparationTemplateContext(
    async () => ({ status: 200 }),
    true
  )
  assert.equal(
    (
      await handler({
        context: { ...custom(), sessionUser: { _id: staffId, role: 'dev' } },
      })
    ).status,
    403
  )
  const restricted = {
    ...custom(),
    role: 'admin',
    staff: { ...custom().staff, role: 'admin' },
  }
  assert.equal((await handler({ context: restricted })).status, 403)
  assert.equal((await handler({ context: owner })).status, 200)
  const failed = await handler({ contextFailure: true })
  assert.equal(failed.status, 500)
  assert.equal(JSON.stringify(failed).includes('secret-session'), false)
})

test('saving a template sanitizes HTML and uses optimistic revision inside its tenant', async () => {
  const h = setup()
  const saved = await h.service.savePartyPreparationTemplate(
    owner,
    {
      title: 'Новый',
      active: true,
      expectedRevision: 0,
      items: [
        makeItem({
          descriptionHtml:
            '<script>alert(1)</script><p onclick="steal()">Текст</p><img src="/private">',
        }),
      ],
    },
    templateId
  )
  assert.equal(saved.body.data.items[0].descriptionHtml, '<p>Текст</p>')
  assert.equal(saved.body.data.revision, 1)
  await assert.rejects(
    h.service.savePartyPreparationTemplate(
      owner,
      { ...makeTemplate(), expectedRevision: 0 },
      templateId
    ),
    (error) => error.status === 409
  )
  const otherTenant = { ...owner, tenantId: 'f'.repeat(24) }
  await assert.rejects(
    h.service.savePartyPreparationTemplate(
      otherTenant,
      { ...makeTemplate(), active: false, expectedRevision: 1 },
      templateId
    ),
    (error) => error.status === 409
  )
})

test('archiving keeps old tasks and permits inactive saved assignees without reactivating them', async () => {
  const h = setup({ Staff: [] })
  const saved = await h.service.savePartyPreparationTemplate(
    owner,
    { ...makeTemplate(), active: false, expectedRevision: 0 },
    templateId
  )
  assert.equal(saved.body.data.active, false)
  await assert.rejects(h.preview(), (error) => error.status === 404)
})

test('invalid JSON and array payloads return safe validation errors', async () => {
  const h = setup()
  const handler = h.service.withPreparationTemplateContext(
    async (req) => h.service.readPreparationTemplateBody(req),
    true
  )
  for (const req of [
    {
      json: async () => {
        throw new SyntaxError('private-json')
      },
    },
    { json: async () => [] },
    { json: async () => null },
  ]) {
    const response = await handler(req)
    assert.equal(response.status, 400)
    assert.equal(JSON.stringify(response).includes('private-json'), false)
  }
})
