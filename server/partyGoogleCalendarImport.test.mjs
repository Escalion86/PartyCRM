import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPartyGoogleCalendarImportOrders,
  parsePartyGoogleImportEventIds,
  parsePartyGoogleImportRange,
  readPartyGoogleCalendarImport,
  serializePartyGoogleCalendarImportCandidate,
} from './partyGoogleCalendarImport.js'

const tenantId = 'ff1111111111111111111111'
const calendarId = 'working-calendar'
const linkedOrderId = 'ff2222222222222222222222'
const timeZone = 'Asia/Krasnoyarsk'
const range = { timeMin: '2026-11-27T17:00:00.000Z', timeMax: '2026-11-28T17:00:00.000Z' }
const now = new Date('2026-11-28T09:00:00.000Z')

const event = (id, patch = {}) => ({
  id,
  summary: 'Игра',
  start: { dateTime: '2026-11-28T12:00:00+07:00' },
  end: { dateTime: '2026-11-28T13:15:00+07:00' },
  ...patch,
})

const createImportFixture = ({ pages, existing = [], eventIds, updateOne }) => {
  const selectedPages = [...pages]
  const reads = []
  const filters = []
  const client = {
    async listEvents(selectedCalendarId, options) {
      assert.equal(selectedCalendarId, calendarId)
      reads.push(options)
      return selectedPages.shift()
    },
    async flushCredentialsUpdates() {},
  }
  const orderModel = {
    find(filter) {
      filters.push(filter)
      return { select: () => ({ lean: async () => existing }) }
    },
    async init() {},
    updateOne,
  }
  return {
    orderModel,
    reads,
    filters,
    read: () => readPartyGoogleCalendarImport({ client, calendarId, range, timeZone, tenantId, orderModel, eventIds }),
  }
}

test('parses inclusive company-local dates, rejects invalid ranges and bounds the selection', () => {
  assert.deepEqual(parsePartyGoogleImportRange({ from: '2026-11-28', to: '2026-11-28' }, timeZone), range)
  assert.deepEqual(parsePartyGoogleImportRange({ from: '2026-03-08', to: '2026-03-08' }, 'America/New_York'), {
    timeMin: '2026-03-08T05:00:00.000Z',
    timeMax: '2026-03-09T04:00:00.000Z',
  })
  for (const [from, to] of [
    ['2026-02-30', '2026-03-01'],
    ['2026-02-20', '2026-02-19'],
    ['2025-02-20', '2026-11-30'],
  ]) {
    assert.throws(() => parsePartyGoogleImportRange({ from, to }, timeZone), { code: 'party_calendar_invalid_import_range' })
  }
  assert.deepEqual(parsePartyGoogleImportEventIds(['foo', 'bar_20261128T090000Z', 'foo']), ['foo', 'bar_20261128T090000Z'])
  assert.throws(() => parsePartyGoogleImportEventIds(Array(101).fill('foo')), { code: 'party_calendar_invalid_import_selection' })
  assert.throws(() => parsePartyGoogleImportEventIds([{ $ne: 'foo' }]), { code: 'party_calendar_invalid_import_selection' })
})

test('reads all pages, reconciles legacy links and own events without exposing their private fields', async () => {
  const { read, reads, filters } = createImportFixture({
    pages: [
      {
        timeZone: 'America/New_York',
        nextPageToken: 'page-2',
        items: [
          event('linked'),
          event('reminder'),
          event('original', { extendedProperties: { private: { partycrmOrderId: linkedOrderId, partycrmTenantId: tenantId } } }),
          event('canceled', { status: 'cancelled' }),
        ],
      },
      {
        items: [
          event('all-day', {
            start: { date: '2026-03-08' },
            end: { date: '2026-03-09' },
            description: 'Текст для черновика',
            attendees: [{ email: 'guest@example.com' }],
          }),
          event('other-calendar'),
          event('unsupported', { eventType: 'birthday' }),
          event('bad-date', { end: {} }),
        ],
      },
    ],
    existing: [
      { _id: linkedOrderId, googleCalendarEventId: 'linked', additionalEvents: [{ googleCalendarEventId: 'reminder' }] },
      { googleCalendarEventId: 'other-calendar', googleCalendarCalendarId: 'another-calendar' },
    ],
  })
  const preview = (await read()).map(serializePartyGoogleCalendarImportCandidate)
  assert.deepEqual(reads, [{ ...range, pageToken: undefined }, { ...range, pageToken: 'page-2' }])
  assert.equal(filters[0].tenantId, tenantId)
  assert.equal(preview.some((item) => item.id === 'canceled'), false)
  assert.deepEqual(preview.slice(0, 3).map((item) => item.reason), Array(3).fill('already_imported'))
  assert.deepEqual(preview.slice(3).map((item) => item.reason), [undefined, undefined, 'unsupported_type', 'invalid_dates'])
  assert.deepEqual(preview[3], {
    id: 'all-day',
    title: 'Игра',
    location: '',
    startsAt: '2026-03-08T05:00:00.000Z',
    endsAt: '2026-03-09T04:00:00.000Z',
    allDay: true,
    startDay: '2026-03-08',
    endDay: '2026-03-09',
    alreadyImported: false,
    eligible: true,
  })
})

test('imports only selected drafts, retaining Google links and handling concurrent retries', async () => {
  const stored = new Map()
  const eventIds = ['imported', 'vanished']
  const { read, orderModel } = createImportFixture({
    eventIds,
    pages: [{ items: [
      event('imported', {
        description: '<p>Взять реквизит</p><script>secret()</script><p>Уточнить &amp; подтвердить</p>',
        location: 'Улица Дружбы, 3',
        htmlLink: 'https://www.google.com/calendar/event?eid=RXZlbnQ&extra=1#old',
        attendees: [{ email: 'guest@example.com' }],
        guestsCanInviteOthers: false,
      }),
      event('not-selected'),
    ] }],
    async updateOne(filter, update, options) {
      assert.equal(filter.tenantId, tenantId)
      assert.deepEqual(options, { upsert: true, runValidators: true, timestamps: false })
      if (stored.has(filter.googleCalendarImportKey)) {
        throw Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { googleCalendarImportKey: 1 } })
      }
      stored.set(filter.googleCalendarImportKey, update.$setOnInsert)
      return { upsertedCount: 1 }
    },
  })
  const candidates = await read()
  const importOrders = () => createPartyGoogleCalendarImportOrders({
    orderModel, tenantId, calendarId, eventIds, workflowStageId: 'intake', candidates, now,
  })
  const results = await Promise.all([importOrders(), importOrders()])
  assert.deepEqual(results.map((result) => result.imported), [1, 0])
  assert.deepEqual(results.map((result) => result.skipped), [1, 2])
  assert.equal(results[1].items[0].reason, 'already_imported')
  assert.equal(results[0].items[1].reason, 'unavailable')
  const [order] = stored.values()
  assert.deepEqual(order, {
    tenantId,
    googleCalendarImportKey: candidates[0].key,
    googleCalendarEventId: 'imported',
    googleCalendarCalendarId: calendarId,
    googleCalendarEventUrl: 'https://www.google.com/calendar/event?eid=RXZlbnQ',
    calendarImportedAt: now,
    calendarImportChecked: false,
    googleCalendarSyncDisabled: true,
    title: 'Игра',
    status: 'draft',
    workflowStageId: 'intake',
    eventDate: new Date('2026-11-28T05:00:00.000Z'),
    dateEnd: new Date('2026-11-28T06:15:00.000Z'),
    durationMinutes: 75,
    placeType: 'client_address',
    customAddress: 'Улица Дружбы, 3',
    adminComment: 'Взять реквизит\nУточнить & подтвердить',
    createdAt: now,
    updatedAt: now,
  })
})

test('rejects an oversized preview instead of returning an incomplete calendar', async () => {
  const { read } = createImportFixture({
    pages: [{ items: Array.from({ length: 1001 }, (_, index) => event(String(index))) }],
  })
  await assert.rejects(read, { code: 'party_calendar_import_range_too_busy' })
})
