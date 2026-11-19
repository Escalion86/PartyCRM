import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import partyStaffSchema from '../schemas/partyStaffSchema.js'
import * as today from '../helpers/partyToday.js'

const tenantId = 'a'.repeat(24)
const staffId = 'b'.repeat(24)
const actor = (role = 'owner', permissions) => ({
  tenantId,
  role,
  staff: { _id: staffId, tenantId, role, status: 'active' },
  ...(permissions ? { position: { tenantId, active: true, permissions } } : {}),
  company: { settings: {} },
})
const source = (await readFile(new URL('../app/api/party/today/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(/^export /gm, '')

function setup({ context = actor(), authError, matched = true } = {}) {
  const writes = []
  let modelCalls = 0
  const deps = {
    ...today,
    getPartyRequestContext: async (options) => {
      assert.equal(options.allowLocationOwner, true)
      assert.notEqual(options.managementOnly, true)
      return authError ? { error: authError } : { context }
    },
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value || '')),
    parseJsonBody: async (req) => req.body,
    loadPartyToday: async () => ({ sections: [], context: { staffId: context.staff?._id } }),
    getPartyStaffModel: async () => {
      modelCalls++
      return { findOneAndUpdate(filter, update, options) {
        writes.push({ filter, update, options })
        return { select(fields) {
          assert.equal(fields, 'todayWidgetIds')
          return { lean: async () => {
            if (!matched) return null
            context.staff.todayWidgetIds = update.$set.todayWidgetIds
            return { todayWidgetIds: update.$set.todayWidgetIds }
          } }
        } }
      } }
    },
    NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, body, headers: options.headers }) },
    partyError: (status, code, message) => ({ status, body: { success: false, error: { code, message } } }),
  }
  const api = new Function(...Object.keys(deps), `${source};return {GET,PATCH}`)(...Object.values(deps))
  return { writes, modelCalls: () => modelCalls, get: () => api.GET({}), patch: (body) => api.PATCH({ body }) }
}

test('staff widget preferences default to null and retain an explicit empty array', () => {
  const Staff = mongoose.model('TodayPreferencesSchemaTest', new mongoose.Schema(partyStaffSchema))
  assert.equal(new Staff({ tenantId }).todayWidgetIds, null)
  assert.deepEqual(new Staff({ tenantId, todayWidgetIds: [] }).todayWidgetIds.toObject(), [])
  assert.ok(new Staff({ tenantId, todayWidgetIds: ['unknown'] }).validateSync())
})

test('PATCH stores only the current active membership and supports empty, ordered and reset preferences', async () => {
  const api = setup()
  assert.equal((await api.get()).body.data.widgetIds, null)
  assert.equal((await api.get()).body.data.canCustomizeWidgets, true)
  for (const widgetIds of [[], ['orders_upcoming', 'tasks'], null]) {
    const response = await api.patch({ widgetIds, tenantId: 'hostile', staffId: 'hostile' })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body.data.widgetIds, widgetIds)
    const write = api.writes.at(-1)
    assert.deepEqual(write.filter, { _id: staffId, tenantId, status: 'active' })
    assert.deepEqual(write.update, { $set: { todayWidgetIds: widgetIds } })
    assert.deepEqual((await api.get()).body.data.widgetIds, widgetIds)
  }
})

test('preferences cannot grant hidden widgets and GET filters old grants against the current position', async () => {
  const context = actor('performer', { tasks: 'read' })
  context.staff.todayWidgetIds = ['payments', 'tasks', 'unknown', 'tasks']
  const api = setup({ context })
  assert.deepEqual((await api.get()).body.data.widgetIds, ['tasks'])
  assert.equal((await api.patch({ widgetIds: ['payments'] })).status, 403)
  assert.equal(api.modelCalls(), 0)
  assert.equal((await api.patch({ widgetIds: [] })).status, 200)
  const revoked = setup({ context: actor('performer', {}) })
  assert.equal((await revoked.patch({ widgetIds: null })).status, 403)
  assert.equal(revoked.modelCalls(), 0)
})

test('ordinary performers and location owners can save only their own permitted blocks', async () => {
  for (const role of ['performer', 'location_owner']) {
    const api = setup({ context: actor(role, { tasks: 'read' }) })
    assert.equal((await api.patch({ widgetIds: ['tasks'] })).status, 200)
    assert.deepEqual(api.writes[0].filter, { _id: staffId, tenantId, status: 'active' })
  }
  const inactive = actor()
  inactive.staff.status = 'paused'
  const api = setup({ context: inactive })
  assert.equal((await api.patch({ widgetIds: [] })).status, 403)
  assert.equal(api.modelCalls(), 0)
})

test('malformed payloads and inactive or synthetic memberships never save preferences', async () => {
  const api = setup()
  for (const body of [{}, { widgetIds: true }, { widgetIds: ['unknown'] }, { widgetIds: ['tasks', 'tasks'] }])
    assert.equal((await api.patch(body)).status, 400)
  assert.equal(api.modelCalls(), 0)
  const stale = setup({ matched: false })
  assert.equal((await stale.patch({ widgetIds: [] })).status, 409)
  const context = actor()
  context.staff = { ...context.staff, _id: `dev:user:${tenantId}`, isDeveloperAccess: true }
  const developer = setup({ context })
  assert.equal((await developer.get()).body.data.canCustomizeWidgets, false)
  assert.equal((await developer.patch({ widgetIds: null })).status, 409)
  assert.equal(developer.modelCalls(), 0)
  const denied = setup({ authError: { status: 401 } })
  assert.equal((await denied.patch({ widgetIds: [] })).status, 401)
  assert.equal(denied.modelCalls(), 0)
})
