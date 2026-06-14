import assert from 'node:assert/strict'
import test from 'node:test'

import { syncPartyOrderToCompanyCalendar } from './partyGoogleCalendarSync.js'

const settings = {
  enabled: true,
  accessToken: 'access',
  refreshToken: 'refresh',
  calendarId: 'calendar-1',
  deleteCanceledFromCalendar: false,
  syncSettings: { showAdditionalEvents: true },
}

const company = { _id: 'company-1', settings: { googleCalendar: settings } }
const order = {
  _id: 'order-1',
  status: 'active',
  eventDate: '2026-07-01T10:00:00.000Z',
  googleCalendarEventId: '',
  googleCalendarCalendarId: '',
  additionalEvents: [
    {
      _id: 'additional-1',
      title: 'Call',
      date: '2026-06-30T10:00:00.000Z',
      done: false,
      googleCalendarEventId: '',
    },
  ],
}

const createHarness = ({ clientOverrides = {}, payloadOverrides = {} } = {}) => {
  const calls = []
  const persisted = []
  const companyStates = []
  let nextId = 1
  const client = {
    async insertEvent(calendarId, payload) {
      calls.push(['insert', calendarId, payload])
      return { id: `created-${nextId++}` }
    },
    async updateEvent(calendarId, eventId, payload) {
      calls.push(['update', calendarId, eventId, payload])
      return { id: eventId }
    },
    async deleteEvent(calendarId, eventId) {
      calls.push(['delete', calendarId, eventId])
      return {}
    },
    async flushCredentialsUpdates() {
      calls.push(['flush'])
    },
    ...clientOverrides,
  }
  const dependencies = {
    client,
    now: () => new Date('2026-06-14T12:00:00.000Z'),
    buildOrderPayload: ({ order: current }) =>
      Object.hasOwn(payloadOverrides, 'main')
        ? payloadOverrides.main
        : { summary: `Order ${current._id}` },
    buildAdditionalPayload: ({ item }) =>
      Object.hasOwn(payloadOverrides, 'additional')
        ? payloadOverrides.additional
        : { summary: item.title },
    async persistOrderPatch({ orderId, companyId, patch }) {
      persisted.push({ orderId, companyId, patch })
    },
    async persistCompanySyncState({ companyId, lastSyncAt, lastSyncError }) {
      companyStates.push({ companyId, lastSyncAt, lastSyncError })
    },
  }
  return { calls, persisted, companyStates, dependencies }
}

test('unavailable integration records calendar_sync_unavailable without Google calls', async () => {
  const { calls, persisted, dependencies } = createHarness()
  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: false },
    dependencies,
  })

  assert.deepEqual(calls, [])
  assert.equal(result.ok, false)
  assert.equal(result.status, 'unavailable')
  assert.equal(result.orderPatch.calendarSyncError, 'calendar_sync_unavailable')
  assert.equal(persisted.length, 1)
})

test('inserts main and additional events and stores identifiers', async () => {
  const { calls, persisted, dependencies } = createHarness()
  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.map((call) => call[0]), ['insert', 'insert', 'flush'])
  assert.equal(result.ok, true)
  assert.equal(result.status, 'synced')
  assert.equal(result.orderPatch.googleCalendarEventId, 'created-1')
  assert.equal(result.orderPatch.googleCalendarCalendarId, 'calendar-1')
  assert.equal(result.orderPatch.additionalEvents[0].googleCalendarEventId, 'created-2')
  assert.equal(result.orderPatch.calendarSyncError, '')
  assert.equal(result.orderPatch.calendarSyncedAt.toISOString(), '2026-06-14T12:00:00.000Z')
  assert.deepEqual(persisted[0].patch, result.orderPatch)
})

test('updates existing main and additional events', async () => {
  const current = {
    ...order,
    googleCalendarEventId: 'main-event',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [
      { ...order.additionalEvents[0], googleCalendarEventId: 'additional-event' },
    ],
  }
  const { calls, dependencies } = createHarness()

  await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.slice(0, 2).map((call) => call.slice(0, 3)), [
    ['update', 'calendar-1', 'main-event'],
    ['update', 'calendar-1', 'additional-event'],
  ])
})

test('recreates an event when Google update reports 404', async () => {
  const missing = Object.assign(new Error('missing'), { code: 'event_missing', status: 404 })
  const { calls, dependencies } = createHarness({
    clientOverrides: {
      async updateEvent(calendarId, eventId) {
        calls.push(['update', calendarId, eventId])
        throw missing
      },
    },
  })
  const current = {
    ...order,
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [],
  }

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.map((call) => call[0]), ['update', 'insert', 'flush'])
  assert.equal(result.orderPatch.googleCalendarEventId, 'created-1')
})

test('calendar switch creates events in the selected calendar and removes old ones', async () => {
  const current = {
    ...order,
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'old-calendar',
    additionalEvents: [
      { ...order.additionalEvents[0], googleCalendarEventId: 'old-additional' },
    ],
  }
  const { calls, dependencies } = createHarness()

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ['delete', 'old-calendar', 'old-main'],
    ['delete', 'old-calendar', 'old-additional'],
    ['insert', 'calendar-1', { summary: 'Order order-1' }],
    ['insert', 'calendar-1', { summary: 'Call' }],
    ['flush'],
  ])
  assert.equal(result.orderPatch.googleCalendarCalendarId, 'calendar-1')
})

test('canceled delete mode removes main and additional events and clears identifiers', async () => {
  const canceledCompany = {
    ...company,
    settings: {
      googleCalendar: { ...settings, deleteCanceledFromCalendar: true },
    },
  }
  const current = {
    ...order,
    status: 'canceled',
    googleCalendarEventId: 'main-event',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [
      { ...order.additionalEvents[0], googleCalendarEventId: 'additional-event' },
    ],
  }
  const { calls, dependencies } = createHarness()

  const result = await syncPartyOrderToCompanyCalendar({
    company: canceledCompany,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ['delete', 'calendar-1', 'main-event'],
    ['delete', 'calendar-1', 'additional-event'],
    ['flush'],
  ])
  assert.equal(result.status, 'deleted')
  assert.equal(result.orderPatch.googleCalendarEventId, '')
  assert.equal(result.orderPatch.googleCalendarCalendarId, '')
  assert.equal(result.orderPatch.additionalEvents[0].googleCalendarEventId, '')
})

test('canceled keep mode updates main event and removes additional events', async () => {
  const current = {
    ...order,
    status: 'canceled',
    googleCalendarEventId: 'main-event',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [
      { ...order.additionalEvents[0], googleCalendarEventId: 'additional-event' },
    ],
  }
  const { calls, dependencies } = createHarness()

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ['update', 'calendar-1', 'main-event'],
    ['delete', 'calendar-1', 'additional-event'],
    ['flush'],
  ])
  assert.equal(result.orderPatch.additionalEvents[0].googleCalendarEventId, '')
})

test('deletes removed, completed and undated additional events', async () => {
  const previousOrder = {
    ...order,
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [
      { _id: 'removed', date: '2026-06-20', googleCalendarEventId: 'removed-event' },
      { _id: 'done', date: '2026-06-20', googleCalendarEventId: 'done-event' },
      { _id: 'undated', date: '2026-06-20', googleCalendarEventId: 'undated-event' },
    ],
  }
  const current = {
    ...order,
    additionalEvents: [
      { _id: 'done', date: '2026-06-20', done: true, googleCalendarEventId: 'done-event' },
      { _id: 'undated', date: null, done: false, googleCalendarEventId: 'undated-event' },
    ],
  }
  const { calls, dependencies } = createHarness()

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    previousOrder,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(
    calls.filter((call) => call[0] === 'delete').map((call) => call[2]).sort(),
    ['done-event', 'removed-event', 'undated-event']
  )
  assert.deepEqual(
    result.orderPatch.additionalEvents.map((item) => item.googleCalendarEventId),
    ['', '']
  )
})

test('disabled showAdditionalEvents clears all linked additional events', async () => {
  const disabledCompany = {
    ...company,
    settings: {
      googleCalendar: {
        ...settings,
        syncSettings: { showAdditionalEvents: false },
      },
    },
  }
  const current = {
    ...order,
    additionalEvents: [
      { ...order.additionalEvents[0], googleCalendarEventId: 'additional-event' },
    ],
  }
  const { calls, dependencies } = createHarness()

  const result = await syncPartyOrderToCompanyCalendar({
    company: disabledCompany,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(calls.some((call) => call[0] === 'insert' && call[2]?.summary === 'Call'), false)
  assert.equal(calls.some((call) => call[0] === 'delete' && call[2] === 'additional-event'), true)
  assert.equal(result.orderPatch.additionalEvents[0].googleCalendarEventId, '')
})

test('Google failures are persisted and swallowed in best-effort mode', async () => {
  const secretError = new Error('quota with private token')
  const { calls, persisted, dependencies } = createHarness({
    clientOverrides: {
      async insertEvent() {
        calls.push(['insert'])
        throw secretError
      },
    },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.orderPatch.calendarSyncError, 'calendar_sync_failed')
  assert.equal(persisted.at(-1).patch.calendarSyncError, 'calendar_sync_failed')
  assert.equal(JSON.stringify(result).includes('private token'), false)
  assert.equal(calls.at(-1)[0], 'flush')
})

test('missing deletes are ignored and credential flush failures mark sync failed', async () => {
  const missing = Object.assign(new Error('missing'), { code: 'event_missing', status: 404 })
  const current = {
    ...order,
    status: 'canceled',
    googleCalendarEventId: 'main-event',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [],
  }
  const canceledCompany = {
    ...company,
    settings: { googleCalendar: { ...settings, deleteCanceledFromCalendar: true } },
  }
  const { dependencies } = createHarness({
    clientOverrides: {
      async deleteEvent() {
        throw missing
      },
      async flushCredentialsUpdates() {
        throw new Error('save failed')
      },
    },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company: canceledCompany,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.orderPatch.calendarSyncError, 'calendar_sync_failed')
})

test('calendar switch continues creating in new calendar when old cleanup fails', async () => {
  const current = {
    ...order,
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'old-calendar',
    additionalEvents: [],
  }
  const { calls, dependencies } = createHarness({
    clientOverrides: {
      async deleteEvent(calendarId, eventId) {
        calls.push(['delete', calendarId, eventId])
        throw new Error('old calendar unavailable')
      },
    },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(result.ok, true)
  assert.equal(
    calls.some((call) => call[0] === 'insert' && call[1] === 'calendar-1'),
    true
  )
  assert.equal(result.orderPatch.googleCalendarEventId, 'created-1')
})

test('null main payload deletes old event best-effort and clears its identifiers', async () => {
  const current = {
    ...order,
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [],
  }
  const { calls, dependencies } = createHarness({
    payloadOverrides: { main: null },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ['delete', 'calendar-1', 'old-main'],
    ['flush'],
  ])
  assert.equal(result.ok, true)
  assert.equal(result.orderPatch.googleCalendarEventId, '')
  assert.equal(result.orderPatch.googleCalendarCalendarId, '')
})

test('null main payload keeps identifiers and records failure when delete returns non-404', async () => {
  const current = {
    ...order,
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [],
  }
  const { persisted, companyStates, dependencies } = createHarness({
    payloadOverrides: { main: null },
    clientOverrides: {
      async deleteEvent() {
        throw new Error('quota exceeded')
      },
    },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.orderPatch, {
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'calendar-1',
    calendarSyncError: 'calendar_sync_failed',
  })
  assert.deepEqual(persisted.at(-1).patch, result.orderPatch)
  assert.deepEqual(companyStates, [
    {
      companyId: 'company-1',
      lastSyncAt: null,
      lastSyncError: 'calendar_sync_failed',
    },
  ])
})

test('null main payload clears identifiers when delete returns 404', async () => {
  const current = {
    ...order,
    googleCalendarEventId: 'old-main',
    googleCalendarCalendarId: 'calendar-1',
    additionalEvents: [],
  }
  const missing = Object.assign(new Error('missing'), {
    code: 'event_missing',
    status: 404,
  })
  const { companyStates, dependencies } = createHarness({
    payloadOverrides: { main: null },
    clientOverrides: {
      async deleteEvent() {
        throw missing
      },
    },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: current,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(result.ok, true)
  assert.equal(result.orderPatch.googleCalendarEventId, '')
  assert.equal(result.orderPatch.googleCalendarCalendarId, '')
  assert.equal(companyStates[0].lastSyncError, '')
})

test('null main payload without old identifier does not create a Google event', async () => {
  const { calls, dependencies } = createHarness({
    payloadOverrides: { main: null },
  })

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order: { ...order, additionalEvents: [] },
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(calls.some((call) => ['insert', 'update', 'delete'].includes(call[0])), false)
  assert.equal(result.orderPatch.googleCalendarEventId, '')
  assert.equal(result.orderPatch.googleCalendarCalendarId, '')
})

test('database persistence failure in error path is swallowed', async () => {
  const { dependencies } = createHarness({
    clientOverrides: {
      async insertEvent() {
        throw new Error('google failed')
      },
    },
  })
  dependencies.persistOrderPatch = async () => {
    throw new Error('database failed')
  }

  const result = await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: true },
    dependencies,
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.orderPatch.calendarSyncError, 'calendar_sync_failed')
})

test('persists company sync state for success, unavailable and failure outcomes', async () => {
  const success = createHarness()
  await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: true },
    dependencies: success.dependencies,
  })
  assert.deepEqual(success.companyStates, [
    {
      companyId: 'company-1',
      lastSyncAt: new Date('2026-06-14T12:00:00.000Z'),
      lastSyncError: '',
    },
  ])

  const unavailable = createHarness()
  await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: false },
    dependencies: unavailable.dependencies,
  })
  assert.deepEqual(unavailable.companyStates, [
    {
      companyId: 'company-1',
      lastSyncAt: null,
      lastSyncError: 'calendar_sync_unavailable',
    },
  ])

  const failed = createHarness({
    clientOverrides: {
      async insertEvent() {
        throw new Error('google failed')
      },
    },
  })
  await syncPartyOrderToCompanyCalendar({
    company,
    order,
    access: { allowCalendarSync: true },
    dependencies: failed.dependencies,
  })
  assert.deepEqual(failed.companyStates, [
    {
      companyId: 'company-1',
      lastSyncAt: null,
      lastSyncError: 'calendar_sync_failed',
    },
  ])
})
