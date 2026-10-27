import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import * as taskHelpers from '../helpers/partyTasks.js'
import { canPartyAccess, buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions.js'
import { resolvePartyRequestContext } from './partyApiCore.js'

const tenantId = '1'.repeat(24), ownerId = '2'.repeat(24), firstId = '3'.repeat(24), secondId = '4'.repeat(24), roleId = '5'.repeat(24), rootId = '6'.repeat(24), childId = '7'.repeat(24), nextId = '8'.repeat(24), doneId = '9'.repeat(24)
const owner = { tenantId, role: 'owner', staff: { _id: ownerId, tenantId, role: 'owner', status: 'active' }, sessionUser: { _id: ownerId }, company: { settings: { timeZone: 'Asia/Krasnoyarsk' } } }
const member = (id = firstId, permissions = {}) => ({ tenantId, role: 'performer', staff: { _id: id, tenantId, role: 'performer', status: 'active', positionId: roleId }, position: { _id: roleId, tenantId, active: true, permissions: { tasks: 'read', 'tasks.complete': 'edit', 'tasks.create': 'edit', ...permissions }, orderScope: {} }, sessionUser: { _id: id }, company: owner.company })
const newTask = (extra = {}) => ({ title: 'Задача', descriptionHtml: '', dueAt: '2026-10-28T03:00:00.000Z', assigneeStaffIds: [firstId], assigneeRoleId: null, orderId: null, locationId: null, recurrence: { frequency: 'none', interval: 1, until: null }, ...extra })
const row = (extra = {}) => ({ _id: rootId, tenantId, status: 'new', revision: 0, recurrenceRevision: 0, seriesId: null, seriesActive: false, ...newTask(), ...extra })
const clone = (value) => structuredClone(value)
const valueAt = (value, key) => key.split('.').reduce((entry, part) => entry?.[part], value)
const equal = (left, right) => right == null ? left == null : String(left) === String(right)
const matches = (row, filter) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$or') return expected.some((item) => matches(row, item))
  if (key === '$and') return expected.every((item) => matches(row, item))
  const actual = valueAt(row, key)
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) return Object.entries(expected).every(([operator, value]) => {
    if (operator === '$in') return (Array.isArray(actual) ? actual : [actual]).some((item) => value.some((other) => equal(item, other)))
    if (operator === '$ne') return !equal(actual, value)
    if (operator === '$exists') return (actual !== undefined) === value
    if (operator === '$gte') return actual != null && (value instanceof Date ? new Date(actual).getTime() >= value.getTime() : actual >= value)
    throw new Error(`Unexpected operator ${operator}`)
  })
  return Array.isArray(actual) ? actual.some((item) => equal(item, expected)) : equal(actual, expected)
})
const setAt = (target, path, value) => {
  const parts = path.split('.'); let entry = target
  for (const part of parts.slice(0, -1)) entry = entry[part] ??= {}
  entry[parts.at(-1)] = clone(value)
}
const apply = (row, update, inserted = false) => {
  for (const [key, value] of Object.entries({ ...(inserted ? update.$setOnInsert : {}), ...update.$set })) setAt(row, key, value)
  for (const [key, value] of Object.entries(update.$inc || {})) setAt(row, key, Number(valueAt(row, key) || 0) + value)
  for (const [key, value] of Object.entries(update.$push || {})) { const list = valueAt(row, key) || []; list.push(clone(value)); setAt(row, key, list) }
}
const query = (read) => {
  let limit = Infinity
  return { session() { return this }, select() { return this }, sort() { return this }, limit(value) { limit = value; return this }, lean: async () => { const value = await read(); return clone(Array.isArray(value) ? value.slice(0, limit) : value) }, then(resolve, reject) { return Promise.resolve().then(read).then(resolve, reject) } }
}
const source = (await readFile(new URL('./partyTasks.js', import.meta.url), 'utf8')).replace(/^import .+$/gm, '').replaceAll('export const ', 'const ').replaceAll("await import('./partyTaskEffects')", 'await Promise.resolve({ syncPartyTaskEffects: syncEffects })')
const routeSource = (await readFile(new URL('../app/api/party/tasks/[id]/route.js', import.meta.url), 'utf8')).replace(/^import .+$/gm, '').replaceAll('export const ', 'const ')
const mediaRouteSource = (await readFile(new URL('../app/api/party/task-media/[id]/route.js', import.meta.url), 'utf8')).replace(/^import .+$/gm, '').replaceAll('export const ', 'const ').replace('export async function GET', 'async function GET')

function fixture(tables = {}, options = {}) {
  const env = { data: { Tasks: [], Media: [], Drafts: [], Orders: [], Staff: [owner.staff, member().staff, member(secondId).staff], Locations: [], Roles: [], ...clone(tables) }, writes: [], effects: [], tail: Promise.resolve(), serial: 10 }
  const model = (name) => ({
    init: async () => {},
    db: { startSession: async () => ({ endSession: async () => {}, withTransaction: async (work) => transaction(work) }) },
    find: (filter) => query(() => env.data[name].filter((row) => matches(row, filter))),
    findOne: (filter) => query(() => env.data[name].find((row) => matches(row, filter)) || null),
    exists: (filter) => query(() => env.data[name].some((row) => matches(row, filter))),
    countDocuments: (filter) => query(() => env.data[name].filter((row) => matches(row, filter)).length),
    updateOne: async (filter, update, flags = {}) => {
      env.writes.push({ name, filter: clone(filter), update: clone(update) })
      let doc = env.data[name].find((row) => matches(row, filter))
      if (!doc && flags.upsert) { doc = { _id: (++env.serial).toString(16).padStart(24, '0') }; apply(doc, update, true); env.data[name].push(doc); return { matchedCount: 0, modifiedCount: 0, upsertedId: doc._id } }
      if (!doc) return { matchedCount: 0, modifiedCount: 0 }
      apply(doc, update); return { matchedCount: 1, modifiedCount: 1 }
    },
    updateMany: async (filter, update) => {
      if (name === 'Media' && options.failAttachment) throw new Error('attachment save failed')
      const rows = env.data[name].filter((row) => matches(row, filter)); rows.forEach((row) => apply(row, update)); return { matchedCount: rows.length, modifiedCount: rows.length }
    },
    findOneAndUpdate: (filter, update) => query(() => { const doc = env.data[name].find((row) => matches(row, filter)); if (!doc) return null; apply(doc, update); return doc }),
    create: async (values) => values.map((value) => { const doc = { _id: (++env.serial).toString(16).padStart(24, '0'), revision: 0, history: [], ...clone(value) }; env.data[name].push(doc); return { ...doc, toObject: () => clone(doc) } }),
  })
  const models = Object.fromEntries(Object.keys(env.data).map((name) => [name, model(name)]))
  const transaction = async (work) => {
    const before = env.tail; let release; env.tail = new Promise((resolve) => { release = resolve }); await before
    const snapshot = clone(env.data)
    try { return await work({ id: 'test-transaction' }) }
    catch (error) { env.data = snapshot; throw error }
    finally { release() }
  }
  const deps = {
    ...taskHelpers, createHash, randomUUID, sanitizeHtml, canPartyAccess, buildPartyOrderAccessFilter,
    NextResponse: { json: (body, options) => ({ status: options?.status || 200, body }) },
    partyError: (status, code, message) => ({ status, body: { success: false, error: { code, message } } }),
    getPartyRequestContext: async ({ req }) => ({ context: req.context || owner }),
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value || '')),
    getPartyTaskModel: async () => models.Tasks, getPartyTaskMediaModel: async () => models.Media, getPartyTaskDraftModel: async () => models.Drafts,
    getPartyOrderModel: async () => models.Orders, getPartyStaffModel: async () => models.Staff, getPartyLocationModel: async () => models.Locations, getPartyRoleModel: async () => models.Roles,
    withPartyTaskSeriesMutation: async ({ tenantId, taskId, work }) => transaction(async (session) => {
      const task = env.data.Tasks.find((row) => equal(row._id, taskId) && equal(row.tenantId, tenantId))
      if (!task) return null
      const root = env.data.Tasks.find((row) => equal(row._id, task.seriesId || task._id) && equal(row.tenantId, tenantId))
      if (root) root.recurrenceRevision = (root.recurrenceRevision || 0) + 1
      return work({ session, task: clone(task), rootId: task.seriesId || task._id, Tasks: models.Tasks })
    }),
    syncEffects: async (args) => { env.effects.push(args); return { failed: 0 } },
  }
  const exported = ['createPartyTaskForContext', 'updatePartyTaskForContext', 'canReadTask', 'serializeTask', 'canAccessTaskLocation', 'withTaskContext', 'taskJson', 'loadVisibleTask', 'loadTaskOrder', 'validateTaskData', 'taskAssignmentFilter', 'canManageTask', 'taskMediaIds', 'buildPartyTaskListAccessFilter']
  const service = new Function(...Object.keys(deps), `${source}\nreturn {${exported.join(',')}}`)(...Object.values(deps))
  const routeDeps = { ...service, getPartyTaskModel: deps.getPartyTaskModel }
  const routes = new Function(...Object.keys(routeDeps), `${routeSource}\nreturn {GET,PATCH}`)(...Object.values(routeDeps))
  const patch = (id, body, context = owner) => routes.PATCH({ context, json: async () => body }, { params: Promise.resolve({ id }) })
  const media = async (id, context = owner) => {
    let byteReads = 0
    const Media = { ...models.Media, findOne: (filter) => { const read = models.Media.findOne(filter); const select = read.select; read.select = (value) => { if (value === '+bytes') byteReads += 1; return select.call(read, value) }; return read } }
    const bindings = { ...service, ...deps, resolvePartyRequestContext, NextResponse: class extends Response {}, getPartyTaskMediaModel: async () => Media, getPartyMembershipContext: async () => ({ sessionUser: context.sessionUser, memberships: [{ ...context, status: 'active', staffId: context.staff._id, company: context.company }] }) }
    const endpoint = new Function(...Object.keys(bindings), `${mediaRouteSource}\nreturn GET`)(...Object.values(bindings))
    const response = await endpoint({}, { params: Promise.resolve({ id }) })
    return { response, byteReads }
  }
  return { env, service, routes, patch, media }
}

test('two shared-task completions preserve the first actor and reject the stale second write', async () => {
  const h = fixture({ Tasks: [row({ assigneeStaffIds: [firstId, secondId] })] })
  const responses = await Promise.all([h.patch(rootId, { revision: 0, action: 'status', status: 'done' }, member()), h.patch(rootId, { revision: 0, action: 'status', status: 'done' }, member(secondId))])
  assert.deepEqual(responses.map((item) => item.status), [200, 409])
  assert.equal(h.env.data.Tasks[0].completedByStaffId, firstId)
  assert.equal(h.env.data.Tasks[0].completedByUserId, firstId)
  assert.equal(h.env.effects.length, 1)
})

test('revoked task rights and foreign tenant IDs fail before any persisted mutation', async () => {
  const h = fixture({ Tasks: [row({ tenantId: 'a'.repeat(24) })] })
  const forbidden = member(); forbidden.position.active = false
  assert.equal((await h.patch(rootId, { revision: 0, action: 'status', status: 'done' }, forbidden)).status, 403)
  assert.equal((await h.patch(rootId, { revision: 0, action: 'status', status: 'done' })).status, 404)
  assert.equal(h.env.effects.length, 0)
  assert.equal(h.env.data.Tasks[0].revision, 0)
})

test('the API blocks task mutation when the linked order is hidden or missing', async () => {
  const orderId = 'b'.repeat(24)
  for (const Orders of [[], [{ _id: orderId, tenantId, status: 'active', workflowStageId: 'private', locationId: null }]]) {
    const h = fixture({ Tasks: [row({ orderId })], Orders })
    const response = await h.patch(rootId, { revision: 0, action: 'status', status: 'done' }, member())
    assert.equal(response.status, 403)
    assert.equal(h.env.data.Tasks[0].status, 'new')
  }
})

test('standalone task location restrictions and internal projection metadata are enforced', () => {
  const h = fixture()
  const context = member(); context.position.orderScope = { locationIds: ['c'.repeat(24)], includeUnlocated: false }
  assert.equal(h.service.canReadTask(context, row({ locationId: 'd'.repeat(24) })), false)
  const safe = h.service.serializeTask(owner, row({ effectsLockToken: 'private-lock', pendingNotifications: ['private'], seriesPreview: { token: 'private-preview' }, seriesTemplate: { title: 'private-future' } }))
  assert.equal(JSON.stringify(safe).includes('private'), false)
})

test('create retries with the same draft key return the same task and cannot change its payload', async () => {
  const h = fixture()
  const body = { ...newTask(), draftKey: '12345678-1234-1234-1234-123456789abc' }
  const first = await h.service.createPartyTaskForContext(owner, body)
  const replay = await h.service.createPartyTaskForContext(owner, body)
  assert.equal(first.created, true); assert.equal(replay.created, false)
  assert.equal(first.task._id, replay.task._id)
  assert.equal(h.env.data.Tasks.length, 1)
  assert.equal(h.env.effects.length, 1)
  await assert.rejects(h.service.createPartyTaskForContext(owner, { ...body, title: 'Другой текст' }), { status: 409 })
})

test('create permission does not grant assignment to other employees', async () => {
  const h = fixture()
  await assert.rejects(h.service.createPartyTaskForContext(member(), { ...newTask({ assigneeStaffIds: [secondId] }), draftKey: '12345678-1234-1234-1234-123456789abc' }), { status: 403 })
  assert.equal(h.env.data.Tasks.length, 0)
})

test('media attachment failure rolls back both the newly created task and draft consumption', async () => {
  const draftKey = '12345678-1234-1234-1234-123456789abc', mediaId = 'e'.repeat(24)
  const h = fixture({ Media: [{ _id: mediaId, tenantId, taskId: null, draftKey, uploadedByUserId: ownerId }] }, { failAttachment: true })
  await assert.rejects(h.service.createPartyTaskForContext(owner, { ...newTask({ descriptionHtml: `<p><img src="/api/party/task-media/${mediaId}"></p>` }), draftKey }), /attachment save failed/)
  assert.equal(h.env.data.Tasks.length, 0)
  assert.equal(h.env.data.Drafts[0].taskId, null)
  assert.equal(h.env.data.Media[0].taskId, null)
  assert.equal(h.env.effects.length, 0)
})

test('ordinary editing changes only the selected occurrence and retains the future schedule template', async () => {
  const recurrence = { frequency: 'daily', interval: 1, until: null }, cursor = '2026-10-29T03:00:00.000Z'
  const h = fixture({ Tasks: [row({ recurrence, seriesActive: true, nextOccurrenceAt: cursor })] })
  const result = await h.patch(rootId, { revision: 0, action: 'edit', title: 'Только этот экземпляр' })
  assert.equal(result.status, 200)
  assert.equal(h.env.data.Tasks[0].title, 'Только этот экземпляр')
  assert.equal(h.env.data.Tasks[0].seriesTemplate.title, 'Задача')
  assert.equal(h.env.data.Tasks[0].nextOccurrenceAt, cursor)
})

test('series cancellation requires an explicit current preview and preserves completed history', async () => {
  const h = fixture({ Tasks: [row({ status: 'done', recurrence: { frequency: 'daily', interval: 1, until: null }, seriesActive: true }), row({ _id: childId, seriesId: rootId }), row({ _id: nextId, seriesId: rootId }), row({ _id: doneId, seriesId: rootId, status: 'done', completedByStaffId: firstId })] })
  const rejected = await h.patch(childId, { revision: 0, action: 'stop_series' })
  assert.equal(rejected.status, 409)
  assert.equal(h.env.data.Tasks.filter((item) => item.status === 'canceled').length, 0)
  const preview = await h.patch(childId, { revision: 0, action: 'preview_series_change', seriesAction: 'stop_series' })
  assert.equal(preview.status, 200)
  assert.equal(preview.body.data.affectedCount, 2)
  const applied = await h.patch(childId, { revision: 0, action: 'stop_series', confirmSeriesChange: true, previewToken: preview.body.data.previewToken })
  assert.equal(applied.status, 200)
  assert.equal(h.env.data.Tasks.find((item) => item._id === rootId).status, 'done')
  assert.equal(h.env.data.Tasks.find((item) => item._id === doneId).completedByStaffId, firstId)
  assert.equal(h.env.data.Tasks.filter((item) => item.status === 'canceled').length, 2)
  assert.equal(h.env.data.Tasks.find((item) => item._id === rootId).seriesActive, false)
})

test('a stale series preview cannot cancel tasks created after the preview', async () => {
  const h = fixture({ Tasks: [row({ recurrence: { frequency: 'daily', interval: 1, until: null }, seriesActive: true }), row({ _id: childId, seriesId: rootId })] })
  const preview = await h.patch(childId, { revision: 0, action: 'preview_series_change', seriesAction: 'stop_series' })
  h.env.data.Tasks.push(row({ _id: nextId, seriesId: rootId }))
  const applied = await h.patch(childId, { revision: 0, action: 'stop_series', confirmSeriesChange: true, previewToken: preview.body.data.previewToken })
  assert.equal(applied.status, 409)
  assert.equal(h.env.data.Tasks.some((item) => item.status === 'canceled'), false)
})

test('confirmed series editing replaces open future instances while preserving done instances and their actors', async () => {
  const recurrence = { frequency: 'daily', interval: 1, until: null }
  const h = fixture({ Tasks: [row({ status: 'done', recurrence, seriesActive: true, seriesTemplate: newTask({ recurrence }) }), row({ _id: childId, seriesId: rootId, occurrenceAt: '2026-10-28T03:00:00.000Z' }), row({ _id: nextId, seriesId: rootId, dueAt: '2026-10-29T03:00:00.000Z', occurrenceAt: '2026-10-29T03:00:00.000Z' }), row({ _id: doneId, seriesId: rootId, dueAt: '2026-10-30T03:00:00.000Z', status: 'done', completedByStaffId: secondId })] })
  const data = { revision: 0, title: 'Обновлённая серия', recurrence, applyToSeries: true }
  const preview = await h.patch(childId, { ...data, action: 'preview_series_change', seriesAction: 'edit' })
  assert.equal(preview.status, 200)
  const result = await h.patch(childId, { ...data, action: 'edit', confirmSeriesChange: true, previewToken: preview.body.data.previewToken })
  assert.equal(result.status, 200)
  const root = h.env.data.Tasks.find((item) => item._id === rootId)
  assert.equal(root.title, 'Задача')
  assert.equal(root.status, 'done')
  assert.equal(root.seriesTemplate.title, 'Обновлённая серия')
  assert.equal(root.seriesGeneration, 1)
  assert.equal(root.nextOccurrenceAt, '2026-10-29T03:00:00.000Z')
  assert.equal(h.env.data.Tasks.find((item) => item._id === childId).title, 'Обновлённая серия')
  assert.equal(h.env.data.Tasks.find((item) => item._id === nextId).status, 'canceled')
  assert.equal(h.env.data.Tasks.find((item) => item._id === doneId).completedByStaffId, secondId)
})

test('cross-tenant media references cannot be attached to a newly created task', async () => {
  const draftKey = '12345678-1234-1234-1234-123456789abc', mediaId = 'e'.repeat(24)
  const h = fixture({ Media: [{ _id: mediaId, tenantId: 'f'.repeat(24), taskId: null, draftKey, uploadedByUserId: ownerId }] })
  await assert.rejects(h.service.createPartyTaskForContext(owner, { ...newTask({ descriptionHtml: `<p><img src="/api/party/task-media/${mediaId}"></p>` }), draftKey }), { status: 400 })
  assert.equal(h.env.data.Tasks.length, 0)
  assert.equal(h.env.effects.length, 0)
})

test('private task media never reads bytes for a foreign company, revoked role or hidden order', async () => {
  const mediaId = 'e'.repeat(24), orderId = 'b'.repeat(24)
  const foreign = fixture({ Media: [{ _id: mediaId, tenantId: 'f'.repeat(24), taskId: rootId }] })
  const deniedForeign = await foreign.media(mediaId)
  assert.equal(deniedForeign.response.status, 404); assert.equal(deniedForeign.byteReads, 0)
  const revoked = member(); revoked.position.active = false
  const own = fixture({ Tasks: [row()], Media: [{ _id: mediaId, tenantId, taskId: rootId }] })
  const deniedRevoked = await own.media(mediaId, revoked)
  assert.equal(deniedRevoked.response.status, 404); assert.equal(deniedRevoked.byteReads, 0)
  const hidden = fixture({ Tasks: [row({ orderId })], Orders: [{ _id: orderId, tenantId, status: 'active' }], Media: [{ _id: mediaId, tenantId, taskId: rootId }] })
  const deniedOrder = await hidden.media(mediaId, member())
  assert.equal(deniedOrder.response.status, 404); assert.equal(deniedOrder.byteReads, 0)
})

test('task list database scope applies locations before pagination and hides unrelated blocked orders', async () => {
  const locationA = 'c'.repeat(24), locationB = 'd'.repeat(24), visibleOrder = 'e'.repeat(24), hiddenOrder = 'f'.repeat(24)
  const context = member(firstId, { 'tasks.edit': 'edit', orders: 'read' })
  context.position.orderScope = { locationIds: [locationA], includeUnlocated: false, stageIds: ['preparation'] }
  const h = fixture({ Orders: [{ _id: visibleOrder, tenantId, locationId: locationA, workflowStageId: 'preparation', status: 'active' }, { _id: hiddenOrder, tenantId, locationId: locationA, workflowStageId: 'private', status: 'active' }] })
  const filter = await h.service.buildPartyTaskListAccessFilter(context)
  const outside = Array.from({ length: 50 }, (_, index) => row({ _id: `outside-${index}`, locationId: locationB }))
  const allowed = row({ _id: childId, locationId: locationA })
  assert.deepEqual([...outside, allowed].filter((item) => matches(item, filter)).slice(0, 50).map((item) => item._id), [childId])
  assert.equal(matches(row({ orderId: hiddenOrder, locationId: locationA, assigneeStaffIds: [secondId], createdByStaffId: secondId }), filter), false)
  assert.equal(matches(row({ orderId: hiddenOrder, locationId: locationA, assigneeStaffIds: [firstId] }), filter), true)
})

test('task DTO respects hidden order titles and dates without masking independently authored task content', () => {
  const h = fixture()
  const context = member(firstId, { orders: 'read' })
  const order = { _id: 'e'.repeat(24), tenantId, status: 'active', title: 'Secret order title', serviceTitle: 'Secret service', eventDate: '2026-10-20T00:00:00Z', dateEnd: '2026-10-20T01:00:00Z' }
  const safe = h.service.serializeTask(context, row({ title: 'Личная задача', orderId: order._id }), { order })
  assert.equal(safe.title, 'Личная задача')
  assert.equal(safe.orderTitle, 'Заказ')
  assert.equal(safe.deadlineWarning, '')
  assert.equal(JSON.stringify(safe).includes('Secret'), false)
})
