import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const coreCode = await readFile(new URL('helpers/partyInboxCore.js', root), 'utf8')
const { parsePartyInboxPatch, buildPartyInboxWorkflowUpdate } = await import(`data:text/javascript;base64,${Buffer.from(coreCode).toString('base64')}`)
const routeCode = (await readFile(new URL('app/api/party/inbox/[id]/route.js', root), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
  .replaceAll('export async function ', 'async function ')
const tenantId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const sourceId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const clientId = 'cccccccccccccccccccccccc'
const query = (value) => ({ select() { return this }, sort() { return this }, limit() { return this }, lean: async () => value })

function setup({ denied = false, referenceExists = true, telegramAllowed = true, current = null, conflict = false, direction = 'incoming' } = {}) {
  const filters = [], writes = []
  const source = { findOne(filter) { filters.push(filter); return query({ _id: sourceId, direction }) } }
  const reference = { exists: async (filter) => { filters.push(filter); return referenceExists ? { _id: filter._id } : null } }
  const deps = {
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    getPartyRequestContext: async (options) => {
      assert.equal(options.managementOnly, true)
      return denied ? { error: { status: 403 } } : { context: { tenantId, staff: { _id: clientId } } }
    },
    isValidObjectId: (value) => /^[a-f\d]{24}$/i.test(String(value)),
    partyError: (status, code, message) => ({ status, body: { error: { code, message } } }),
    partyInboxSources: Object.fromEntries(['vk', 'avito', 'telegram', 'novofon'].map((channel) => [channel, { source: async () => source, messages: async () => ({ find: (filter) => { filters.push(filter); return query([]) }, findOne: (filter) => { filters.push(filter); return query({ _id: sourceId }) } }) }])),
    getPartyInboxStateModel: async () => ({ findOne: () => query(current), findOneAndUpdate: (filter, update) => { writes.push({ filter, update }); return query(conflict ? null : { ...update.$set, revision: 1 }) } }),
    getPartyClientModel: async () => reference,
    getPartyOrderModel: async () => reference,
    getPartyStaffModel: async () => reference,
    getPartyCompanyTariffAccessState: async () => ({ access: { allowTelegramIntegration: telegramAllowed } }),
    parsePartyInboxPatch, buildPartyInboxWorkflowUpdate,
  }
  const routes = new Function(...Object.keys(deps), `${routeCode}\nreturn { GET, PATCH }`)(...Object.values(deps))
  const req = { url: 'http://localhost/api', json: async () => ({ status: 'resolved', clientId, expectedRevision: 0 }) }
  return { ...routes, req, filters, writes }
}

test('management authorization blocks reads and writes before database access', async () => {
  const route = setup({ denied: true })
  assert.equal((await route.GET(route.req, { params: { id: `vk:${sourceId}` } })).status, 403)
  assert.equal((await route.PATCH(route.req, { params: { id: `vk:${sourceId}` } })).status, 403)
  assert.equal(route.filters.length, 0)
  assert.equal(route.writes.length, 0)
})

test('saving state scopes source, references and update to membership tenant', async () => {
  const route = setup()
  const result = await route.PATCH(route.req, { params: Promise.resolve({ id: `vk:${sourceId}` }) })
  assert.equal(result.status, 200)
  assert.equal(route.filters.length, 3)
  for (const filter of route.filters) assert.equal(filter.tenantId, tenantId)
  assert.equal(route.writes[0].filter.tenantId, tenantId)
  assert.equal(route.writes[0].filter.channel, 'vk')
  assert.equal(route.writes[0].filter.sourceId, sourceId)
  assert.equal(route.writes[0].update.$set.acknowledgedIncomingToken, sourceId)
})

test('a foreign company reference is rejected without saving', async () => {
  const route = setup({ referenceExists: false })
  assert.equal((await route.PATCH(route.req, { params: { id: `vk:${sourceId}` } })).status, 400)
  assert.equal(route.writes.length, 0)
})

test('Telegram tariff protects both detail and state API', async () => {
  const route = setup({ telegramAllowed: false })
  assert.equal((await route.GET(route.req, { params: { id: `telegram:${sourceId}` } })).status, 403)
  assert.equal((await route.PATCH(route.req, { params: { id: `telegram:${sourceId}` } })).status, 403)
  assert.equal(route.filters.length, 0)
})

test('malformed source ids and channels never reach database', async () => {
  const route = setup()
  for (const id of [`__proto__:${sourceId}`, 'vk:bad', `vk:${sourceId}:extra`]) {
    assert.equal((await route.GET(route.req, { params: { id } })).status, 400)
  }
  assert.equal(route.filters.length, 0)
})

test('Novofon detail cannot expose a call from another provider', async () => {
  const route = setup()
  assert.equal((await route.GET(route.req, { params: { id: `novofon:${sourceId}` } })).status, 200)
  assert.deepEqual(route.filters[0], { _id: sourceId, tenantId, provider: 'novofon' })
})

test('saving a sales change writes bounded server history with the same revision guard', async () => {
  const route = setup({ current: { revision: 2, salesStage: 'proposal' } })
  const request = { json: async () => ({ status: 'waiting_client', expectedRevision: 2, salesStage: 'lost', lostReason: 'Перенесли праздник' }) }
  const result = await route.PATCH(request, { params: { id: `vk:${sourceId}` } })
  assert.equal(result.status, 200)
  const { update, filter } = route.writes[0]
  assert.equal(filter.revision, 2)
  assert.equal(update.$push.history.$slice, -200)
  assert.equal(update.$push.history.$each[0].byStaffId, clientId)
  assert.equal(update.$set.salesStage, 'lost')
  assert.equal(update.$set.status, 'waiting_client')
  assert.equal(Object.hasOwn(update.$set, 'responseDueAt'), false)
})

test('a new incoming revision prevents an old sales change from being saved', async () => {
  const route = setup({ current: { revision: 3, salesStage: 'proposal' } })
  const request = { json: async () => ({ status: 'resolved', expectedRevision: 2, salesStage: 'lost', lostReason: 'Отказ' }) }
  assert.equal((await route.PATCH(request, { params: { id: `vk:${sourceId}` } })).status, 409)
  assert.equal(route.writes.length, 0)
})

test('a concurrent write after reading the state also returns conflict', async () => {
  const route = setup({ current: { revision: 2 }, conflict: true })
  const request = { json: async () => ({ status: 'in_progress', expectedRevision: 2, salesStage: 'qualification' }) }
  assert.equal((await route.PATCH(request, { params: { id: `vk:${sourceId}` } })).status, 409)
})

test('legacy patches cannot unlink a booked sale without changing its stage', async () => {
  const route = setup({ current: { revision: 0, salesStage: 'won', orderId: sourceId } })
  assert.equal((await route.PATCH(route.req, { params: { id: `vk:${sourceId}` } })).status, 400)
  assert.equal(route.writes.length, 0)
})

test('detail returns only sales events from the tenant history', async () => {
  const route = setup({ current: { history: [
    { type: 'sla_answered', token: 'private-provider-token' },
    { type: 'sales_stage_changed', at: '2026-09-13', fromSalesStage: 'new', toSalesStage: 'lost', lostReason: 'Перенос', token: 'hidden' },
  ] } })
  const result = await route.GET(route.req, { params: { id: `vk:${sourceId}` } })
  assert.equal(result.body.data.salesHistory.length, 1)
  assert.equal(result.body.data.salesHistory[0].lostReason, 'Перенос')
  assert.equal(Object.hasOwn(result.body.data.salesHistory[0], 'token'), false)
})
