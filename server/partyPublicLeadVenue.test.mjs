import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import * as core from './partyPublicLeadCore.js'

const source = (
  await readFile(
    new URL('./partyPublicLeadService.js', import.meta.url),
    'utf8'
  )
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(/^export /gm, '')
const tenantId = 'a'.repeat(24),
  locationId = 'b'.repeat(24),
  clientId = 'c'.repeat(24)
const query = (rows) => ({
  select() {
    return this
  },
  lean: async () => rows,
})

function setup(failBooking = false) {
  const events = [],
    orders = [],
    session = { name: 'lead-transaction' }
  let received
  const deps = {
    ...core,
    getPartyClientModel: async () => ({
      findOne: async () => ({
        _id: clientId,
        firstName: 'Клиент',
        phone: '79130000000',
        leadSource: 'Сайт',
      }),
    }),
    getPartyOrderModel: async () => ({
      create: async (rows, options) => {
        if (options) {
          assert.equal(options.session, session)
          assert.ok(Array.isArray(rows))
        }
        const order = {
          _id: 'd'.repeat(24),
          ...(Array.isArray(rows) ? rows[0] : rows),
        }
        orders.push(order)
        events.push('order')
        return Array.isArray(rows) ? [order] : order
      },
    }),
    getPartyLocationModel: async () => ({
      find: (filter) => {
        assert.equal(String(filter.tenantId), tenantId)
        return query([{ _id: locationId, title: 'Зал', status: 'active' }])
      },
    }),
    getPartyServiceModel: async () => ({ find: () => query([]) }),
    withPartyOrderVenueWrite: async (args) => {
      received = args
      if (!args.nextOrder.eventDate) {
        const result = await args.work({ session: null, legacy: true })
        events.push('inquiry-saved')
        return result
      }
      events.push('venue-lock')
      const result = await args.work({ session, legacy: false })
      if (failBooking) {
        orders.length = 0
        events.push('rollback')
        throw typeof failBooking === 'object'
          ? failBooking
          : Object.assign(new Error('Площадка занята'), {
              status: 409,
              code: 'partycrm_venue_conflict',
            })
      }
      events.push('commit')
      return result
    },
    syncPartyOrderInventory: async () => {
      assert.ok(events.includes('commit') || events.includes('inquiry-saved'))
      events.push('inventory')
    },
    sendPartyOrderScopedPush: async () => {
      assert.ok(events.includes('commit') || events.includes('inquiry-saved'))
      events.push('push')
    },
  }
  const create = compileFunction(
    `${source}\nreturn createPartyPublicLeadOrder`,
    Object.keys(deps)
  )(...Object.values(deps))
  const run = () =>
    create({
      company: {
        _id: tenantId,
        settings: { notifications: { pushEnabled: true } },
      },
      normalized: core.normalizePartyPublicLeadPayload({
        clientName: 'Клиент',
        phone: '79130000000',
        source: 'Сайт',
        serviceTitle: 'Праздник',
        comment: 'Исходный комментарий',
        locationId,
        eventDate: '2026-12-01T10:00:00Z',
        dateEnd: '2026-12-01T11:00:00Z',
      }),
      rawPayload: { requestMarker: 'original-request' },
    })
  return { run, events, orders, received: () => received }
}

test('dated public lead is created under the venue writer; inventory and push follow commit', async () => {
  const h = setup()
  const result = await h.run()
  assert.equal(result.order.status, 'draft')
  assert.equal(String(h.received().tenantId), tenantId)
  assert.equal(String(h.received().nextOrder.locationId), locationId)
  assert.deepEqual(h.events, [
    'venue-lock',
    'order',
    'commit',
    'inventory',
    'push',
  ])
})

test('an occupied requested interval becomes one unreserved inquiry with original timing, client, and services intact', async () => {
  const h = setup(true)
  const result = await h.run()
  assert.equal(h.orders.length, 1)
  assert.equal(result.bookingNeedsReview, true)
  assert.equal(result.order.eventDate, null)
  assert.equal(result.order.dateEnd, null)
  assert.equal(result.order.status, 'draft')
  assert.equal(result.order.clientId, clientId)
  assert.equal(result.order.locationId, locationId)
  assert.equal(result.order.serviceTitle, 'Праздник')
  assert.equal(
    new Date(result.order.leadMeta.requestedBooking.eventDate).toISOString(),
    '2026-12-01T10:00:00.000Z'
  )
  assert.equal(
    new Date(result.order.leadMeta.requestedBooking.dateEnd).toISOString(),
    '2026-12-01T11:00:00.000Z'
  )
  assert.equal(result.order.leadMeta.requestedBooking.locationId, locationId)
  assert.equal(result.order.leadMeta.requestedBooking.reason, 'occupied')
  assert.equal(
    result.order.leadMeta.requestedBooking.originalAdminComment,
    'Исходный комментарий'
  )
  assert.equal(result.order.leadMeta.raw.requestMarker, 'original-request')
  assert.match(result.order.adminComment, /Помещение занято/)
  assert.match(result.order.adminComment, /Время не забронировано/)
  assert.deepEqual(h.events, [
    'venue-lock',
    'order',
    'rollback',
    'order',
    'inquiry-saved',
    'inventory',
    'push',
  ])
})

test('known booking infrastructure failure saves an inquiry with a technical reason; unknown failures are not called occupancy', async () => {
  const h = setup(
    Object.assign(new Error('No transactions'), {
      status: 503,
      code: 'partycrm_venue_transaction_required',
    })
  )
  const result = await h.run()
  assert.equal(
    result.order.leadMeta.requestedBooking.reason,
    'storage_unavailable'
  )
  assert.doesNotMatch(result.order.adminComment, /Помещение занято/)
  const unknown = setup(
    Object.assign(new Error('Invalid reference'), {
      status: 400,
      code: 'invalid_reference',
    })
  )
  await assert.rejects(unknown.run(), { code: 'invalid_reference' })
  assert.equal(unknown.orders.length, 0)
})

test('public API and Tilda explicitly report an unreserved inquiry requiring booking review', async () => {
  for (const routePath of [
    '../app/api/party/public/lead/route.js',
    '../app/api/party/public/lead/tilda/route.js',
  ]) {
    const code = (await readFile(new URL(routePath, import.meta.url), 'utf8'))
      .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
      .replace(/^export /gm, '')
    const deps = {
      NextResponse: {
        json: (body, options) => ({ status: options.status, body }),
      },
      getPartyPublicLeadApiKey: () => 'allowed-key',
      normalizePartyPublicLeadPayload: () => ({ clientName: 'Клиент' }),
      normalizePartyTildaLeadPayload: () => ({ clientName: 'Клиент' }),
      resolvePartyPublicLeadCompany: async () => ({
        ok: true,
        company: { _id: tenantId },
      }),
      createPartyPublicLeadOrder: async () => ({
        client: { _id: clientId },
        order: { _id: 'd'.repeat(24), status: 'draft' },
        bookingNeedsReview: true,
      }),
    }
    const POST = compileFunction(
      `${code}\nreturn POST`,
      Object.keys(deps)
    )(...Object.values(deps))
    const response = await POST({
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    })
    assert.equal(response.status, 201)
    assert.equal(response.body.data.bookingNeedsReview, true)
    assert.equal(response.body.data.status, 'draft')
  }
})
