import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findPartyOrderConflicts,
  hasPartyOrderConflicts,
} from './partyOrderConflicts.js'

const createQuery = (items) => ({
  select() {
    return this
  },
  lean() {
    return Promise.resolve(items)
  },
})

test('findPartyOrderConflicts detects overlapping location and staff bookings', async () => {
  const calls = []
  const PartyOrders = {
    find(query) {
      calls.push(query)
      if (query.locationId) {
        return createQuery([{ _id: 'location-conflict' }])
      }
      if (query['assignedStaff.staffId']) {
        return createQuery([{ _id: 'staff-conflict' }])
      }
      return createQuery([])
    },
  }

  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: 'company-1',
    payload: {
      eventDate: new Date('2026-07-01T10:00:00.000Z'),
      dateEnd: new Date('2026-07-01T12:00:00.000Z'),
      placeType: 'company_location',
      locationId: 'location-1',
      assignedStaff: [{ staffId: 'staff-1' }],
    },
    excludeOrderId: 'order-1',
  })

  assert.equal(hasPartyOrderConflicts(conflicts), true)
  assert.deepEqual(conflicts.locationConflicts, [{ _id: 'location-conflict' }])
  assert.deepEqual(conflicts.staffConflicts, [{ _id: 'staff-conflict' }])
  assert.equal(calls.length, 2)
  assert.equal(calls[0].tenantId, 'company-1')
  assert.deepEqual(calls[0].status, { $nin: ['canceled', 'closed'] })
  assert.deepEqual(calls[0]._id, { $ne: 'order-1' })
  assert.equal(calls[0].locationId, 'location-1')
  assert.deepEqual(calls[1]['assignedStaff.staffId'], { $in: ['staff-1'] })
})

test('findPartyOrderConflicts skips checks without a complete date range', async () => {
  const PartyOrders = {
    find() {
      throw new Error('find should not be called without dates')
    },
  }

  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: 'company-1',
    payload: { placeType: 'company_location', locationId: 'location-1' },
  })

  assert.deepEqual(conflicts, {
    locationConflicts: [],
    staffConflicts: [],
  })
  assert.equal(hasPartyOrderConflicts(conflicts), false)
})

test('shared venue excludes trusted members only from location lookup, never staff or external bookings', async () => {
  const calls = []
  const PartyOrders = { find(query) {
    calls.push(query)
    const rows = query.locationId
      ? [{ _id: 'part-2' }, { _id: 'external-order' }]
      : [{ _id: 'part-2' }]
    return createQuery(rows.filter(row => !query._id?.$nin?.includes(row._id)))
  } }
  const conflicts = await findPartyOrderConflicts({
    PartyOrders, tenantId: 'company', excludeOrderId: 'part-1',
    sharedLocationOrderIds: ['part-1', 'part-2'],
    payload: { eventDate: new Date(), dateEnd: new Date(Date.now() + 3600000),
      placeType: 'company_location', locationId: 'location', assignedStaff: [{ staffId: 'staff' }] },
  })
  assert.deepEqual(conflicts.locationConflicts, [{ _id: 'external-order' }])
  assert.deepEqual(conflicts.staffConflicts, [{ _id: 'part-2' }])
  assert.deepEqual(calls[1]._id, { $ne: 'part-1' })
  assert.equal(calls[0].tenantId, 'company')
})

test('new orders cannot claim shared venue exclusions without an existing order', async () => {
  const calls = []
  await findPartyOrderConflicts({
    PartyOrders: { find(query) { calls.push(query); return createQuery([]) } },
    tenantId: 'company', sharedLocationOrderIds: ['forged'],
    payload: { eventDate: new Date(), dateEnd: new Date(), placeType: 'company_location', locationId: 'location' },
  })
  assert.equal(calls[0]._id, undefined)
})
