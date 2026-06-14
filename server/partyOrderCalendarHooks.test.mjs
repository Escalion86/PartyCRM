import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deletePartyOrderCalendarEventsAfterCrud,
  syncPartyOrderCalendarAfterCrud,
} from './partyOrderCalendarHooks.js'

const query = (value, calls, filter) => ({
  lean: async () => {
    calls.push(filter)
    return value
  },
})

test('sync hook loads tenant-safe context and invokes sync engine', async () => {
  const tenantId = 'company-1'
  const order = {
    _id: 'order-1',
    tenantId,
    locationId: 'location-1',
    servicesIds: ['service-1'],
    assignedStaff: [{ staffId: 'staff-1' }],
  }
  const calls = { companies: [], orders: [], locations: [], services: [], staff: [], transactions: [] }
  let syncInput
  const result = await syncPartyOrderCalendarAfterCrud({
    tenantId,
    orderId: order._id,
    previousOrder: { ...order, title: 'before' },
    dependencies: {
      models: {
        Company: { findOne: (filter) => query({ _id: tenantId, settings: {} }, calls.companies, filter) },
        Order: { findOne: (filter) => query(order, calls.orders, filter) },
        Location: { findOne: (filter) => query({ _id: 'location-1' }, calls.locations, filter) },
        Service: { find: (filter) => query([{ _id: 'service-1' }], calls.services, filter) },
        Staff: { find: (filter) => query([{ _id: 'staff-1' }], calls.staff, filter) },
        Transaction: { find: (filter) => query([{ _id: 'tx-1' }], calls.transactions, filter) },
      },
      getAccess: async () => ({ allowCalendarSync: true }),
      createClient: () => ({ insertEvent() {} }),
      syncOrder: async (input) => {
        syncInput = input
        return { ok: true }
      },
      persistOrderPatch: async () => {},
      persistCompanySyncState: async () => {},
      domain: 'https://party.example',
    },
  })

  assert.deepEqual(result, { ok: true })
  for (const filters of Object.values(calls)) {
    assert.equal(filters.length, 1)
    assert.equal(String(filters[0].tenantId), tenantId)
  }
  assert.equal(syncInput.order, order)
  assert.equal(syncInput.previousOrder.title, 'before')
  assert.deepEqual(syncInput.dependencies.services, [{ _id: 'service-1' }])
  assert.deepEqual(syncInput.dependencies.staff, [{ _id: 'staff-1' }])
  assert.deepEqual(syncInput.dependencies.transactions, [{ _id: 'tx-1' }])
})

test('sync hook is best-effort when loading or sync fails', async () => {
  const result = await syncPartyOrderCalendarAfterCrud({
    tenantId: 'company-1',
    orderId: 'order-1',
    dependencies: {
      loadModels: async () => {
        throw new Error('database unavailable')
      },
    },
  })
  assert.deepEqual(result, { ok: false, status: 'hook_failed' })
})

test('sync hook persists refreshed credentials with tenant filter', async () => {
  const updates = []
  let clientOptions
  const tenantId = 'company-1'
  const order = { _id: 'order-1', tenantId }
  await syncPartyOrderCalendarAfterCrud({
    tenantId,
    orderId: order._id,
    dependencies: {
      models: {
        Company: {
          findOne: (filter) => query({ _id: tenantId, settings: { googleCalendar: {} } }, [], filter),
          updateOne: async (...args) => updates.push(args),
        },
        Order: { findOne: (filter) => query(order, [], filter) },
        Location: { findOne: () => query(null, [], {}) },
        Service: { find: (filter) => query([], [], filter) },
        Staff: { find: (filter) => query([], [], filter) },
        Transaction: { find: (filter) => query([], [], filter) },
      },
      getAccess: async () => ({ allowCalendarSync: true }),
      createClient: (settings, options) => {
        clientOptions = options
        return {}
      },
      syncOrder: async () => ({ ok: true }),
      persistOrderPatch: async () => {},
      persistCompanySyncState: async () => {},
    },
  })

  await clientOptions.onCredentials({
    access_token: 'access-new',
    refresh_token: 'refresh-new',
    expiry_date: 123,
  })
  assert.deepEqual(updates, [[
    { _id: tenantId, tenantId },
    { $set: {
      'settings.googleCalendar.accessToken': 'access-new',
      'settings.googleCalendar.refreshToken': 'refresh-new',
      'settings.googleCalendar.expiryDate': 123,
    } },
  ]])
})

test('delete hook removes main and additional events from snapshot calendar', async () => {
  const deleted = []
  const snapshot = {
    _id: 'order-1',
    tenantId: 'company-1',
    googleCalendarCalendarId: 'calendar-old',
    googleCalendarEventId: 'main-1',
    additionalEvents: [
      { googleCalendarEventId: 'additional-1' },
      { googleCalendarEventId: '' },
    ],
  }
  const result = await deletePartyOrderCalendarEventsAfterCrud({
    tenantId: 'company-1',
    orderSnapshot: snapshot,
    dependencies: {
      loadCompany: async (filter) => {
        assert.deepEqual(filter, { _id: 'company-1', tenantId: 'company-1' })
        return { _id: 'company-1', settings: { googleCalendar: {} } }
      },
      createClient: () => ({
        deleteEvent: async (calendarId, eventId) => deleted.push([calendarId, eventId]),
        flushCredentialsUpdates: async () => {},
      }),
    },
  })

  assert.deepEqual(result, { ok: true, deletedCount: 2 })
  assert.deepEqual(deleted, [
    ['calendar-old', 'main-1'],
    ['calendar-old', 'additional-1'],
  ])
})

test('delete hook persists rotated credentials when cleanup client flushes', async () => {
  const updates = []
  let clientOptions
  const tenantId = 'company-1'
  const result = await deletePartyOrderCalendarEventsAfterCrud({
    tenantId,
    orderSnapshot: {
      _id: 'order-1',
      tenantId,
      googleCalendarCalendarId: 'calendar-1',
      googleCalendarEventId: 'main-1',
    },
    dependencies: {
      loadCompany: async () => ({
        _id: tenantId,
        settings: { googleCalendar: {} },
      }),
      persistCredentials: async (...args) => updates.push(args),
      createClient: (settings, options) => {
        clientOptions = options
        return {
          deleteEvent: async () => {},
          flushCredentialsUpdates: async () => {
            await clientOptions.onCredentials({ access_token: 'rotated-token' })
          },
        }
      },
    },
  })

  assert.deepEqual(result, { ok: true, deletedCount: 1 })
  assert.deepEqual(updates, [[{ access_token: 'rotated-token' }]])
})

test('delete hook never breaks successful database deletion on Google failure', async () => {
  const attempts = []
  const result = await deletePartyOrderCalendarEventsAfterCrud({
    tenantId: 'company-1',
    orderSnapshot: {
      _id: 'order-1',
      tenantId: 'company-1',
      googleCalendarCalendarId: 'calendar-1',
      googleCalendarEventId: 'main-1',
      additionalEvents: [{ googleCalendarEventId: 'additional-1' }],
    },
    dependencies: {
      loadCompany: async () => ({ _id: 'company-1', settings: { googleCalendar: {} } }),
      createClient: () => ({
        deleteEvent: async (calendarId, eventId) => {
          attempts.push([calendarId, eventId])
          if (eventId === 'main-1') throw new Error('google failed')
        },
      }),
    },
  })
  assert.deepEqual(result, { ok: false, status: 'hook_failed' })
  assert.deepEqual(attempts, [
    ['calendar-1', 'main-1'],
    ['calendar-1', 'additional-1'],
  ])
})
