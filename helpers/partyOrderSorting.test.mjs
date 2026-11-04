import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePartyOrderListQuery } from './partyOrderListQuery.js'
import {
  parsePartyOrderSorting,
  encodePartyOrderCursor,
  partyOrderCursorClause,
  partyOrderSortSpec,
} from './partyOrderSorting.js'
import {
  readPartyOrderSortPreference,
  writePartyOrderSortPreference,
} from './partyOrderViewPreference.js'

const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24)
const owner = {
  tenantId,
  role: 'owner',
  staff: { _id: staffId, tenantId, role: 'owner', status: 'active' },
  company: {},
}
test('the existing default cursor remains compatible and explicit sorting validates permission before querying', () => {
  const ordinary = parsePartyOrderListQuery(
    new URLSearchParams(`view=list&listCursor=${'c'.repeat(24)}`),
    owner
  )
  assert.equal(ordinary.sorting, undefined)
  const restricted = {
    ...owner,
    role: 'performer',
    staff: { ...owner.staff, role: 'performer' },
    position: { permissions: { orders: 'read' }, orderScope: {} },
  }
  assert.throws(
    () =>
      parsePartyOrderListQuery(
        new URLSearchParams('view=list&sortBy=amount_desc'),
        restricted
      ),
    { status: 403 }
  )
  assert.throws(
    () =>
      parsePartyOrderListQuery(
        new URLSearchParams('view=list&sortBy=event_asc'),
        restricted
      ),
    { status: 403 }
  )
  assert.throws(
    () =>
      parsePartyOrderListQuery(
        new URLSearchParams('view=list&sortBy=unknown'),
        owner
      ),
    { status: 400 }
  )
})
test('compound cursors bind filters, direction and a stable ID for tied values', () => {
  const sorting = parsePartyOrderSorting(
    new URLSearchParams('sortBy=event_asc&q=Шоу'),
    owner
  )
  const cursor = encodePartyOrderCursor(sorting, {
    _id: 'c'.repeat(24),
    eventDate: '2026-11-04T05:00:00Z',
  })
  const next = parsePartyOrderSorting(
    new URLSearchParams({ sortBy: 'event_asc', q: 'Шоу', listCursor: cursor }),
    owner
  )
  const clause = partyOrderCursorClause(next, next.point)
  assert.equal(clause.$or[0]._partyUndated.$gt, 0)
  assert.equal(clause.$or[1].$or[1]._id.$gt, 'c'.repeat(24))
  assert.throws(
    () =>
      parsePartyOrderSorting(
        new URLSearchParams({
          sortBy: 'event_desc',
          q: 'Шоу',
          listCursor: cursor,
        }),
        owner
      ),
    { status: 400 }
  )
  assert.throws(
    () =>
      parsePartyOrderSorting(
        new URLSearchParams({
          sortBy: 'event_asc',
          q: 'Другое',
          listCursor: cursor,
        }),
        owner
      ),
    { status: 400 }
  )
})
test('undated orders sort last in both event directions and their continuation uses the same tie breaker', () => {
  for (const sortBy of ['event_asc', 'event_desc']) {
    const sorting = parsePartyOrderSorting(
      new URLSearchParams({ sortBy }),
      owner
    )
    const spec = partyOrderSortSpec(sorting)
    assert.equal(spec._partyUndated, 1)
    const point = JSON.parse(
      decodeURIComponent(
        encodePartyOrderCursor(sorting, {
          _id: 'c'.repeat(24),
          eventDate: null,
        })
      )
    )
    assert.equal(point.undated, 1)
    assert.equal(point.value, null)
    const clause = partyOrderCursorClause(sorting, point)
    assert.equal(
      clause.$or[1].$or[1]._id[sortBy.endsWith('asc') ? '$gt' : '$lt'],
      'c'.repeat(24)
    )
  }
})
test('sort preferences are independent for each company and staff and tolerate unavailable storage', () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    }
  writePartyOrderSortPreference(tenantId, staffId, 'amount_desc', storage)
  assert.equal(
    readPartyOrderSortPreference(tenantId, staffId, storage),
    'amount_desc'
  )
  assert.equal(
    readPartyOrderSortPreference('c'.repeat(24), staffId, storage),
    'created_desc'
  )
  assert.equal(
    readPartyOrderSortPreference(tenantId, 'd'.repeat(24), storage),
    'created_desc'
  )
  assert.equal(
    readPartyOrderSortPreference(tenantId, staffId, {
      getItem() {
        throw Error('disabled')
      },
    }),
    'created_desc'
  )
})
