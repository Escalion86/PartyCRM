import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as taskHelpers from '../helpers/partyTasks.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const strip = (text) => text.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ').replaceAll('export const ', 'const ')
const serviceSource = strip(await readFile(new URL('./partyTasks.js', import.meta.url), 'utf8'))
const mediaSource = strip(await readFile(new URL('../app/api/party/task-media/[id]/route.js', import.meta.url), 'utf8'))
const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value))
const taskApi = new Function(...Object.keys({ ...taskHelpers, canPartyAccess, isValidObjectId }), `${serviceSource}\nreturn {canReadTask,canAccessTaskOrder,taskAssignmentFilter,canManageTask,taskMediaIds}`)(...Object.values({ ...taskHelpers, canPartyAccess, isValidObjectId }))
const tenantId = 'a'.repeat(24), staffId = 'b'.repeat(24), userId = 'c'.repeat(24), rootId = 'd'.repeat(24), photoId = 'e'.repeat(24), childId = 'f'.repeat(24)
const context = { tenantId, role: 'performer', sessionUser: { _id: userId }, staff: { _id: staffId, tenantId, role: 'performer', status: 'active' }, position: { permissions: { tasks: 'read', orders: 'read' }, orderScope: {} } }

const setup = ({ referencesPhoto = false, ownPreview = false } = {}) => {
  const ctx = ownPreview ? { ...context, position: { permissions: { tasks: 'read', 'tasks.edit': 'edit', orders: 'read' }, orderScope: {} } } : context
  const task = { _id: ownPreview ? rootId : childId, tenantId, seriesId: ownPreview ? null : rootId, orderId: null, assigneeStaffIds: [staffId], status: ownPreview ? 'new' : 'done', descriptionHtml: referencesPhoto ? `<p>Фото исторического задания</p><img src="/api/party/task-media/${photoId}">` : '<p>Исторический ответ без нового фото серии</p>' }
  const media = { _id: photoId, tenantId, taskId: rootId, uploadedByUserId: ownPreview ? userId : 'another-user', size: 1, bytes: Buffer.from([1]) }
  const q = (value) => ({ limit() { return this }, select() { return this }, lean: async () => value })
  const deps = {
    ...taskApi, canPartyAccess, isValidObjectId,
    NextResponse: class { constructor(body, options) { this.status = 200; this.body = body; this.headers = options.headers } },
    getPartyMembershipContext: async () => ({ sessionUser: { _id: userId } }),
    resolvePartyRequestContext: () => ({ context: ctx }),
    partyError: (status, code) => ({ status, code }),
    getPartyTaskMediaModel: async () => ({ findOne: (filter) => { if (filter.tenantId) assert.equal(filter.tenantId, tenantId); return q(media) } }),
    getPartyTaskModel: async () => ({ find: (filter) => { assert.equal(filter.tenantId, tenantId); return q([task]) } }),
    loadTaskOrder: async () => null,
  }
  const get = new Function(...Object.keys(deps), `${mediaSource}\nreturn GET`)(...Object.values(deps))
  return () => get({}, { params: { id: photoId } })
}

test('a former series participant cannot read a new root photo absent from their completed task snapshot', async () => {
  assert.equal((await setup()()).status, 404)
})

test('a historical task can still show its own referenced series photo, and uploader can preview their current task upload', async () => {
  assert.equal((await setup({ referencesPhoto: true })()).status, 200)
  assert.equal((await setup({ ownPreview: true })()).status, 200)
})
