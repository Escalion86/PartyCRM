import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const source = (path) => readFile(new URL(path, root), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const scheduleHelpers = await import(dataUrl(await source('helpers/partyInboxSchedule.js')))
const apiCode = await source('server/partyApi.js')
const { parseJsonBody } = await import(dataUrl(apiCode.slice(apiCode.indexOf('export const parseJsonBody'))))
const addressUrl = dataUrl(await source('helpers/addressPool.js'))
const companyHelpers = await import(dataUrl((await source('helpers/companySettings.js')).replace("'./addressPool.js'", JSON.stringify(addressUrl))))
const routeCode = async (path) => (await source(path))
  .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
  .replaceAll('export async function ', 'async function ')
  .replaceAll('export const ', 'const ')
const scheduleCode = await routeCode('app/api/party/inbox/schedule/route.js')
const companyCode = await routeCode('app/api/party/company-settings/route.js')
const tenantId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const query = (value) => ({ select() { return this }, lean: async () => value })
const req = (body) => ({ json: async () => body })

function setup({ denied = false, company = { settings: {} }, conflict = false, beforeGenericWrite } = {}) {
  let stored = structuredClone(company)
  const reads = [], writes = []
  const model = {
    findOne(filter) { reads.push(filter); return query(structuredClone(stored)) },
    findById(id) { reads.push({ _id: id }); return query(structuredClone(stored)) },
    findOneAndUpdate(filter, update) {
      writes.push({ filter, update })
      const revision = stored?.settings?.inboxScheduleRevision || 0
      const expected = filter['settings.inboxScheduleRevision'] ?? 0
      if (conflict || !stored || expected !== revision) return query(null)
      stored.settings = { ...stored.settings, inboxSchedule: update.$set['settings.inboxSchedule'], inboxScheduleRevision: revision + 1 }
      return query(structuredClone(stored))
    },
    async updateOne(filter, update) {
      writes.push({ filter, update })
      beforeGenericWrite?.(stored)
      for (const [key, value] of Object.entries(update.$set)) {
        if (key.startsWith('settings.')) stored.settings[key.slice(9)] = value
        else stored[key] = value
      }
    },
  }
  const deps = {
    ...scheduleHelpers, ...companyHelpers,
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) },
    partyError: (status, code, message) => ({ status, body: { error: { code, message } } }),
    getPartyRequestContext: async (options) => {
      assert.equal(options.managementOnly, true)
      return denied ? { error: { status: 403 } } : { context: { tenantId } }
    },
    getPartyCompanyModel: async () => model,
    parseJsonBody,
    getPartyCompanyTariffAccessState: async () => ({ access: { allowCalendarSync: true }, serializedAccess: {} }),
    preservePartyGoogleCalendarSettings: (_current, next) => next,
    serializePartyCompanySettingsForResponse: (settings) => settings,
  }
  const instantiate = (code) => new Function(...Object.keys(deps), `${code}\nreturn { GET, PATCH }`)(...Object.values(deps))
  return { schedule: instantiate(scheduleCode), generic: instantiate(companyCode), reads, writes, getStored: () => stored }
}

test('schedule read and write require company management before database access', async () => {
  const state = setup({ denied: true })
  assert.equal((await state.schedule.GET(req({}))).status, 403)
  assert.equal((await state.schedule.PATCH(req({}))).status, 403)
  assert.equal(state.reads.length, 0)
  assert.equal(state.writes.length, 0)
})

test('schedule GET scopes to membership tenant and returns defaults without integration secrets', async () => {
  const state = setup({ company: { settings: { integrations: { token: 'private' } } } })
  const result = await state.schedule.GET(req({ tenantId: 'foreign' }))
  assert.deepEqual(state.reads, [{ _id: tenantId }])
  assert.deepEqual(result.body.data, { schedule: scheduleHelpers.defaultPartyInboxSchedule(), revision: 0, timeZone: 'Asia/Krasnoyarsk' })
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  assert.equal(JSON.stringify(result).includes('private"'), false)
  assert.equal((await setup({ company: null }).schedule.GET(req({}))).status, 404)
})

test('schedule validation rejects malformed calendar and revisions without writes', async () => {
  const state = setup()
  const valid = scheduleHelpers.defaultPartyInboxSchedule()
  for (const body of [
    {}, { schedule: valid, expectedRevision: -1 }, { schedule: valid, expectedRevision: '0' },
    { schedule: { ...valid, week: [] }, expectedRevision: 0 },
    { schedule: { ...valid, exceptions: [{ date: '2026-02-30', closed: true }] }, expectedRevision: 0 },
  ]) assert.equal((await state.schedule.PATCH(req(body))).status, 400)
  assert.equal((await state.schedule.PATCH({ json: async () => { throw new SyntaxError('Invalid JSON') } })).status, 400)
  assert.equal(state.writes.length, 0)
})

test('first schedule write atomically guards missing revision and preserves other settings', async () => {
  const state = setup({ company: { settings: { timeZone: 'Europe/Moscow', notifications: { enabled: true } } } })
  const schedule = scheduleHelpers.defaultPartyInboxSchedule()
  schedule.exceptions.push({ date: '2026-12-31', closed: true })
  const result = await state.schedule.PATCH(req({ schedule, expectedRevision: 0, tenantId: 'foreign' }))
  assert.equal(result.status, 200)
  assert.equal(result.body.data.revision, 1)
  assert.equal(result.body.data.timeZone, 'Europe/Moscow')
  assert.deepEqual(state.writes[0].filter, { _id: tenantId, $or: [{ 'settings.inboxScheduleRevision': 0 }, { 'settings.inboxScheduleRevision': { $exists: false } }] })
  assert.deepEqual(Object.keys(state.writes[0].update.$set), ['settings.inboxSchedule'])
  assert.deepEqual(state.writes[0].update.$inc, { 'settings.inboxScheduleRevision': 1 })
  assert.deepEqual(state.getStored().settings.notifications, { enabled: true })
})

test('stale or concurrent schedule save returns conflict and preserves winning version', async () => {
  const state = setup()
  const schedule = scheduleHelpers.defaultPartyInboxSchedule()
  assert.equal((await state.schedule.PATCH(req({ schedule, expectedRevision: 0 }))).status, 200)
  const changed = structuredClone(schedule)
  changed.week[1].opens = '11:00'
  assert.equal((await state.schedule.PATCH(req({ schedule: changed, expectedRevision: 0 }))).status, 409)
  assert.deepEqual(state.getStored().settings.inboxSchedule, schedule)
  assert.equal((await state.schedule.PATCH(req({ schedule: changed, expectedRevision: 1 }))).status, 200)
  assert.deepEqual(state.writes[2].filter, { _id: tenantId, 'settings.inboxScheduleRevision': 1 })
  assert.equal((await setup({ conflict: true }).schedule.PATCH(req({ schedule, expectedRevision: 0 }))).status, 409)
})

test('generic company settings cannot bypass schedule validation or erase concurrent schedule update', async () => {
  const original = scheduleHelpers.defaultPartyInboxSchedule()
  const concurrent = structuredClone(original)
  concurrent.week[1].opens = '12:00'
  const state = setup({ company: { title: 'Old', settings: { inboxSchedule: original, inboxScheduleRevision: 1 } }, beforeGenericWrite: (stored) => {
    stored.settings.inboxSchedule = concurrent
    stored.settings.inboxScheduleRevision = 2
  } })
  const result = await state.generic.PATCH(req({ company: { title: 'New' }, timeZone: 'Europe/Moscow', inboxSchedule: { invalid: true }, inboxScheduleRevision: 99, 'inboxSchedule.week': [], 'inboxScheduleRevision.x': 12 }))
  assert.equal(result.status, 200)
  assert.deepEqual(state.reads, [{ _id: tenantId }])
  assert.equal(state.writes[0].filter._id, tenantId)
  const update = state.writes[0].update.$set
  assert.equal(Object.hasOwn(update, 'settings'), false)
  assert.equal(Object.keys(update).some((key) => key.startsWith('settings.inboxSchedule')), false)
  assert.equal(state.getStored().settings.inboxScheduleRevision, 2)
  assert.deepEqual(state.getStored().settings.inboxSchedule, concurrent)
  assert.equal(state.getStored().settings.timeZone, 'Europe/Moscow')
  assert.equal(state.getStored().title, 'New')
})
