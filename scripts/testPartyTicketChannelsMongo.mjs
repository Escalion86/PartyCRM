// Uses an owned temporary replica set and synthetic data. Never loads .env.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import mongoose, { Schema, Types } from 'mongoose'
import * as core from '../helpers/partyTicketsCore.js'
import * as channelHelpers from '../helpers/partyTicketChannels.js'
import * as schemas from '../schemas/partyTicketingSchema.js'
import { partyTicketChannelRecordSchema } from '../schemas/partyTicketChannelsSchema.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { isPartyTicketingEnabled } from '../helpers/partyTicketing.js'

const compile = async (file, dependencies, exports) => {
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
  return new Function(...Object.keys(dependencies), `${source}\nreturn ${exports}`)(...Object.values(dependencies))
}
const port = await new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const selected = server.address().port
    server.close(() => resolve(selected))
  })
})
const directory = await mkdtemp(path.join(os.tmpdir(), 'partycrm-ticket-channels-'))
const binary = process.env.MONGOD_BINARY || (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe' : 'mongod')
const child = spawn(binary, ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'partycrm_channels_test', '--logpath', path.join(directory, 'mongod.log')], { windowsHide: true, stdio: 'ignore' })
let startError, connection, passed = 0
child.once('error', (error) => { startError = error })
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const check = async (name, work) => { await work(); passed++; console.log(`PASS ${name}`) }

try {
  const uri = `mongodb://127.0.0.1:${port}/partycrm_channels_test?directConnection=true`
  for (let attempt = 0; attempt < 80; attempt++) {
    if (startError) throw startError
    try {
      connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 300 }).asPromise()
      break
    } catch { await delay(200) }
  }
  if (!connection) throw Error('Temporary mongod did not become ready')
  await connection.db.admin().command({ replSetInitiate: { _id: 'partycrm_channels_test', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } })
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await connection.db.admin().command({ hello: 1 })).isWritablePrimary) break
    if (attempt === 99) throw Error('No primary')
    await delay(200)
  }
  const loadModels = await compile('../server/partyTicketModels.js', {
    PRODUCTS: { PARTYCRM: 'partycrm' }, ...schemas, partyTicketChannelRecordSchema,
    getProductModel: async ({ name, collectionName, schemaDefinition, schemaOptions, configureSchema }) => {
      if (connection.models[name]) return connection.models[name]
      const schema = new Schema(schemaDefinition, schemaOptions)
      configureSchema?.(schema)
      return connection.model(name, schema, collectionName)
    },
  }, 'loadPartyTicketModels')
  const models = await loadModels()
  await Promise.all(Object.values(models).map((model) => model.init()))
  const Locations = connection.model('ChannelTestLocation', new Schema({ tenantId: Schema.Types.ObjectId, title: String, status: String, capacity: Number }))
  const Clients = connection.model('ChannelTestClient', new Schema({ tenantId: Schema.Types.ObjectId, status: String }))
  const tenantId = String(new Types.ObjectId()), actorId = String(new Types.ObjectId()), locationId = String(new Types.ObjectId())
  const context = { tenantId, role: 'owner', staff: { _id: actorId, tenantId, role: 'owner', status: 'active' }, company: { settings: { modules: { ticketing: { enabled: true } } } } }
  await Locations.create({ _id: locationId, tenantId, title: 'Тестовый зал', status: 'active', capacity: 100 })
  const { createPartyTicketChannels } = await compile('../server/partyTicketChannels.js', { Types, canPartyAccess, ...core, ...channelHelpers }, '{createPartyTicketChannels}')
  const { createPartyTicketingService } = await compile('../server/partyTicketing.js', {
    Types, createHash, ...core, canPartyAccess, isPartyTicketingEnabled, createPartyTicketChannels,
    loadPartyTicketModels: loadModels,
    getPartyLocationModel: async () => Locations,
    getPartyClientModel: async () => Clients,
    withPartyVenueMutation: async ({ session, work }) => work({ session }),
    reservePartyVenue: async () => {},
    assertPartyVenueEntryAllowed: async () => {},
  }, '{createPartyTicketingService}')
  const service = createPartyTicketingService({ now: () => new Date('2030-01-01T12:00:00Z') })
  const run = (action, payload, key = randomUUID(), actor = context) => service.mutate(actor, { action, payload, requestKey: key })
  const program = (await run('program.create', { title: 'Программа', admission: 'session', source: 'internal', unitPriceKopecks: 100000, locationId })).data
  const event = (await run('session.create', { programId: program._id, locationId, capacity: 100, startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z' })).data
  const input = { sessionId: event._id, occurredAt: '2030-01-01T09:00:00Z' }
  const readSummary = (extra = '') => service.read(context, new URLSearchParams(`section=channelSummary&sessionId=${event._id}${extra}`))
  let partnerSale

  await check('real aggregation separates paid sales, refunds and unpaid reservations (61 / 72080)', async () => {
    // A CRM issue uses the live server time to reject past sessions, so insert
    // synthetic historical sales directly to exercise the production pipelines.
    const base = { tenantId, sessionId: event._id, programId: program._id, locationId, programTitle: 'Программа', admission: 'session', createdByStaffId: actorId }
    await models.Sales.create([
      { ...base, quantity: 12, totalAmountKopecks: 1200000, paidAmountKopecks: 1200000, canceledValueKopecks: 200000, refundedQuantity: 2, refundedAmountKopecks: 200000 },
      { ...base, quantity: 3, totalAmountKopecks: 300000 },
      { ...base, quantity: 4, totalAmountKopecks: 400000, paidAmountKopecks: 100000 },
    ])
    await run('channel.record', { ...input, kind: 'sale', channelTitle: 'Партнёр А', quantity: 30, amountKopecks: 3600000 })
    partnerSale = (await run('channel.record', { ...input, kind: 'sale', channelTitle: 'Партнёр Б', quantity: 22, amountKopecks: 2708000, externalReference: 'batch-1' })).data
    await run('channel.record', { ...input, kind: 'refund', saleRecordId: partnerSale._id, quantity: 1, amountKopecks: 100000 })
    const { data } = await readSummary()
    assert.equal(data.totals.netQuantity, 61)
    assert.equal(data.totals.netAmountKopecks, 7208000)
    assert.equal(data.unpaidQuantity, 7)
    assert.equal(data.channels[0].cashRefundedAmountKopecks, 200000)
    assert.equal(await models.Ledger.countDocuments({ tenantId }), 0)
    assert.equal((await models.Sessions.findById(event._id).lean()).soldCount, 0)
  })

  await check('concurrent replay writes exactly one manual record', async () => {
    const payload = { ...input, kind: 'sale', channelTitle: 'Тест', quantity: 2, amountKopecks: 2000 }
    const key = randomUUID()
    const results = await Promise.all([run('channel.record', payload, key), run('channel.record', payload, key)])
    assert.equal(results[0].data._id, results[1].data._id)
    assert.equal(results.filter((row) => row.operation.replayed).length, 1)
    await assert.rejects(run('channel.record', { ...payload, quantity: 3 }, key), { code: 'partycrm_ticketing_idempotency_conflict' })
  })

  await check('external operation references stay unique across staff and normalized channel labels', async () => {
    const colleague = { ...context, staff: { ...context.staff, _id: String(new Types.ObjectId()) } }
    await assert.rejects(run('channel.record', { ...input, kind: 'sale', channelTitle: 'партнёр   б', quantity: 1, amountKopecks: 1, externalReference: 'batch-1' }, randomUUID(), colleague), { code: 'partycrm_ticketing_channel_duplicate' })
    const record = await models.ChannelRecords.findById(partnerSale._id).lean()
    await assert.rejects(models.ChannelRecords.create({ ...record, _id: new Types.ObjectId(), operationId: new Types.ObjectId() }), { code: 11000 })
  })

  await check('insertion failure rolls back the refund counters and the actual Mongo insert', async () => {
    const originalCreate = models.ChannelRecords.create
    models.ChannelRecords.create = async function (...args) {
      await originalCreate.apply(this, args)
      throw new Error('Injected after insert')
    }
    try {
      await assert.rejects(run('channel.record', { ...input, kind: 'refund', saleRecordId: partnerSale._id, quantity: 2, amountKopecks: 200000 }), /Injected after insert/)
    } finally { models.ChannelRecords.create = originalCreate }
    const sale = await models.ChannelRecords.findById(partnerSale._id).lean()
    assert.equal(sale.refundedQuantity, 1)
    assert.equal(sale.refundedAmountKopecks, 100000)
    assert.equal(await models.ChannelRecords.countDocuments({ saleRecordId: partnerSale._id }), 1)
  })

  await check('concurrent different refunds never exceed the original record', async () => {
    const payload = { ...input, kind: 'refund', saleRecordId: partnerSale._id, quantity: 15, amountKopecks: 1000000 }
    const results = await Promise.allSettled([run('channel.record', payload), run('channel.record', payload)])
    assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
    assert.equal(results.find((row) => row.status === 'rejected').reason.code, 'partycrm_ticketing_channel_refund_exceeded')
  })

  await check('the session and original sale cannot cross tenant or location scope', async () => {
    const foreignTenantId = String(new Types.ObjectId())
    const foreign = { ...context, tenantId: foreignTenantId, staff: { ...context.staff, tenantId: foreignTenantId } }
    await assert.rejects(service.read(foreign, new URLSearchParams(`section=channelSummary&sessionId=${event._id}`)), { status: 404 })
    const positionId = String(new Types.ObjectId())
    const scoped = {
      ...context, role: 'performer',
      staff: { ...context.staff, role: 'performer', positionId },
      position: { _id: positionId, tenantId, active: true, permissions: { tickets: 'read', 'tickets.finance': 'read' }, orderScope: { locationIds: [String(new Types.ObjectId())] } },
    }
    await assert.rejects(service.read(scoped, new URLSearchParams(`section=channelSummary&sessionId=${event._id}`)), { status: 404 })
    await assert.rejects(run('channel.record', { ...input, kind: 'refund', saleRecordId: partnerSale._id, quantity: 1, amountKopecks: 1 }, randomUUID(), foreign), { status: 404 })
    scoped.position.orderScope.locationIds = [locationId]
    const original = await models.ChannelRecords.findById(partnerSale._id).lean()
    await models.ChannelRecords.create({ ...original, _id: new Types.ObjectId(), operationId: new Types.ObjectId(), locationId: new Types.ObjectId(), sessionId: new Types.ObjectId(), channelKey: 'fixture-hidden-location', channelTitle: 'Чужой канал' })
    const { data } = await service.read(scoped, new URLSearchParams(`section=channelSummary&sessionId=${event._id}`))
    assert.ok(data.suggestedChannels.some(({ channelTitle }) => channelTitle === 'Партнёр Б'))
    assert.ok(data.suggestedChannels.every(({ channelTitle }) => channelTitle !== 'Чужой канал'))
  })

  await check('Mongo cursor paging preserves full session totals', async () => {
    for (let index = 0; index < 42; index++) await run('channel.record', { ...input, kind: 'sale', channelTitle: 'Тест страниц', quantity: 1, amountKopecks: 1 })
    const first = (await readSummary()).data
    const next = (await readSummary(`&cursor=${first.meta.nextCursor}`)).data
    assert.equal(first.records.length, 40)
    assert.ok(next.records.length > 0)
    assert.equal(next.totals.netQuantity, first.totals.netQuantity)
    assert.equal(new Set([...first.records, ...next.records].map((row) => row._id)).size, first.records.length + next.records.length)
  })

  console.log(`${passed}/${passed} isolated Mongo channel checks passed`)
} finally {
  await connection?.close()
  if (child.exitCode === null && !startError) {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
  }
}
