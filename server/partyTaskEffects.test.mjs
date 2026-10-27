import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./partyTaskEffects.js', import.meta.url), 'utf8')
const helpers = await readFile(new URL('../helpers/partyTasks.js', import.meta.url), 'utf8')
const helperUrl = `data:text/javascript;base64,${Buffer.from(helpers).toString('base64')}`
const prefix = `import { createHash, randomUUID } from 'node:crypto';
import { isPartyTaskAssignee, isPartyTaskOpen, taskIdOf, PARTY_TASK_STATUSES } from ${JSON.stringify(helperUrl)};
const unavailable = async () => { throw new Error('Real dependency must not run in these tests') };
const getPartyTaskModel = unavailable, getPartyCompanyModel = unavailable, getPartyStaffModel = unavailable, getPartyUserModel = unavailable, getPartyRoleModel = unavailable, getPartyOrderModel = unavailable;
const canPartyAccess = () => false, canAccessTaskLocation = () => true, normalizePartyGoogleCalendarSettings = (value) => value || {}, createPartyGoogleCalendarClient = () => null, sendPushToTenant = unavailable;
`
const { createPartyTaskEffects, createPartyTaskRecipientLoader, createPartyTaskPushAuthorizer, partyTaskCalendarEventId } = await import(`data:text/javascript;base64,${Buffer.from(prefix + source.replace(/^import .+$/gm, '')).toString('base64')}`)
const clone = (value) => structuredClone(value)
const task = (extra = {}) => ({ _id: 'task-a', tenantId: 'company-a', title: 'Секретное название заказа', status: 'new', revision: 0, assigneeStaffIds: ['staff-a'], dueAt: '2026-10-28T12:00:00.000Z', timeZone: 'Asia/Krasnoyarsk', calendarLinks: [], pendingNotifications: [], effectsPending: true, ...extra })
const recipient = (extra = {}) => ({ staff: { _id: 'staff-a' }, user: { _id: 'user-a', status: 'active', performerSettings: { googleCalendar: { enabled: true, calendarId: 'calendar-a', refreshToken: 'test-token' }, notifications: { pushEnabled: true } } }, assigned: true, allowed: true, canReceiveCancellation: true, orderOpen: true, ...extra })
const company = (enabled = true) => ({ _id: 'company-a', status: 'active', settings: { notifications: { pushEnabled: enabled } } })

function memoryTasks(initial) {
  const state = { task: clone(initial), writes: [] }
  const matches = (filter) => !filter.effectsLockToken || state.task.effectsLockToken === filter.effectsLockToken
  const apply = (update) => {
    Object.assign(state.task, clone(update.$set || {}))
    if (update.$addToSet?.pendingNotifications) {
      const next = update.$addToSet.pendingNotifications
      if (!state.task.pendingNotifications.some((item) => item.key === next.key)) state.task.pendingNotifications.push(clone(next))
    }
    const consumed = update.$pull?.pendingNotifications?.key?.$in
    if (consumed) state.task.pendingNotifications = state.task.pendingNotifications.filter((item) => !consumed.includes(item.key))
  }
  const model = {
    findOne: (filter) => ({ lean: async () => matches(filter) ? clone(state.task) : null }),
    findOneAndUpdate: (filter, update) => ({ lean: async () => {
      if (state.task.effectsLockUntil && new Date(state.task.effectsLockUntil) > new Date('2026-10-27T00:00:00Z')) return null
      apply(update); return clone(state.task)
    } }),
    updateOne: async (filter, update) => { state.writes.push({ filter, update }); if (!matches(filter)) return { matchedCount: 0 }; apply(update); return { matchedCount: 1, modifiedCount: 1 } },
  }
  return { state, model }
}

function harness(initial, options = {}) {
  const memory = memoryTasks(initial)
  const calls = { updates: [], inserts: [], deletes: [], pushes: [] }
  const client = {
    updateEvent: async (...args) => { calls.updates.push(args); if (options.updateEvent) return options.updateEvent(...args) },
    insertEvent: async (...args) => { calls.inserts.push(args); if (options.insertEvent) return options.insertEvent(...args) },
    deleteEvent: async (...args) => { calls.deletes.push(args); if (options.deleteEvent) return options.deleteEvent(...args) },
  }
  const sync = createPartyTaskEffects({ getTasks: async () => memory.model, loadRecipients: options.loadRecipients || (async () => ({ company: company(options.companyPush !== false), recipients: [recipient(options.recipient)] })), normalizeSettings: (value) => value || {}, createCalendarClient: () => client, clock: () => new Date('2026-10-27T00:00:00Z'), tokenFactory: () => 'test-lease', sendPush: async (payload) => { calls.pushes.push(payload); return { ok: true, sent: 1, failed: 0 } }, ...options.dependencies })
  return { ...memory, calls, sync }
}

test('all authorized assignees receive their own deterministic calendar projection', async () => {
  const h = harness(task(), { loadRecipients: async () => ({ company: company(), recipients: [recipient(), recipient({ staff: { _id: 'staff-b' }, user: { ...recipient().user, _id: 'user-b' } })] }) })
  const result = await h.sync({ tenantId: 'company-a', taskId: 'task-a', event: 'assigned' })
  assert.equal(result.synced, 2)
  assert.equal(h.calls.updates.length, 2)
  assert.equal(h.state.task.calendarLinks.length, 2)
  assert.notEqual(h.calls.updates[0][1], h.calls.updates[1][1])
  assert.equal(h.calls.updates[0][1], partyTaskCalendarEventId('task-a', 'staff-a'))
})

test('company and user notification preferences both suppress pushes without disabling calendar sync', async () => {
  for (const options of [{ companyPush: false }, { recipient: { user: { ...recipient().user, performerSettings: { ...recipient().user.performerSettings, notifications: { pushEnabled: false } } } } }]) {
    const h = harness(task(), options)
    await h.sync({ tenantId: 'company-a', taskId: 'task-a', event: 'assigned' })
    assert.equal(h.calls.pushes.length, 0)
    assert.equal(h.calls.updates.length, 1)
  }
})

test('revoked task/order access removes existing events and never inserts a new one', async () => {
  const eventId = partyTaskCalendarEventId('task-a', 'staff-a')
  const h = harness(task({ calendarLinks: [{ staffId: 'staff-a', userId: 'user-a', calendarId: 'calendar-a', eventId }] }), { recipient: { allowed: false, canReceiveCancellation: false } })
  await h.sync({ tenantId: 'company-a', taskId: 'task-a', notify: false })
  assert.deepEqual(h.calls.deletes, [['calendar-a', eventId]])
  assert.equal(h.calls.updates.length, 0)
  assert.deepEqual(h.state.task.calendarLinks, [])
})

test('cancellation after a stage hides the order sends only a generic notification', async () => {
  const h = harness(task({ status: 'canceled' }), { recipient: { allowed: false, canReceiveCancellation: true, orderOpen: false } })
  await h.sync({ tenantId: 'company-a', taskId: 'task-a', event: 'canceled' })
  assert.equal(h.calls.pushes.length, 1)
  assert.equal(h.calls.pushes[0].payload.body, 'Задача по заказу отменена')
  assert.equal(JSON.stringify(h.calls.pushes).includes('Секретное'), false)
})

test('missing deterministic event is inserted once and an insert conflict is repaired by update', async () => {
  let updates = 0
  const h = harness(task(), { updateEvent: async () => { if (updates++ === 0) throw Object.assign(new Error('missing'), { code: 'event_missing' }) }, insertEvent: async () => { throw Object.assign(new Error('concurrent insert'), { code: 409 }) } })
  const result = await h.sync({ tenantId: 'company-a', taskId: 'task-a', notify: false })
  assert.equal(result.failed, 0)
  assert.equal(h.calls.inserts.length, 1)
  assert.equal(h.calls.updates.length, 2)
  assert.equal(h.calls.inserts[0][1].id, h.calls.updates[0][1])
})

test('failed cleanup retains the previous event link for the next retry', async () => {
  const eventId = partyTaskCalendarEventId('task-a', 'staff-a')
  const h = harness(task({ status: 'canceled', calendarLinks: [{ staffId: 'staff-a', userId: 'user-a', calendarId: 'calendar-a', eventId }] }), { deleteEvent: async () => { throw new Error('temporary API failure') } })
  const result = await h.sync({ tenantId: 'company-a', taskId: 'task-a', notify: false })
  assert.equal(result.failed, 1)
  assert.equal(h.state.task.calendarLinks[0].eventId, eventId)
  assert.equal(h.state.task.calendarLinks[0].error, 'calendar_sync_failed')
  assert.equal(h.state.task.effectsPending, true)
})

test('unavailable calendar credentials produce a retryable warning instead of silently dropping sync', async () => {
  const h = harness(task(), { dependencies: { createCalendarClient: () => null } })
  const result = await h.sync({ tenantId: 'company-a', taskId: 'task-a', notify: false })
  assert.equal(result.failed, 1)
  assert.equal(h.state.task.calendarLinks[0].error, 'calendar_sync_unavailable')
  assert.equal(h.state.task.effectsPending, true)
})

test('a cancellation during calendar writing is reloaded and cleans the just-created projection', async () => {
  let h
  let changed = false
  h = harness(task(), { updateEvent: async () => {
    if (changed) return
    changed = true
    h.state.task.status = 'canceled'; h.state.task.revision += 1
    const queued = await h.sync({ tenantId: 'company-a', taskId: 'task-a', event: 'canceled' })
    assert.equal(queued.queued, true)
  }, loadRecipients: async ({ task }) => ({ company: company(), recipients: [recipient({ allowed: task.status !== 'canceled', orderOpen: task.status !== 'canceled' })] }) })
  await h.sync({ tenantId: 'company-a', taskId: 'task-a', event: 'assigned' })
  assert.equal(h.calls.updates.length, 1)
  assert.equal(h.calls.deletes.length, 1)
  assert.deepEqual(h.state.task.calendarLinks, [])
  assert.equal(h.calls.pushes.length, 1)
  assert.equal(h.calls.pushes[0].payload.title, 'Задача отменена')
  assert.equal(h.state.task.effectsLockToken, '')
})

test('recipient loading retains archived users only for cleaning old calendar projections', async () => {
  const find = (rows) => ({ find: () => ({ lean: async () => rows }) })
  const load = createPartyTaskRecipientLoader({ getStaff: async () => find([]), getRoles: async () => find([]), getCompany: async () => ({ findOne: () => ({ lean: async () => company() }) }), getUsers: async () => find([{ _id: 'old-user', status: 'archived' }]), getOrders: async () => ({}), canAccess: () => true })
  const result = await load({ tenantId: 'company-a', task: task({ calendarLinks: [{ staffId: 'old-staff', userId: 'old-user', calendarId: 'old-calendar', eventId: 'old-event' }] }) })
  assert.equal(result.recipients[0].user._id, 'old-user')
  assert.equal(result.recipients[0].allowed, false)
  assert.equal(result.recipients[0].canReceiveCancellation, false)
})

test('targeted task push authorization reloads assignment, preferences and tenant before permitting transport', async () => {
  const taskId = 'a'.repeat(24)
  let recipientAllowed = true, preferences = true
  const authorize = createPartyTaskPushAuthorizer({ getTasks: async () => ({ findOne: (filter) => { assert.equal(filter.tenantId, 'company-a'); return { lean: async () => task({ _id: taskId }) } } }), loadRecipients: async () => ({ company: company(preferences), recipients: [recipient({ allowed: recipientAllowed, canReceiveCancellation: false })] }) })
  assert.equal((await authorize({ tenantId: 'company-a', taskId, targetUserId: 'user-a', event: 'assigned' })).authorized, true)
  assert.equal((await authorize({ tenantId: 'company-a', taskId, targetUserId: 'foreign-user', event: 'assigned' })).authorized, false)
  recipientAllowed = false
  assert.equal((await authorize({ tenantId: 'company-a', taskId, targetUserId: 'user-a', event: 'assigned' })).authorized, false)
  recipientAllowed = true; preferences = false
  assert.equal((await authorize({ tenantId: 'company-a', taskId, targetUserId: 'user-a', event: 'assigned' })).authorized, false)
})
