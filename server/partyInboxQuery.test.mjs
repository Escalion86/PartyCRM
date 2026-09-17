import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const readModule = async (path) => import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL(path, root), 'utf8')).toString('base64')}`)
const { buildPartyInboxOverduePipeline, buildPartyInboxSalesStagePipeline } = await readModule('helpers/partyInboxQuery.js')
const now = new Date('2026-09-13T10:00:00Z')
const date = (minutes) => new Date(+now + minutes * 60000)
const tenantId = 'company-a'
const channels = ['vk', 'avito', 'novofon']
const sources = channels.map((channel) => ({ channel, collectionName: channel }))
const field = (row, path) => path.split('.').reduce((value, key) => value?.[key], row)
const equal = (left, right) => left == null && right == null || (left instanceof Date && right instanceof Date ? +left === +right : left === right)

// A deliberately limited in-memory aggregation adapter. It executes the actual
// production pipelines against fixtures; it is not a real Mongo integration test.
function expr(value, row, vars = {}) {
  if (value instanceof Date || value == null) return value
  if (typeof value === 'string') return value.startsWith('$$') ? vars[value.slice(2)] : value.startsWith('$') ? field(row, value.slice(1)) : value
  if (Array.isArray(value)) return value.map((item) => expr(item, row, vars))
  if (typeof value !== 'object') return value
  const [op, input] = Object.entries(value)[0]
  const args = expr(input, row, vars)
  switch (op) {
    case '$and': return args.every(Boolean)
    case '$eq': return equal(...args)
    case '$ne': return !equal(...args)
    case '$lt': return args[0] < args[1]
    case '$type': return args instanceof Date ? 'date' : typeof args
    case '$ifNull': return args[0] ?? args[1]
    case '$cond': return args[0] ? args[1] : args[2]
    case '$min': return args.reduce((left, right) => left < right ? left : right)
    case '$concatArrays': return args.flat()
    case '$arrayElemAt': return args[0][args[1]]
    default: throw new Error(`Unsupported expression ${op}`)
  }
}
function matches(row, filter, vars) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$expr') return expr(value, row, vars)
    if (key === '$or') return value.some((item) => matches(row, item, vars))
    const actual = field(row, key)
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === '$in') return expected.some((item) => equal(item, actual))
      if (op === '$ne') return !equal(actual, expected)
      if (op === '$lt') return actual < expected
      if (op === '$type') return expected === 'date' && actual instanceof Date
      if (op === '$exists') return (actual !== undefined) === expected
      throw new Error(`Unsupported matcher ${op}`)
    })
    return equal(actual, value)
  })
}
function aggregate(input, pipeline, collections, vars = {}) {
  return pipeline.reduce((rows, stage) => {
    const [op, value] = Object.entries(stage)[0]
    if (op === '$match') return rows.filter((row) => matches(row, value, vars))
    if (op === '$sort') return [...rows].sort((a, b) => {
      for (const [key, direction] of Object.entries(value)) {
        const left = field(a, key), right = field(b, key)
        if (!equal(left, right)) return (left > right ? 1 : -1) * direction
      }
      return 0
    })
    if (op === '$skip') return rows.slice(value)
    if (op === '$limit') return rows.slice(0, value)
    if (op === '$set') return rows.map((row) => ({ ...row, ...Object.fromEntries(Object.entries(value).map(([key, expression]) => [key, expr(expression, row, vars)])) }))
    if (op === '$unset') return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => ![value].flat().includes(key))))
    if (op === '$project') return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => Object.values(value).includes(1) ? value[key] === 1 : value[key] !== 0)))
    if (op === '$lookup') return rows.map((row) => ({ ...row, [value.as]: aggregate(collections[value.from] || [], value.pipeline, collections, Object.fromEntries(Object.entries(value.let).map(([key, expression]) => [key, expr(expression, row, vars)]))) }))
    if (op === '$group') {
      const groups = new Map()
      for (const row of rows) {
        const id = expr(value._id, row, vars)
        if (!groups.has(id)) groups.set(id, { _id: id, ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_id').map(([key, accumulator]) => {
          assert.deepEqual(Object.keys(accumulator), ['$first'])
          return [key, expr(accumulator.$first, row, vars)]
        })) })
      }
      return [...groups.values()]
    }
    throw new Error(`Unsupported stage ${op}`)
  }, input)
}

function fixtures() {
  const collections = { states: [], vk: [], avito: [], novofon: [], telegram: [] }
  function add(id, channel = 'vk', patch = {}, sourcePatch = {}) {
    const state = { _id: id, sourceId: id, tenantId, channel, status: 'needs_reply', ...patch }
    collections.states.push(state)
    collections[channel].push({ _id: id, tenantId, provider: 'novofon', lastMessageAt: date(0), startedAt: date(0), direction: 'incoming', ...sourcePatch })
    return state
  }
  return { collections, add }
}

test('overdue is global before pagination, preserves oldest, excludes foreign/orphan/unavailable sources', () => {
  const { collections, add } = fixtures()
  for (let i = 0; i < 160; i++) add(`fresh-${i}`, 'vk', { responseDueAt: date(10) })
  for (let i = 0; i < 105; i++) add(`due-${String(i).padStart(3, '0')}`, channels[i % 3], { responseDueAt: date(-200 + i) }, { lastMessageAt: date(-10000) })
  add('foreign-state', 'vk', { tenantId: 'company-b', responseDueAt: date(-500) })
  add('foreign-source', 'vk', { responseDueAt: date(-500) }, { tenantId: 'company-b' })
  add('different-provider', 'novofon', { responseDueAt: date(-500) }, { provider: 'other' })
  add('tariff-telegram', 'telegram', { responseDueAt: date(-500) })
  add('orphan', 'vk', { responseDueAt: date(-500) })
  collections.vk = collections.vk.filter((row) => row._id !== 'orphan')
  const run = (page) => aggregate(collections.states, buildPartyInboxOverduePipeline({ tenantId, sources, now, page }), collections)
  const first = run(0), second = run(1)
  assert.equal(first.length, 101)
  assert.equal(second.length, 5)
  assert.equal(first[0]._id, 'due-000')
  assert.equal(second[0]._id, 'due-100')
  assert.equal(new Set([...first.slice(0, 100), ...second].map((row) => row._id)).size, 105)
})

test('SLA remains overdue after dialogue resolution; follow-up closes; earliest real deadline wins', () => {
  const { collections, add } = fixtures()
  add('resolved-sla', 'vk', { status: 'resolved', responseDueAt: date(-20), nextContactAt: date(-30) })
  add('resolved-contact', 'vk', { status: 'resolved', nextContactAt: date(-40) })
  add('answered-sla', 'vk', { responseDueAt: date(-30), respondedAt: date(-10) })
  add('follow-up', 'avito', { status: 'follow_up', responseDueAt: date(-10), nextContactAt: date(-25) })
  add('invalid-sla', 'vk', { responseDueAt: 'old-invalid', nextContactAt: date(-15) })
  add('deadline-now', 'vk', { responseDueAt: now })
  add('legacy-no-deadline')
  const result = aggregate(collections.states, buildPartyInboxOverduePipeline({ tenantId, sources, now }), collections)
  assert.deepEqual(result.map((row) => [row._id, +row.overdueAt]), [['follow-up', +date(-25)], ['resolved-sla', +date(-20)], ['invalid-sla', +date(-15)]])
})

test('sales stage filters before page boundaries and counts state-less historical conversations as new', () => {
  const { collections, add } = fixtures()
  for (let i = 0; i < 140; i++) add(`proposal-${i}`, 'vk', { salesStage: 'proposal' })
  collections.vk.push({ _id: 'legacy-no-state', tenantId, lastMessageAt: date(-900) })
  add('legacy-state', 'vk', {}, { lastMessageAt: date(-1000) })
  add('old-won', 'vk', { salesStage: 'won' }, { lastMessageAt: date(-1100) })
  add('foreign-won', 'vk', { salesStage: 'won' }, { tenantId: 'company-b' })
  const run = (salesStage, page = 0) => aggregate(collections.vk, buildPartyInboxSalesStagePipeline({ tenantId, channel: 'vk', stateCollectionName: 'states', salesStage, page }), collections)
  assert.deepEqual(run('new').map((row) => row._id), ['legacy-no-state', 'legacy-state'])
  assert.deepEqual(run('won').map((row) => row._id), ['old-won'])
  assert.equal(run('proposal').length, 101)
  assert.equal(run('proposal', 1).length, 40)
})

test('stage lookup isolates company and channel, and overdue stage applies before pagination', () => {
  const { collections, add } = fixtures()
  add('same-id', 'vk', { tenantId: 'company-b', salesStage: 'won' })
  collections.states.push({ _id: 'other-channel', sourceId: 'same-id', tenantId, channel: 'avito', salesStage: 'lost' })
  const result = aggregate(collections.vk, buildPartyInboxSalesStagePipeline({ tenantId, channel: 'vk', stateCollectionName: 'states', salesStage: 'new' }), collections)
  assert.equal(result.length, 1)
  for (let i = 0; i < 130; i++) add(`ignored-${i}`, 'vk', { salesStage: 'new', responseDueAt: date(-200) })
  add('target', 'avito', { salesStage: 'won', responseDueAt: date(-10) })
  assert.deepEqual(aggregate(collections.states, buildPartyInboxOverduePipeline({ tenantId, sources, now, salesStage: 'won' }), collections).map((row) => row._id), ['target'])
})

const core = await readModule('helpers/partyInboxCore.js')
const sla = await import('../helpers/partyInboxSla.js')
const serviceCode = (await readFile(new URL('server/partyInbox.js', root), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replaceAll('export const ', 'const ')
function service(collections) {
  const casts = []
  const schema = { path: (name) => ({ cast: (value) => { casts.push({ name, value }); return value } }) }
  const model = (name) => ({
    schema, collection: { name },
    aggregate: async (pipeline) => aggregate(collections[name] || [], pipeline, collections),
    find: (filter) => {
      let rows = (collections[name] || []).filter((row) => matches(row, filter))
      const query = {
        select: () => query,
        sort: (spec) => { rows = aggregate(rows, [{ $sort: spec }], collections); return query },
        skip: (count) => { rows = rows.slice(count); return query },
        limit: (count) => { rows = rows.slice(0, count); return query },
        lean: async () => rows,
      }
      return query
    },
  })
  const deps = {
    getPartyVkConversationModel: async () => model('vk'), getPartyVkMessageModel: async () => model('vkMessages'),
    getPartyAvitoConversationModel: async () => model('avito'), getPartyAvitoMessageModel: async () => model('avitoMessages'),
    getPartyTelegramConversationModel: async () => model('telegram'), getPartyTelegramMessageModel: async () => model('telegramMessages'),
    getPartyCallModel: async () => model('novofon'), getPartyInboxStateModel: async () => model('states'),
    partyInboxKey: core.partyInboxKey, resolvePartyInboxStatus: core.resolvePartyInboxStatus,
    getPartyInboxSlaView: sla.getPartyInboxSlaView, buildPartyInboxOverduePipeline, buildPartyInboxSalesStagePipeline,
  }
  return { ...new Function(...Object.keys(deps), `${serviceCode}\nreturn { loadPartyInboxChannel, loadPartyInboxOverdue }`)(...Object.values(deps)), casts }
}

test('real channel loader maps stage and uses sentAt tokens consistently with detail saving', async () => {
  const { collections, add } = fixtures()
  add('conversation', 'vk', { salesStage: 'proposal', status: 'resolved', revision: 3, acknowledgedIncomingToken: 'latest-sent' })
  collections.vkMessages = [
    { _id: 'latest-sent', tenantId, conversationId: 'conversation', direction: 'incoming', sentAt: date(-1), createdAt: date(-2) },
    { _id: 'later-import', tenantId, conversationId: 'conversation', direction: 'incoming', sentAt: date(-5), createdAt: now },
    { _id: 'foreign-message', tenantId: 'company-b', conversationId: 'conversation', direction: 'incoming', sentAt: now },
  ]
  const loader = service(collections)
  for (const salesStage of ['', 'proposal']) {
    const result = await loader.loadPartyInboxChannel({ tenantId, channel: 'vk', salesStage })
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].incomingToken, 'latest-sent')
    assert.equal(result.items[0].status, 'resolved')
    assert.equal(result.items[0].salesStage, 'proposal')
    assert.equal(result.items[0].revision, 3)
  }
  assert.ok(loader.casts.length >= 3)
  assert.ok(loader.casts.every((cast) => cast.name === 'tenantId' && cast.value === tenantId))
})

test('real overdue loader returns 100 global mapped records and next page without duplicates', async () => {
  const { collections, add } = fixtures()
  for (let i = 0; i < 104; i++) add(`source-${String(i).padStart(3, '0')}`, channels[i % 3], { responseDueAt: date(-200 + i), salesStage: 'qualification' })
  const loader = service(collections)
  const first = await loader.loadPartyInboxOverdue({ tenantId, channels, now })
  const second = await loader.loadPartyInboxOverdue({ tenantId, channels, page: 1, now })
  assert.equal(first.items.length, 100)
  assert.equal(first.hasMore, true)
  assert.equal(second.items.length, 4)
  assert.equal(second.hasMore, false)
  assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 104)
  assert.ok(first.items.every((row) => row.overdue && row.salesStage === 'qualification'))
  assert.equal(+first.items[0].overdueAt, +date(-200))
  assert.deepEqual(await loader.loadPartyInboxOverdue({ tenantId, channels: [], now }), { hasMore: false, items: [] })
})

const routeCode = (await readFile(new URL('app/api/party/inbox/route.js', root), 'utf8')).replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '').replace('export const dynamic', 'const dynamic').replace('export async function GET', 'async function GET')
function listRoute({ denied = false, telegramAllowed = false } = {}) {
  const calls = []
  const optionsModel = { find: (filter) => { assert.equal(filter.tenantId, tenantId); const query = { select: () => query, sort: () => query, limit: () => query, lean: async () => [] }; return query } }
  const deps = {
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200, headers: options?.headers }) },
    getPartyRequestContext: async ({ managementOnly }) => { assert.equal(managementOnly, true); return denied ? { error: { status: 403 } } : { context: { tenantId } } },
    partyError: (status, code) => ({ status, code }),
    getPartyCompanyTariffAccessState: async () => ({ access: { allowTelegramIntegration: telegramAllowed } }),
    loadPartyInboxOverdue: async (args) => { calls.push({ scope: 'overdue', ...args }); return { items: [{ id: 'oldest' }], hasMore: true } },
    loadPartyInboxChannel: async (args) => { calls.push({ scope: 'all', ...args }); return { items: [], hasMore: false } },
    getPartyClientModel: async () => optionsModel, getPartyOrderModel: async () => optionsModel, getPartyStaffModel: async () => optionsModel,
  }
  const GET = new Function(...Object.keys(deps), `${routeCode}\nreturn GET`)(...Object.values(deps))
  return { calls, get: (search = '') => GET({ url: `http://localhost/api/party/inbox?${search}` }) }
}

test('list GET validates query/authorization before loaders and forwards stage to every permitted channel', async () => {
  const denied = listRoute({ denied: true })
  assert.equal((await denied.get()).status, 403)
  assert.equal(denied.calls.length, 0)
  const route = listRoute()
  for (const search of ['page=-1', 'page=1.5', 'scope=unknown', 'salesStage=__proto__']) assert.equal((await route.get(search)).status, 400)
  assert.equal(route.calls.length, 0)
  const result = await route.get('scope=all&salesStage=proposal&page=2')
  assert.equal(result.status, 200)
  assert.deepEqual(route.calls.map((call) => call.channel), channels)
  assert.ok(route.calls.every((call) => call.tenantId === tenantId && call.page === 2 && call.salesStage === 'proposal'))
  assert.equal(result.body.data.options, null)
})

test('list GET overdue uses one global loader with tariff channels and keeps first-page options', async () => {
  const route = listRoute({ telegramAllowed: true })
  const result = await route.get('scope=overdue&salesStage=lost')
  assert.equal(route.calls.length, 1)
  assert.deepEqual(route.calls[0], { scope: 'overdue', tenantId, channels: ['vk', 'avito', 'telegram', 'novofon'], page: 0, salesStage: 'lost' })
  assert.deepEqual(result.body.data.items, [{ id: 'oldest' }])
  assert.equal(result.body.data.hasMore, true)
  assert.equal(result.body.data.scope, 'overdue')
  assert.ok(result.body.data.options)
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
})
