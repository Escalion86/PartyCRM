import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import { encryptPartyProviderToken, decryptPartyProviderToken, isPartyProviderEncryptionReady } from './partyTicketProvidersCrypto.js'
import { createPartyTicketProviderTransport } from './partyTicketProvidersTransport.js'
import { partyTicketProviderSchema } from '../schemas/partyTicketProviderSchema.js'
import { isPartyRestrictedManagementContext } from '../helpers/partyRolePermissions.js'

const secret = 'b'.repeat(64), tenantId = 'a'.repeat(24), token = 'PROVIDER_TEST_SECRET'
const context = { tenantId, role: 'owner', staff: { _id: 'c'.repeat(24) } }
const from = '2026-10-20T00:00:00.000Z', to = '2026-10-21T00:00:00.000Z'
const storeUuid = '20170228-F4F1-401B-80FA-9ECCA8451FFB'
const now = () => new Date('2026-10-27T12:00:00Z')
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers })
const strip = (source) => source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export const ', 'const ')
const source = strip(await readFile(new URL('./partyTicketProviders.js', import.meta.url), 'utf8'))
const factory = new Function('isPartyRestrictedManagementContext', 'getPartyTicketProviderModel', 'decryptPartyProviderToken', 'encryptPartyProviderToken', 'isPartyProviderEncryptionReady', 'createPartyTicketProviderTransport', `${source}\nreturn createPartyTicketProviderService`)(isPartyRestrictedManagementContext, null, decryptPartyProviderToken, encryptPartyProviderToken, isPartyProviderEncryptionReady, createPartyTicketProviderTransport)
function setup() {
  const rows = [], writes = [], remoteCalls = []
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => value?.$exists === false ? !Object.hasOwn(row, key) : row[key] === value)
  const query = (get) => ({ select() { return this }, async lean() { return structuredClone(get()) } })
  const Model = {
    init: async () => {},
    find: (filter) => query(() => rows.filter((row) => matches(row, filter))),
    findOne: (filter) => query(() => rows.find((row) => matches(row, filter)) || null),
    async updateOne(filter, update, options = {}) {
      writes.push({ filter, update, options })
      let row = rows.find((row) => matches(row, filter))
      if (!row && options.upsert) {
        if (rows.some((entry) => entry.tenantId === filter.tenantId && entry.provider === filter.provider)) throw Object.assign(new Error('duplicate'), { code: 11000 })
        row = { tenantId: filter.tenantId, provider: filter.provider }; rows.push(row)
        Object.assign(row, structuredClone(update.$set)); return { upsertedCount: 1, matchedCount: 0 }
      }
      if (!row) return { matchedCount: 0 }
      Object.assign(row, structuredClone(update.$set)); return { matchedCount: 1 }
    },
  }
  const transport = { verify: async (...args) => { remoteCalls.push(['test', ...args]); return { stores: [{ id: storeUuid, title: 'Зал' }] } }, preview: async (...args) => { remoteCalls.push(['preview', ...args]); return { rows: [], imported: false } } }
  const service = factory({ loadModel: async () => Model, secret, transport, now })
  const run = (action, changes = {}, actor = context) => service.mutate(actor, { action, provider: 'ticketscloud', expectedRevision: rows.find((row) => row.tenantId === actor.tenantId)?.revision || 0, ...changes })
  return { rows, writes, remoteCalls, Model, transport, service, run }
}

test('first concurrent provider saves wait for the unique index and keep one connection', async () => {
  const state = setup()
  let ready = false
  state.Model.init = async () => { await Promise.resolve(); ready = true }
  const write = state.Model.updateOne
  state.Model.updateOne = (...args) => { assert.equal(ready, true); return write(...args) }
  const outcomes = await Promise.allSettled([state.run('save', { token, expectedRevision: 0 }), state.run('save', { token, expectedRevision: 0 })])
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(outcomes.find((result) => result.status === 'rejected').reason.status, 409)
  assert.equal(state.rows.length, 1)
})

test('AES-GCM uses random nonces, authenticates tenant/provider, detects tampering and never stores plaintext', () => {
  const options = { tenantId, provider: 'ticketscloud', secret }, first = encryptPartyProviderToken(token, options), second = encryptPartyProviderToken(token, options)
  assert.equal(decryptPartyProviderToken(first, options), token)
  assert.notEqual(first.iv, second.iv); assert.doesNotMatch(JSON.stringify(first), new RegExp(token))
  for (const changes of [{ tenantId: 'd'.repeat(24) }, { provider: 'evotor' }, { secret: 'c'.repeat(64) }]) assert.throws(() => decryptPartyProviderToken(first, { ...options, ...changes }), { status: 503 })
  assert.throws(() => decryptPartyProviderToken({ ...first, tag: Buffer.alloc(16).toString('base64') }, options), { status: 503 })
  assert.throws(() => decryptPartyProviderToken({ ...first, version: 2 }, options), { status: 503 })
  assert.equal(isPartyProviderEncryptionReady(secret), true); assert.equal(isPartyProviderEncryptionReady(Buffer.alloc(32, 1).toString('base64')), true)
  for (const value of ['', 'password', 'a'.repeat(63), ' '.repeat(64)]) assert.equal(isPartyProviderEncryptionReady(value), false)
})

test('real Mongoose connection schema casts tenant, excludes credentials and has unique tenant/provider index', async () => {
  const definition = new mongoose.Schema(partyTicketProviderSchema), Model = mongoose.model('TicketProviderSchemaQA', definition)
  const query = Model.find({ tenantId }); query.cast(Model)
  assert.ok(query.getFilter().tenantId instanceof mongoose.Types.ObjectId)
  assert.equal(Model.schema.path('credential').options.select, false)
  assert.ok(new Model({ tenantId, provider: 'bad' }).validateSync().errors.provider)
  const modelSource = strip(await readFile(new URL('./partyTicketProvidersModel.js', import.meta.url), 'utf8'))
  const get = new Function('PRODUCTS', 'getProductModel', 'partyTicketProviderSchema', `${modelSource};return getPartyTicketProviderModel`)({ PARTYCRM: 'partycrm' }, ({ schemaDefinition, configureSchema }) => { const schema = new mongoose.Schema(schemaDefinition); configureSchema(schema); return schema }, partyTicketProviderSchema)
  assert.ok(get().indexes().some(([keys, options]) => options.unique && keys.tenantId && keys.provider))
  mongoose.deleteModel('TicketProviderSchemaQA')
})

test('owner/admin membership only; global admin and restricted admin cannot list or mutate connections', async () => {
  const state = setup()
  for (const actor of [{ ...context, role: 'manager', user: { role: 'admin' } }, { ...context, role: 'performer' }, { ...context, role: 'admin', position: { permissions: {}, orderScope: { locationIds: ['x'] } } }, { ...context, tenantId: null }]) {
    await assert.rejects(state.service.list(actor), { status: 403 })
    await assert.rejects(state.run('save', { token }, actor), { status: 403 })
  }
  assert.equal(state.writes.length, 0); assert.equal(state.remoteCalls.length, 0)
})

test('save is local encrypted-only; list and mutation DTOs never return secrets or other tenants', async () => {
  const state = setup(), saved = await state.run('save', { token })
  assert.equal(saved.connection.status, 'unchecked'); assert.equal(saved.connection.revision, 1)
  assert.equal(state.remoteCalls.length, 0); assert.doesNotMatch(JSON.stringify(saved), /credential|PROVIDER_TEST_SECRET/)
  state.rows.push({ tenantId: 'other', provider: 'evotor', credential: 'FOREIGN_TOKEN', configured: true })
  const list = await state.service.list(context)
  assert.equal(list.providers.length, 3); assert.equal(list.providers[1].configured, false)
  assert.doesNotMatch(JSON.stringify(list), /credential|SECRET|FOREIGN/)
  assert.equal(list.providers[0].capabilities.reserve, false); assert.equal(list.providers[2].capabilities.preview, false)
  assert.equal(state.writes[0].filter.tenantId, tenantId)
})

test('blank token preserves existing credential, revisions prevent overwrite and disconnect removes credential', async () => {
  const state = setup(); await state.run('save', { provider: 'evotor', token, storeUuid: '' })
  const encrypted = structuredClone(state.rows[0].credential)
  await state.run('save', { provider: 'evotor', token: '', storeUuid })
  assert.deepEqual(state.rows[0].credential, encrypted)
  await assert.rejects(state.run('save', { provider: 'evotor', token, storeUuid, expectedRevision: 1 }), { status: 409 })
  await state.run('disconnect', { provider: 'evotor' })
  assert.equal(state.rows[0].credential, null); assert.equal(state.rows[0].configured, false)
  assert.equal(state.remoteCalls.length, 0)
})

test('explicit verification stores safe result; preview is read only and does not create local ticket facts', async () => {
  const state = setup(); await state.run('save', { token }); const writes = state.writes.length
  const result = await state.run('test'); assert.equal(result.connection.status, 'verified'); assert.equal(result.stores.length, 1)
  assert.equal(state.remoteCalls[0][2], token)
  const preview = await state.run('preview', { payload: { dateFrom: from, dateTo: to } })
  assert.equal(preview.preview.imported, false); assert.equal(state.writes.length, writes + 1)
  assert.equal(state.remoteCalls.length, 2)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token))
})

test('failed verification cannot mark replacement credentials verified; errors persist codes only', async () => {
  const state = setup(); await state.run('save', { token })
  state.transport.verify = async () => { state.rows[0].revision++; throw Object.assign(new Error('Safe error'), { status: 422, code: 'partycrm_provider_unauthorized' }) }
  await assert.rejects(state.run('test'), { status: 422 })
  assert.equal(state.rows[0].status, 'unchecked')
  state.transport.verify = async () => { throw Object.assign(new Error('Safe error'), { status: 422, code: 'partycrm_provider_unauthorized' }) }
  await assert.rejects(state.run('test'), { status: 422 })
  assert.equal(state.rows[0].lastErrorCode, 'partycrm_provider_unauthorized')
  assert.equal(state.rows[0].status, 'error')
})

test('invalid tokens, arbitrary providers, absent token, invalid UUID and revisions fail before transport', async () => {
  const state = setup()
  for (const changes of [{ token: 'secret\nheader' }, { token: 'a'.repeat(4097) }, { token: '' }, { token, provider: 'krasbilet' }, { token, provider: 'https://evil.invalid' }, { token, provider: 'evotor', storeUuid: '../private' }, { token, expectedRevision: 0.5 }]) await assert.rejects(state.run('save', changes), { status: 400 })
  assert.equal(state.remoteCalls.length, 0); assert.equal(state.writes.length, 0)
})

test('Ticketscloud adapter uses documented fixed GET/auth contract and safe order preview without contacts/barcodes', async () => {
  const calls = [], body = { data: [{ id: 'order1', code: 'ABC', event: 'event1', status: 'done', created_at: '2026-10-20 09:00:00', customer: { email: 'hidden@example.invalid' }, tickets: [{ barcode: 'PRIVATE_BARCODE' }], values: { price: '150.15', full: '160.00' } }], pagination: { total: 41 }, refs: { events: { event1: { title: { text: 'Шоу' }, timezone: 'Europe/Moscow', lifetime: { start: '2026-11-01 15:00:00' } } } } }
  const transport = createPartyTicketProviderTransport({ now, fetchImpl: async (...args) => { calls.push(args); return json(body) } })
  await transport.verify('ticketscloud', token)
  const preview = await transport.preview('ticketscloud', token, {}, { dateFrom: from, dateTo: to })
  assert.equal(preview.nextPage, 2); assert.equal(preview.rows[0].priceKopecks, 15015); assert.equal(preview.rows[0].createdAtSource, '2026-10-20 09:00:00')
  assert.equal(preview.rows[0].sourceTimeZone, 'Europe/Moscow'); assert.equal(preview.financialEffect, false); assert.equal(preview.availabilityKnown, false)
  assert.doesNotMatch(JSON.stringify(preview), /hidden@|PRIVATE_BARCODE|customer/)
  const [url, options] = calls[1]; assert.equal(new URL(url).origin, 'https://ticketscloud.com'); assert.equal(new URL(url).pathname, '/v2/resources/orders')
  assert.equal(new URL(url).searchParams.get('created_at'), `${from},${to}`); assert.equal(options.headers.Authorization, `key ${token}`); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error')
})

test('Evotor adapter separates cloud receipts from payment commands and reads only selected store', async () => {
  const calls = [], transport = createPartyTicketProviderTransport({ now, fetchImpl: async (url, options) => { calls.push([url, options]); return json(url.includes('/search') ? [{ uuid: storeUuid, name: 'Зал', address: 'PRIVATE_ADDRESS' }] : [{ uuid: 'doc1', type: 'SELL', closeResultSum: '123.45', closeDate: '2026-10-20T09:00:00.000+0000', number: 2, transactions: [{ PRIVATE_PAYMENT: true }] }, { uuid: 'inventory', type: 'INVENTORY' }]) } })
  const verify = await transport.verify('evotor', token); assert.deepEqual(verify.stores, [{ id: storeUuid, title: 'Зал' }])
  const preview = await transport.preview('evotor', token, { storeUuid }, { dateFrom: from, dateTo: to })
  assert.equal(preview.rows.length, 1); assert.equal(preview.rows[0].amountKopecks, 12345); assert.equal(preview.financialEffect, false)
  const url = new URL(calls[1][0]); assert.equal(url.origin, 'https://api.evotor.ru'); assert.equal(url.pathname, `/api/v1/inventories/stores/${storeUuid}/documents`); assert.equal(url.searchParams.get('types'), 'SELL,PAYBACK'); assert.equal(url.searchParams.get('gtCloseDate'), '2026-10-20T00:00:00.000+0000')
  assert.equal(calls[0][1].headers['X-Authorization'], token); assert.doesNotMatch(JSON.stringify({ verify, preview }), /PRIVATE|transactions|address/)
})

test('preview validates strict bounded dates, page, UUID, future dates and Evotor history window before network', async () => {
  let calls = 0
  const transport = createPartyTicketProviderTransport({ now, fetchImpl: async () => { calls++; return json([]) } })
  for (const payload of [{ dateFrom: '2026-02-30T00:00:00Z', dateTo: to }, { dateFrom: from, dateTo: from }, { dateFrom: from, dateTo: '2026-10-29T00:00:00Z' }, { dateFrom: '2026-10-20', dateTo: to }, { dateFrom: from, dateTo: to, page: -1 }]) await assert.rejects(transport.preview('ticketscloud', token, {}, payload), { status: 400 })
  await assert.rejects(transport.preview('evotor', token, { storeUuid: '../evil' }, { dateFrom: from, dateTo: to }), { status: 400 })
  await assert.rejects(transport.preview('evotor', token, { storeUuid }, { dateFrom: '2026-01-01T00:00:00Z', dateTo: '2026-01-02T00:00:00Z' }), { status: 400 })
  assert.equal(calls, 0)
})

test('upstream errors, redirects and invalid JSON are redacted; oversized and timed-out responses bounded', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'unauthorized'], [429, 'rate_limited'], [500, 'unavailable']]) {
    const transport = createPartyTicketProviderTransport({ fetchImpl: async () => json({ token, secret: 'PRIVATE' }, status) })
    await assert.rejects(transport.verify('ticketscloud', token), (error) => error.code === `partycrm_provider_${code}` && !error.message.includes(token))
  }
  const bad = createPartyTicketProviderTransport({ fetchImpl: async () => { throw new Error(`redirect with ${token}`) } })
  await assert.rejects(bad.verify('ticketscloud', token), { code: 'partycrm_provider_unavailable' })
  const invalid = createPartyTicketProviderTransport({ fetchImpl: async () => new Response('not json') })
  await assert.rejects(invalid.verify('ticketscloud', token), { code: 'partycrm_provider_invalid_response' })
  const oversized = createPartyTicketProviderTransport({ fetchImpl: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)) })
  await assert.rejects(oversized.verify('ticketscloud', token), { code: 'partycrm_provider_response_too_large' })
  const timeout = createPartyTicketProviderTransport({ timeoutMs: 5, fetchImpl: async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error(`secret ${token}`)))) })
  await assert.rejects(timeout.verify('ticketscloud', token), { code: 'partycrm_provider_timeout', status: 504 })
})
