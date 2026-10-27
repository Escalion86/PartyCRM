import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isPartyTaskAssignee, taskIdOf } from '../helpers/partyTasks.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const source = await readFile(new URL('./partyTaskEffects.js', import.meta.url), 'utf8')
const start = source.indexOf('export const createPartyTaskRecipientLoader')
const end = source.indexOf('export const loadPartyTaskRecipients', start)
const factory = new Function('isPartyTaskAssignee', 'taskIdOf', `${source.slice(start, end).replace('export const ', 'const ')}\nreturn createPartyTaskRecipientLoader`)(isPartyTaskAssignee, taskIdOf)
const tenantId = 'a'.repeat(24), staffId = 'b'.repeat(24), newUserId = 'c'.repeat(24), oldUserId = 'd'.repeat(24)

test('relinking a staff account retains a separate cleanup recipient for the previous calendar owner', async () => {
  const query = (value) => ({ lean: async () => value })
  const loader = factory({
    getStaff: async () => ({ find: (filter) => { assert.equal(filter.tenantId, tenantId); return query([{ _id: staffId, tenantId, role: 'performer', status: 'active', authUserId: newUserId }]) } }),
    getRoles: async () => ({ find: (filter) => { assert.equal(filter.tenantId, tenantId); return query([{ _id: 'position', tenantId, systemKey: 'performer', active: true, permissions: { tasks: 'read' } }]) } }),
    getCompany: async () => ({ findOne: (filter) => { assert.equal(filter._id, tenantId); return query({ _id: tenantId, status: 'active' }) } }),
    getUsers: async () => ({ find: (filter) => { assert.equal(filter._id.$in.includes(oldUserId), true); assert.equal(filter._id.$in.includes(newUserId), true); return query([{ _id: oldUserId, status: 'active' }, { _id: newUserId, status: 'active' }]) } }),
    getOrders: async () => ({}), canAccess: canPartyAccess, canAccessLocation: () => true,
  })
  const result = await loader({ tenantId, task: { _id: 'task', status: 'new', assigneeStaffIds: [staffId], calendarLinks: [{ staffId, userId: oldUserId, calendarId: 'old-calendar', eventId: 'old-event' }] } })
  const current = result.recipients.find((recipient) => String(recipient.user?._id) === newUserId)
  const cleanup = result.recipients.find((recipient) => String(recipient.user?._id) === oldUserId)
  assert.equal(current.allowed, true)
  assert.ok(cleanup, 'Previous owner needs their own credentials to delete their calendar projection')
  assert.equal(cleanup.allowed, false)
  assert.equal(cleanup.assigned, false)
})
