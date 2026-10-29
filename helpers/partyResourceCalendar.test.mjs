import test from 'node:test'
import assert from 'node:assert/strict'
import { canPartyResourceCalendarAccess, getPartyResourceCalendarAccess, parsePartyResourceCalendarQuery, markPartyResourceCalendarConflicts, getPartyResourceCalendarLocationIds } from './partyResourceCalendar.js'

const tenantId = 'a'.repeat(24), staffId = 'b'.repeat(24), locationId = 'c'.repeat(24)
const owner = () => ({ tenantId, role: 'owner', staff: { _id: staffId, tenantId, role: 'owner', status: 'active' }, company: { settings: { modules: { ticketing: { enabled: true } } } } })
const scoped = (permissions = {}, scope = {}) => ({ ...owner(), role: 'performer', staff: { ...owner().staff, role: 'performer', positionId: 'd'.repeat(24) }, position: { tenantId, active: true, permissions: { orders: 'read', 'orders.eventDate': 'read', 'orders.dateEnd': 'read', ...permissions }, orderScope: scope } })
const parse = (query) => parsePartyResourceCalendarQuery(new URLSearchParams(query))
const range = 'dateFrom=2026-10-29T00:00:00.000Z&dateTo=2026-11-05T00:00:00.000Z'
const entry = (id, start, end, changes = {}) => ({ id, resourceId: locationId, orderId: id, kind: 'order', start, end, occupiedFrom: start, occupiedUntil: end, ...changes })

test('resource calendar guard is field-aware, tenant-bound and shared across entry points', () => {
  assert.deepEqual(getPartyResourceCalendarAccess(owner()).types.map((row) => row.id), ['location', 'staff', 'inventory'])
  assert.equal(getPartyResourceCalendarAccess(owner()).tickets, true)
  assert.equal(canPartyResourceCalendarAccess(scoped()), false)
  const actor = scoped({ locations: 'read', 'orders.locationId': 'read' })
  assert.deepEqual(getPartyResourceCalendarAccess(actor).types.map((row) => row.id), ['location'])
  assert.equal(canPartyResourceCalendarAccess({ ...actor, position: { ...actor.position, permissions: { ...actor.position.permissions, 'orders.dateEnd': 'hidden' } } }), false)
  assert.equal(canPartyResourceCalendarAccess({ ...owner(), staff: { ...owner().staff, tenantId: staffId } }), false)
  assert.equal(canPartyResourceCalendarAccess({ ...owner(), staff: { ...owner().staff, status: 'paused' } }), false)
})

test('resource catalog, stock and reservations are separate permissions; explicit module-off wins', () => {
  const grants = { inventory: 'read', 'inventory.catalog': 'read', 'inventory.stock': 'read', 'inventory.reservations': 'read' }
  assert.deepEqual(getPartyResourceCalendarAccess(scoped(grants)).types.map((row) => row.id), ['inventory'])
  assert.equal(canPartyResourceCalendarAccess(scoped({ ...grants, 'inventory.stock': 'hidden' })), false)
  const actor = scoped(grants)
  actor.company.settings.modules.inventory = { enabled: false }
  assert.equal(canPartyResourceCalendarAccess(actor), false)
  actor.company.settings.modules.ticketing.enabled = false
  assert.equal(getPartyResourceCalendarAccess(actor).tickets, false)
})

test('range parser accepts offset dates and a DST-spanning week, and normalizes resource ids', () => {
  const parsed = parse(`${range}&type=staff&resourceId=${locationId.toUpperCase()}`)
  assert.equal(parsed.type, 'staff')
  assert.equal(parsed.resourceId, locationId)
  assert.equal(parsed.dateFrom.toISOString(), '2026-10-29T00:00:00.000Z')
  assert.doesNotThrow(() => parse('dateFrom=2026-10-25T00:00:00%2B02:00&dateTo=2026-11-01T00:00:00%2B01:00'))
})

test('malformed, ambiguous, impossible and oversized resource ranges fail before any query', () => {
  for (const query of ['', range + '&type=other', range + '&resourceId=bad', range + '&type=staff&type=location', range + '&dateTo=2026-11-01T00:00:00Z', range + '&calendarCursor=', 'dateFrom=2026-02-30T00:00:00Z&dateTo=2026-03-02T00:00:00Z', 'dateFrom=2026-10-29T00:00:00Z&dateTo=2026-11-07T00:00:00Z', 'dateFrom=2026-11-01T00:00:00Z&dateTo=2026-10-29T00:00:00Z']) assert.throws(() => parse(query), (error) => error.status === 400, query)
})

test('resource search is bounded, unambiguous and trims whitespace without interpreting regular expressions', () => {
  assert.equal(parse(`${range}&resourceSearch=${encodeURIComponent('  [VIP]+  ')}`).resourceSearch, '[VIP]+')
  for (const extra of ['&resourceSearch=one&resourceSearch=two', `&resourceSearch=${'x'.repeat(121)}`, '&resourceSearch=a%00b']) assert.throws(() => parse(range + extra), (error) => error.status === 400)
})

test('location-owner catalog scope intersects company role scope and cannot widen empty membership scope', () => {
  const actor = { ...scoped({}, { locationIds: [locationId] }), role: 'location_owner', staff: { ...scoped().staff, role: 'location_owner', locationIds: [locationId, staffId] } }
  assert.deepEqual(getPartyResourceCalendarLocationIds(actor), [locationId])
  assert.deepEqual(getPartyResourceCalendarLocationIds({ ...actor, staff: { ...actor.staff, locationIds: [] } }), [])
  assert.equal(getPartyResourceCalendarLocationIds(owner()), null)
})

test('staff conflicts use half-open actual intervals and do not flag touching bookings', () => {
  const entries = [entry('one', '2026-10-29T10:00Z', '2026-10-29T11:00Z'), entry('two', '2026-10-29T11:00Z', '2026-10-29T12:00Z'), entry('three', '2026-10-29T10:30Z', '2026-10-29T10:40Z')]
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'staff', entries, resources: [] }).map((row) => row.conflict), [true, false, true])
})

test('shared location orders use the canonical exemption and no private source metadata is returned', () => {
  const source = { sharedLocationBooking: true, partyEventGroupId: 'private-event-id' }
  const entries = [entry('one', '2026-10-29T10:00Z', '2026-10-29T11:00Z', { _source: source }), entry('two', '2026-10-29T10:00Z', '2026-10-29T11:00Z', { _source: source })]
  const result = markPartyResourceCalendarConflicts({ type: 'location', entries, resources: [{ _id: locationId }] })
  assert.deepEqual(result.map((row) => row.conflict), [false, false])
  assert.equal(JSON.stringify(result).includes('private-event-id'), false)
  assert.equal(Object.hasOwn(result[0], '_source'), false)
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'location', entries: entries.map((row) => ({ ...row, _source: {} })), resources: [{ _id: locationId }] }).map((row) => row.conflict), [true, true])
})

test('shared ticket venue capacity counts concurrent capacity, not simple overlap', () => {
  const rows = [entry('one', '2026-10-29T10:00Z', '2026-10-29T11:00Z', { kind: 'ticket_session', capacity: 4 }), entry('two', '2026-10-29T10:30Z', '2026-10-29T12:00Z', { kind: 'ticket_session', capacity: 6 })]
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'location', entries: rows, resources: [{ _id: locationId, usageMode: 'shared', capacity: 10 }] }).map((row) => row.conflict), [false, false])
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'location', entries: rows, resources: [{ _id: locationId, usageMode: 'shared', capacity: 9 }] }).map((row) => row.conflict), [true, true])
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'location', entries: rows, resources: [{ _id: locationId, usageMode: 'exclusive', capacity: 10 }] }).map((row) => row.conflict), [true, true])
})

test('private parties always block overlapping ticket sessions including venue buffers', () => {
  const rows = [entry('private', '2026-10-29T10:00Z', '2026-10-29T11:00Z', { occupiedUntil: '2026-10-29T11:30Z' }), entry('show', '2026-10-29T11:20Z', '2026-10-29T12:00Z', { kind: 'ticket_session', capacity: 1 })]
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'location', entries: rows, resources: [{ _id: locationId, usageMode: 'shared', capacity: 100 }] }).map((row) => row.conflict), [true, true])
})

test('a session exceeding venue capacity is flagged even without another visible booking', () => {
  const rows = [entry('show', '2026-10-29T10:00Z', '2026-10-29T11:00Z', { kind: 'ticket_session', capacity: 11 })]
  assert.equal(markPartyResourceCalendarConflicts({ type: 'location', entries: rows, resources: [{ _id: locationId, usageMode: 'shared', capacity: 10 }] })[0].conflict, true)
})

test('inventory overlaps only warn when simultaneous reserved units exceed usable stock', () => {
  const rows = [entry('one', '2026-10-29T10:00Z', '2026-10-29T11:00Z', { kind: 'inventory', quantity: 2 }), entry('two', '2026-10-29T10:30Z', '2026-10-29T12:00Z', { kind: 'inventory', quantity: 3 })]
  const resources = [{ _id: locationId, quantity: 6, unavailableQuantity: 1, status: 'active' }]
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'inventory', entries: rows, resources }).map((row) => row.conflict), [false, false])
  assert.deepEqual(markPartyResourceCalendarConflicts({ type: 'inventory', entries: rows, resources: [{ ...resources[0], unavailableQuantity: 2 }] }).map((row) => row.conflict), [true, true])
})
