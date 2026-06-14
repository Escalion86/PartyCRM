import assert from 'node:assert/strict'
import test from 'node:test'

import { syncFuturePartyOrdersBatch } from './partyGoogleCalendarBatch.js'

const orders = (...ids) => ids.map((id) => ({ _id: id, eventDate: new Date('2026-06-15T12:00:00.000Z') }))

test('builds a tenant future filter with a stable _id cursor and caps the batch at 20', async () => {
  let query
  const result = await syncFuturePartyOrdersBatch({
    company: { _id: 'company-1', settings: { timeZone: 'Asia/Krasnoyarsk' } },
    access: { allowCalendarSync: true },
    cursor: 'order-10',
    limit: 200,
    dependencies: {
      now: () => new Date('2026-06-14T15:30:00.000Z'),
      findOrders: async (value) => {
        query = value
        return orders(...Array.from({ length: 21 }, (_, index) => `order-${index + 11}`))
      },
      syncOrder: async () => ({ ok: true, status: 'synced' }),
    },
  })

  assert.equal(query.companyId, 'company-1')
  assert.equal(query.cursor, 'order-10')
  assert.equal(query.limit, 21)
  assert.equal(query.eventDateFrom.toISOString(), '2026-06-13T17:00:00.000Z')
  assert.equal(result.processed, 20)
  assert.equal(result.synced, 20)
  assert.equal(result.success, 20)
  assert.equal(result.nextCursor, 'order-30')
  assert.equal(result.done, false)
})

test('does not add a status restriction and includes current-day orders', async () => {
  let query
  await syncFuturePartyOrdersBatch({
    company: { id: 'company-2', settings: { timeZone: 'Europe/Moscow' } },
    access: { allowCalendarSync: true },
    dependencies: {
      now: () => new Date('2026-06-14T08:00:00.000Z'),
      findOrders: async (value) => {
        query = value
        return []
      },
      syncOrder: async () => ({ ok: true }),
    },
  })

  assert.equal(Object.hasOwn(query, 'status'), false)
  assert.equal(query.eventDateFrom.toISOString(), '2026-06-13T21:00:00.000Z')
})

test('isolates failures and returns safe success, failed and skipped counts', async () => {
  const result = await syncFuturePartyOrdersBatch({
    company: { _id: 'company-3' },
    access: { allowCalendarSync: true },
    dependencies: {
      findOrders: async () => orders('ok', 'failed', 'thrown', 'skipped'),
      syncOrder: async ({ order }) => {
        if (order._id === 'failed') return { ok: false, status: 'failed' }
        if (order._id === 'thrown') throw new Error('client name and token must not leak')
        if (order._id === 'skipped') return { ok: false, status: 'unavailable' }
        return { ok: true, status: 'synced' }
      },
    },
  })

  assert.deepEqual(result, {
    processed: 4,
    synced: 1,
    success: 1,
    failed: 2,
    skipped: 1,
    nextCursor: null,
    done: true,
    errors: [
      { orderId: 'failed', code: 'calendar_sync_failed' },
      { orderId: 'thrown', code: 'calendar_sync_failed' },
    ],
  })
  assert.equal(JSON.stringify(result).includes('client name'), false)
})

test('returns a deterministic empty result and does not call sync without orders', async () => {
  let calls = 0
  const input = {
    company: { _id: 'company-4' },
    access: { allowCalendarSync: true },
    cursor: 'last-order',
    dependencies: {
      findOrders: async () => [],
      syncOrder: async () => { calls += 1 },
    },
  }

  assert.deepEqual(await syncFuturePartyOrdersBatch(input), await syncFuturePartyOrdersBatch(input))
  assert.equal(calls, 0)
})

test('rejects use without company tariff access before querying orders', async () => {
  let queried = false
  await assert.rejects(
    syncFuturePartyOrdersBatch({
      company: { _id: 'company-5' },
      access: { allowCalendarSync: false },
      dependencies: { findOrders: async () => { queried = true; return [] } },
    }),
    (error) => error?.code === 'party_calendar_tariff_required'
  )
  assert.equal(queried, false)
})
